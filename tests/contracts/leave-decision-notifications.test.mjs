import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20261015195145_hris_leave_decision_notifications.sql');
const component = read('../../src/live/ProjectNotifications.tsx');
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const locale = read('../../src/live/project-locale.ts');
const runner = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-leave-evidence-browser.mjs');

test('leave decision notifications are persisted by the existing tenant leave decision transition', () => {
  assert.match(migration, /CREATE TABLE public\.leave_request_notifications/);
  assert.match(migration, /FOREIGN KEY \(tenant_id,leave_request_id\)[\s\S]+?REFERENCES public\.leave_requests\(tenant_id,id\)/);
  assert.match(migration, /FOREIGN KEY \(tenant_id,recipient_employee_id\)[\s\S]+?REFERENCES public\.employees\(tenant_id,id\)/);
  assert.match(migration, /UNIQUE \(tenant_id,recipient_employee_id,leave_request_id,kind\)/);
  assert.match(migration, /ALTER TABLE public\.leave_request_notifications ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.leave_request_notifications FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /GRANT SELECT ON public\.leave_request_notifications TO authenticated/);
  assert.match(migration, /hris_own_employee_for_tenant\(tenant_id\)=recipient_employee_id/);
  assert.match(migration, /CREATE TRIGGER leave_decision_notification_after_update[\s\S]+?AFTER UPDATE OF status ON public\.leave_requests/);
  assert.match(migration, /OLD\.status='pending' AND NEW\.status IN \('approved','rejected'\)/);
  assert.match(migration, /NEW\.resolved_at IS NULL OR NEW\.resolved_by IS NULL/);
  assert.match(migration, /ON CONFLICT \(tenant_id,recipient_employee_id,leave_request_id,kind\) DO NOTHING/);
  assert.match(migration, /'project_review','learning_completion','travel_decision','leave_decision'/);
  assert.match(migration, /'leave_request_id',n\.leave_request_id/);
  assert.match(migration, /'leave_type_name',n\.leave_type_name/);
  assert.match(migration, /'leave_from_date',n\.leave_from_date/);
  assert.match(migration, /'leave_to_date',n\.leave_to_date/);
  assert.match(migration, /leave decisions remain historical updates without a read-state policy/);
});

test('notification opens the matching leave history row and supports Bengali', () => {
  assert.match(component, /source: 'leave_decision'/);
  assert.match(component, /data-notification-request-id=\{isLeaveDecision \? item\.leave_request_id : undefined\}/);
  assert.match(component, /onOpenLeave\(item\.leave_request_id\)/);
  assert.match(workspace, /const openLeaveRequest = \(requestId: string\) => \{ setLeaveFocusRequestId\(requestId\); navigate\('my-leave'\); \}/);
  assert.match(workspace, /focusRequestId=\{leaveFocusRequestId\} onFocusHandled=\{clearLeaveRequestFocus\}/);
  assert.match(workspace, /data-leave-request-id=\{String\(row\.id \|\| ''\)\}/);
  for (const phrase of ['Leave update','Leave request approved','Leave request rejected',
    'Your leave request was approved.','Your leave request was rejected.','Open leave']) {
    assert.ok(locale.includes(`'${phrase}':`), `missing Bengali leave notification translation: ${phrase}`);
  }
  assert.match(browser, /data-notification-request-id/);
  assert.match(browser, /ছুটির অনুরোধ অনুমোদিত/);
  assert.match(browser, /ছুটির তথ্য খুলুন/);
  assert.match(browser, /Leave decision notifications mobile/);
  assert.match(browser, /Leave decision notifications desktop/);
});

test('isolated Auth/RLS acceptance covers immutable owner reads, tenant privacy, and both decision outcomes', () => {
  assert.ok(runner.includes('20261015195145_hris_leave_decision_notifications.sql'));
  assert.match(runner, /Leave decision notifications persist atomically and are owner-readable, tenant-isolated, and immutable to client roles/);
  assert.match(runner, /leaveApprovalNotificationA/);
  assert.match(runner, /leaveRejectionNotificationA/);
  assert.match(runner, /leaveApprovalNotificationB/);
  assert.match(runner, /directLeaveDecisionInsert\.error/);
  assert.match(runner, /directLeaveDecisionUpdate\.error/);
  assert.match(runner, /directLeaveDecisionDelete\.error/);
  assert.match(runner, /HRIS_LOCAL_LEAVE_REJECTION_REQUEST_ID: leaveRejectionRequestId/);
  assert.match(browser, /HRIS_LOCAL_LEAVE_REJECTION_REQUEST_ID/);
  assert.match(browser, /focusedUiRequestId !== uiLeaveRequestId/);
  assert.match(browser, /focusedRejectedRequestId !== process\.env\.HRIS_LOCAL_LEAVE_REJECTION_REQUEST_ID/);
  assert.match(browser, /LEAVE_EVIDENCE_BROWSER_ACCEPTANCE=PASS/);
  assert.match(runner, /leaveEvidenceBrowserOutput\.includes\('LEAVE_EVIDENCE_BROWSER_ACCEPTANCE=PASS'\)/);
});

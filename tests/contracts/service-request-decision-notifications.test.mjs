import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20261016141629_hris_service_request_decision_notifications.sql');
const notifications = read('../../src/live/ProjectNotifications.tsx');
const employeePage = read('../../src/live/MyServiceRequests.tsx');
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const locale = read('../../src/live/project-locale.ts');
const runner = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-service-requests-browser.mjs');

test('service-request terminal notifications are transactionally created and owner-only', () => {
  assert.match(migration, /CREATE TABLE public\.service_request_notifications/);
  assert.match(migration, /FOREIGN KEY \(tenant_id,service_request_id\)[\s\S]+?REFERENCES public\.service_requests\(tenant_id,id\)/);
  assert.match(migration, /FOREIGN KEY \(tenant_id,recipient_employee_id\)[\s\S]+?REFERENCES public\.employees\(tenant_id,id\)/);
  assert.match(migration, /kind text NOT NULL CHECK \(kind IN \('completed','rejected'\)\)/);
  assert.match(migration, /UNIQUE \(tenant_id,recipient_employee_id,service_request_id,kind\)/);
  assert.match(migration, /ALTER TABLE public\.service_request_notifications ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.service_request_notifications FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /GRANT SELECT ON public\.service_request_notifications TO authenticated/);
  assert.match(migration, /hris_own_employee_for_tenant\(tenant_id\)=recipient_employee_id/);
  assert.match(migration, /OLD\.status IN \('pending','in_progress'\) AND NEW\.status IN \('completed','rejected'\)/);
  assert.match(migration, /NEW\.resolved_at IS NULL OR NEW\.resolved_by IS NULL/);
  assert.match(migration, /ON CONFLICT \(tenant_id,recipient_employee_id,service_request_id,kind\) DO NOTHING/);
  assert.match(migration, /'project_review','learning_completion','travel_decision','leave_decision','service_request_decision'/);
  assert.match(migration, /'service_request_id',n\.service_request_id/);
  assert.match(migration, /'service_request_type',n\.service_request_type/);
  assert.match(migration, /service-request decisions remain historical updates without a read-state policy/);
});

test('employee notification opens and focuses the persisted request history in EN/BN', () => {
  assert.match(notifications, /source: 'service_request_decision'/);
  assert.match(notifications, /onOpenServiceRequest\(item\.service_request_id\)/);
  assert.match(workspace, /const openServiceRequest = \(requestId: string\) => \{ setServiceRequestFocusId\(requestId\); navigate\('my-service-requests'\); \}/);
  assert.match(workspace, /onOpenServiceRequest=\{openServiceRequest\}/);
  assert.match(workspace, /focusRequestId=\{serviceRequestFocusId\} onFocusHandled=\{clearServiceRequestFocus\}/);
  assert.match(employeePage, /data-service-request=\{request\.id\} tabIndex=\{-1\}/);
  assert.match(employeePage, /target\.focus\(\{ preventScroll: true \}\)/);
  for (const phrase of ['Project review alerts, learning completion decisions, travel requests, leave, and service request outcomes from your organization.',
    'Service request update','Service request completed','Service request rejected','Your service request was completed.',
    'Your service request was rejected.','Open service request']) {
    assert.ok(locale.includes(`'${phrase}':`), `missing Bengali notification translation: ${phrase}`);
  }
  assert.match(browser, /data-notification-source="service_request_decision"/);
  assert.match(browser, /পরিষেবা অনুরোধ সম্পন্ন হয়েছে/);
  assert.match(browser, /পরিষেবা অনুরোধ খুলুন/);
});

test('isolated acceptance proves persisted owner delivery, terminal outcomes, tenant privacy, and immutable notifications', () => {
  assert.ok(runner.includes('20261016141629_hris_service_request_decision_notifications.sql'));
  assert.match(runner, /Service-request decision notifications are owner-readable, tenant-isolated, immutable, and linked to terminal history/);
  assert.match(runner, /serviceRequestCompletedNotificationA/);
  assert.match(runner, /serviceRequestRejectedNotificationA/);
  assert.match(runner, /serviceRequestNotificationIntegrity/);
  assert.match(runner, /directServiceRequestNotificationInsert\.error/);
  assert.match(runner, /directServiceRequestNotificationUpdate\.error/);
  assert.match(runner, /directServiceRequestNotificationDelete\.error/);
  assert.match(browser, /getByRole\('button', \{ name: 'রিফ্রেশ', exact: true \}\)/);
  assert.match(browser, /SERVICE_REQUEST_NOTIFICATION_ACCEPTANCE=PASS/);
  assert.match(runner, /serviceBrowserOutput\.includes\('SERVICE_REQUEST_NOTIFICATION_ACCEPTANCE=PASS'\)/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/20261013210500_hris_employee_service_request_self_service.sql', import.meta.url), 'utf8');
const reviewMigration = readFileSync(new URL('../../supabase/migrations/20261016061104_hris_employee_service_request_review.sql', import.meta.url), 'utf8');
const component = readFileSync(new URL('../../src/live/MyServiceRequests.tsx', import.meta.url), 'utf8');
const reviewComponent = readFileSync(new URL('../../src/live/ServiceRequestReview.tsx', import.meta.url), 'utf8');
const locale = readFileSync(new URL('../../src/live/service-request-locale.ts', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const localRunner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');

test('service-request RPCs require a live linked employee in an active tenant and use the verified request types', () => {
  assert.match(migration, /IF NOT public\.is_live_session\(\)/);
  assert.match(migration, /t\.id=p_tenant_id AND t\.is_active IS TRUE/);
  assert.match(migration, /public\.hris_own_employee_for_tenant\(p_tenant_id\)/);
  for (const requestType of [
    'employment_certificate', 'noc_letter', 'salary_certificate', 'other',
    'work_from_home', 'movement', 'shift_change', 'shift_swap',
  ]) assert.ok(migration.includes(`'${requestType}'`), `Missing existing request type ${requestType}`);
  assert.match(migration, /'pending'/);
  assert.match(migration, /submitted_by,submitted_at/);
});

test('service-request tables are read-only to clients and RPC execute grants exclude anonymous callers', () => {
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER\s+ON public\.service_requests FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_submit_my_service_request\(uuid,text,text\) FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.hris_submit_my_service_request\(uuid,text,text\) TO authenticated, service_role/);
  assert.match(localRunner, /serviceRequestWrongTenant/);
  assert.match(localRunner, /serviceRequestDirectInsert/);
  assert.match(localRunner, /anonServiceRequestSubmit/);
});

test('employee service-request UI submits through scoped RPCs and recovers history after refresh', () => {
  assert.match(component, /hris_get_my_service_requests/);
  assert.match(component, /hris_submit_my_service_request/);
  assert.match(component, /serviceRequestText\(locale, english\)/);
  assert.match(locale, /'Refresh my service requests': 'আমার পরিষেবা অনুরোধ রিফ্রেশ করুন'/);
  assert.match(locale, /'No service requests yet': 'এখনও কোনো পরিষেবা অনুরোধ নেই'/);
  assert.match(locale, /'Unable to complete this service request\. Try again\.': 'পরিষেবা অনুরোধটি সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।'/);
  assert.match(component, /role="alert"/);
  assert.match(component, /disabled=\{submitting \|\| !reason\.trim\(\)\}/);
  assert.match(workspace, /page === 'my-service-requests' && isEmployee/);
  assert.match(workspace, /id: 'my-service-requests', label: 'My Requests'/);
  assert.match(workspace, /MyServiceRequests tenantId=\{tenantId\} locale=\{locale\}/);
  assert.match(localRunner, /run-service-requests-browser\.mjs/);
  assert.match(readFileSync(new URL('../sql/isolated-auth/run-service-requests-browser.mjs', import.meta.url), 'utf8'), /Switch language to Bengali/);
  assert.match(readFileSync(new URL('../sql/isolated-auth/run-service-requests-browser.mjs', import.meta.url), 'utf8'), /Bengali service request desktop/);
});

test('HR service-request review is tenant-scoped to employees.manage and limits transitions with concurrency-safe outcomes', () => {
  assert.match(reviewMigration, /public\.has_tenant_permission\(p_tenant_id,'employees\.manage'\)/);
  assert.match(reviewMigration, /p_expected_status/);
  assert.match(reviewMigration, /FOR UPDATE/);
  assert.match(reviewMigration, /v_request\.status IS DISTINCT FROM p_expected_status/);
  assert.match(reviewMigration, /pending.*in_progress.*rejected/s);
  assert.match(reviewMigration, /p_expected_status='in_progress' AND p_next_status IN \('completed','rejected'\)/);
  assert.match(reviewMigration, /p_next_status='completed' AND v_note IS NULL/);
  assert.match(reviewMigration, /p_next_status='rejected' AND v_note IS NULL/);
  assert.match(reviewMigration, /CREATE TABLE public\.service_request_status_history/);
  assert.match(reviewMigration, /ALTER TABLE public\.service_request_status_history ENABLE ROW LEVEL SECURITY/);
  assert.match(reviewMigration, /INSERT INTO public\.admin_audit_logs/);
  assert.match(reviewMigration, /GRANT EXECUTE ON FUNCTION public\.hris_resolve_tenant_service_request\(uuid,uuid,text,text,text\) TO authenticated/);
  assert.match(reviewMigration, /REVOKE ALL ON FUNCTION public\.hris_resolve_tenant_service_request\(uuid,uuid,text,text,text\) FROM PUBLIC,anon/);
  assert.match(localRunner, /workflowReviewerServiceQueue/);
  assert.match(localRunner, /wrongTenantManagerServiceQueue/);
  assert.match(localRunner, /duplicateCompletedDecision/);
  assert.match(localRunner, /completeWithoutOutcome/);
  assert.match(localRunner, /rejectWithoutReason/);
  assert.match(localRunner, /service_request_status_history/);
});

test('HR review queue supports decision validation, refresh recovery, request history, and existing responsive navigation', () => {
  assert.match(reviewComponent, /hris_get_tenant_service_requests/);
  assert.match(reviewComponent, /hris_resolve_tenant_service_request/);
  assert.match(reviewComponent, /Start review/);
  assert.match(reviewComponent, /Complete request/);
  assert.match(reviewComponent, /Rejection reason/);
  assert.match(reviewComponent, /Resolution outcome/);
  assert.match(reviewComponent, /disabled=\{savingId === request\.id \|\| !decision\.note\.trim\(\)\}/);
  assert.match(reviewComponent, /Refresh before retrying/);
  assert.match(reviewComponent, /No requests match this status/);
  assert.match(reviewComponent, /request\.history/);
  assert.match(reviewComponent, /serviceRequestText\(locale, english\)/);
  assert.match(workspace, /id: 'service-requests', label: 'Service Requests'/);
  assert.match(workspace, /page === 'service-requests' && permissions\.employeesManage/);
  assert.match(readFileSync(new URL('../sql/isolated-auth/run-service-requests-browser.mjs', import.meta.url), 'utf8'), /HRIS_LOCAL_SERVICE_MANAGER_EMAIL/);
  assert.match(readFileSync(new URL('../sql/isolated-auth/run-service-requests-browser.mjs', import.meta.url), 'utf8'), /Bengali service request manager mobile/);
});

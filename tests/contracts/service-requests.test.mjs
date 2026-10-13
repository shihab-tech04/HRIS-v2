import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/20261013210500_hris_employee_service_request_self_service.sql', import.meta.url), 'utf8');
const component = readFileSync(new URL('../../src/live/MyServiceRequests.tsx', import.meta.url), 'utf8');
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
  assert.match(component, /Refresh my service requests/);
  assert.match(component, /role="alert"/);
  assert.match(component, /No service requests yet/);
  assert.match(component, /disabled=\{submitting \|\| !reason\.trim\(\)\}/);
  assert.match(workspace, /page === 'my-service-requests' && isEmployee/);
  assert.match(workspace, /id: 'my-service-requests', label: 'My Requests'/);
  assert.match(localRunner, /run-service-requests-browser\.mjs/);
});

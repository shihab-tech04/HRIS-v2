import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const original = read('../../supabase/migrations/20261016061104_hris_employee_service_request_review.sql');
const recovered = read('../../supabase/migrations/20261109174000_hris_service_request_legacy_contract_forward_port.sql');
const employee = read('../../src/live/MyServiceRequests.tsx');
const review = read('../../src/live/ServiceRequestReview.tsx');

const api = [
  'hris_get_my_service_requests',
  'hris_submit_my_service_request',
  'hris_get_tenant_service_requests',
  'hris_resolve_tenant_service_request',
];
function sourceOf(sql, name) {
  const begin = sql.indexOf('CREATE OR REPLACE FUNCTION public.' + name + '(');
  assert.notEqual(begin, -1, name + ' missing from source');
  const end = sql.indexOf('$function$;', begin);
  assert.notEqual(end, -1, name + ' missing SQL terminator');
  return sql.slice(begin, end + '$function$;'.length);
}

test('recovery reuses all four previously approved functions byte-for-byte', () => {
  for (const name of api) {
    assert.equal(sourceOf(recovered, name), sourceOf(original, name), name + ' differs from approved source');
  }
  assert.match(recovered, /SELECT r\.\* INTO v_request[\s\S]*FOR UPDATE/);
  assert.match(recovered, /v_request\.status IS DISTINCT FROM p_expected_status/);
  assert.match(recovered, /public\.has_tenant_permission\(p_tenant_id,'employees\.manage'\)/);
  assert.match(recovered, /p_expected_status='pending' AND p_next_status IN \('in_progress','rejected'\)/);
  assert.match(recovered, /p_expected_status='in_progress' AND p_next_status IN \('completed','rejected'\)/);
  assert.match(recovered, /INSERT INTO public\.service_request_status_history/);
  assert.match(recovered, /INSERT INTO public\.admin_audit_logs/);
});

test('new history table is RPC-only, RLS-enabled, with original integrity and indexes', () => {
  const ddl = recovered.match(/CREATE TABLE public\.service_request_status_history \([\s\S]*?REVOKE ALL ON public\.service_request_status_history FROM PUBLIC,anon,authenticated;/)?.[0];
  assert.ok(ddl, 'existing approved status-history DDL must be intact');
  assert.ok(original.includes(ddl), 'status-history table definition drifted from original');
  assert.match(ddl, /tenant_id uuid NOT NULL REFERENCES public\.tenants/);
  assert.match(ddl, /service_request_id uuid NOT NULL REFERENCES public\.service_requests/);
  assert.match(ddl, /ALTER TABLE public\.service_request_status_history ENABLE ROW LEVEL SECURITY/);
  assert.match(ddl, /CREATE INDEX service_request_status_history_request_idx/);
  assert.doesNotMatch(recovered, /CREATE POLICY|DROP POLICY|ALTER TABLE public\.service_requests|DISABLE ROW LEVEL SECURITY/i);
});

test('release fails closed on schema drift and never grants anonymous or direct table writes', () => {
  assert.match(recovered, /to_regclass\('public\.service_request_status_history'\) IS NOT NULL/);
  assert.match(recovered, /to_regprocedure\('public\.hris_get_my_service_requests\(uuid\)'\) IS NOT NULL/);
  assert.match(recovered, /to_regprocedure\('public\.hris_resolve_tenant_service_request\(uuid,uuid,text,text,text\)'\) IS NOT NULL/);
  assert.match(recovered, /GRANT EXECUTE ON FUNCTION public\.hris_get_my_service_requests\(uuid\) TO authenticated,service_role/);
  assert.match(recovered, /GRANT EXECUTE ON FUNCTION public\.hris_resolve_tenant_service_request\(uuid,uuid,text,text,text\) TO authenticated/);
  assert.doesNotMatch(recovered, /\bGRANT (?:SELECT|INSERT|UPDATE|DELETE) ON public\.service_requests\b/i);
  assert.doesNotMatch(recovered, /\bGRANT EXECUTE\b[^;]+?\bTO (?:PUBLIC|anon)\b/i);
  assert.doesNotMatch(recovered, /\b(?:DROP TABLE|TRUNCATE|DELETE FROM)\b/i);
  assert.doesNotMatch(recovered, /\b(?:auth\.users|public\.employees)\b[^;]*?\bUPDATE\b/i);
});

test('existing UI retains exact RPC calls and approved request flows', () => {
  for (const name of api.slice(0, 2)) assert.ok(employee.includes(name), name);
  for (const name of api.slice(2)) assert.ok(review.includes(name), name);
  assert.match(employee, /work_from_home/);
  assert.match(employee, /shift_swap/);
  assert.match(review, /Refresh before retrying/);
});

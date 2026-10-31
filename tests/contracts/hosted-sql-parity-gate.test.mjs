import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../', import.meta.url);
const query = readFileSync(new URL('tests/sql/hosted-parity/check-read-only.sql', root), 'utf8');
const workflow = readFileSync(new URL('.github/workflows/disposable-auth-postgres-acceptance.yml', root), 'utf8');
const localParityHarness = readFileSync(new URL('tests/sql/hosted-parity/run-local.mjs', root), 'utf8');
const migrationNames = [
  '20261017010000_hris_employee_document_self_service.sql',
  '20261017020000_hris_employee_identity_card.sql',
  '20261017030000_hris_employee_announcement_audience.sql',
  '20261017040000_hris_employee_dashboard_work_identity.sql',
  '20261017050000_hris_employee_dashboard_team_identity.sql',
  '20261017060000_hris_employee_dashboard_pending_requests.sql',
  '20261017060001_hris_employee_unavailable_leave_type_reason.sql',
  '20261017074518_hris_employee_attendance_correction_existing_record.sql',
  '20261017092147_employee_directory_team_filter.sql',
  '20261017095321_roster_shift_change_history.sql',
  '20261017100000_employee_profile_change_request_tenant_scope.sql',
  '20261017130000_employee_profile_change_schema_contract.sql',
  '20261027040642_employee_profile_tenant_scoped_contract.sql',
];

test('hosted parity SQL remains a read-only catalog probe', () => {
  assert.match(query, /WITH required_procedures\(/);
  assert.match(query, /to_regprocedure\(signature\)/);
  assert.match(query, /to_regclass\(signature\)/);
  assert.match(query, /pg_policies/);
  assert.doesNotMatch(query, /(?:^|\n)\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO|EXECUTE)\s/i);
});

test('all latest migration RPC signatures are covered by the hosted probe', () => {
  const allSource = migrationNames.map(name => readFileSync(new URL(`supabase/migrations/${name}`, root), 'utf8')).join('\n');
  const defined = [...allSource.matchAll(/CREATE OR REPLACE FUNCTION\s+((?:public|private)\.[a-z_]+)\s*\(/gi)]
    .map(m => m[1]);
  for (const name of new Set(defined)) {
    assert.ok(query.includes(`${name}(`), `missing hosted probe for ${name}`);
  }
  assert.match(query, /public\.roster_change_notifications/);
  assert.match(query, /public\.has_tenant_permission\(uuid,text\)/);
  assert.match(query, /public\.hris_is_active_tenant_member\(uuid\)/);
  assert.match(query, /legacy tenant-implicit RPC absent/);
});

test('disposable Auth/Postgres acceptance rehearses notices transition and executes all 55 Phase 04 parity checks', () => {
  const authJourney = workflow.indexOf('node tests/sql/isolated-auth/run-local.mjs');
  const parityJourney = workflow.indexOf('node tests/sql/hosted-parity/run-local.mjs');
  assert.ok(authJourney >= 0 && parityJourney > authJourney, 'parity runs on the schema built by the Auth-tested source migrations');
  assert.doesNotMatch(workflow, /PHASE04_SUPABASE_TEST_WORKDIR|supabase db reset/i);
  assert.match(localParityHarness, /tests\/sql\/hosted-parity\/check-read-only\.sql/);
  assert.match(query, /hris_notices_legacy_security_guard/);
  assert.match(query, /NOT EXISTS/);
  assert.ok(localParityHarness.includes('hosted-legacy-notices/retire-legacy-security-guard.staging.sql'));
  assert.match(localParityHarness, /CREATE POLICY hris_notices_legacy_security_guard/);
  assert.match(localParityHarness, /ROLLBACK;/);
  assert.match(localParityHarness, /rows\.length !== 55/);
  assert.match(localParityHarness, /failures\.length/);
  assert.match(localParityHarness, /synesis-local-hris-test/);
  assert.match(localParityHarness, /storage\.buckets/);
  assert.match(localParityHarness, /employee-documents/);
  assert.doesNotMatch(localParityHarness, /synesis-local-hris-parity-test/);
});

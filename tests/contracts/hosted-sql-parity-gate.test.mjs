import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../', import.meta.url);
const query = readFileSync(new URL('tests/sql/hosted-parity/check-read-only.sql', root), 'utf8');
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

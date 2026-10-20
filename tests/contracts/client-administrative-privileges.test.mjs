import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261020132112_revoke_client_administrative_table_privileges.sql', import.meta.url),
  'utf8',
);
const disposable = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');

test('client roles lose only table administrative privileges on the five verified tables', () => {
  assert.match(migration, /REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE/i);
  for (const table of [
    'leave_requests', 'leave_types', 'candidate_job_alerts',
    'employee_addresses', 'employee_family_members',
  ]) {
    assert.match(migration, new RegExp(`\\bpublic\\.${table}\\b`));
  }
  assert.match(migration, /FROM PUBLIC, anon, authenticated\s*;/i);
  assert.doesNotMatch(migration, /^\s*(?:GRANT|ALTER|DROP|TRUNCATE|DELETE|INSERT|UPDATE|CREATE)\b/im);
  assert.doesNotMatch(migration, /REVOKE\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)\b/i);
});

test('disposable Auth/Postgres harness applies and verifies the ACL correction', () => {
  assert.match(disposable, /20261020132112_revoke_client_administrative_table_privileges\.sql/);
  assert.match(disposable, /has_table_privilege\([\s\S]*'TRUNCATE'/);
  assert.match(disposable, /Administrative client privileges remain after the correction/);
});

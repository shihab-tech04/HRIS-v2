import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261020132112_revoke_client_administrative_table_privileges.sql', import.meta.url),
  'utf8',
);
const disposable = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const fixture = readFileSync(new URL('../sql/client-privileges/fixture.sql', import.meta.url), 'utf8');
const assertion = readFileSync(new URL('../sql/client-privileges/assert.sql', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../.github/workflows/client-privilege-postgres.yml', import.meta.url), 'utf8');

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

test('PostgreSQL 17 CI reproduces the excessive grants and proves CRUD and service-role parity', () => {
  assert.match(workflow, /image: postgres:17/);
  assert.match(workflow, /pull_request:\s*\n\s*branches: \[development\/hris-checkpoints\]/);
  assert.match(workflow, /-f tests\/sql\/client-privileges\/fixture\.sql/);
  assert.match(workflow, /-f supabase\/migrations\/20261020132112_revoke_client_administrative_table_privileges\.sql/);
  assert.match(workflow, /-f tests\/sql\/client-privileges\/assert\.sql/);
  assert.match(fixture, /GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN/);
  assert.match(assertion, /client_dml_count <> 40/);
  assert.match(assertion, /service_maintenance_count <> 20/);
  assert.match(assertion, /elevated_count <> 0/);
  assert.match(assertion, /rls_count <> 5/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261021060748_employee_addresses_tenant_read_guard.sql', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../.github/workflows/employee-addresses-postgres.yml', import.meta.url), 'utf8');
const fixture = readFileSync(new URL('../sql/employee-addresses/fixture.sql', import.meta.url), 'utf8');
const acceptance = readFileSync(new URL('../sql/employee-addresses/verify.sql', import.meta.url), 'utf8');

test('address reads use existing tenant membership authorization instead of the global legacy policy', () => {
  assert.match(migration, /DROP POLICY IF EXISTS employee_addresses_admin_read/);
  assert.match(migration, /CREATE POLICY employee_addresses_tenant_admin_read[\s\S]*AS PERMISSIVE[\s\S]*hris_admin_can_read_tenant\(e\.tenant_id, 'employees\.view'\)[\s\S]*hris_admin_can_read_tenant\(e\.tenant_id, 'employees\.manage'\)/);
  assert.match(migration, /CREATE POLICY employee_addresses_tenant_guard[\s\S]*AS RESTRICTIVE[\s\S]*hris_own_employee_for_tenant\(e\.tenant_id\)[\s\S]*hris_admin_can_read_tenant/);
  assert.match(migration, /to_regprocedure\('public\.hris_admin_can_read_tenant\(uuid,text\)'\)/);
  assert.doesNotMatch(migration, /public\.has_permission\s*\(/);
});

test('disposable acceptance exercises two tenants, employee ownership, least privilege, and fail-closed cases', () => {
  assert.match(fixture, /CREATE TABLE public\.tenant_memberships/);
  assert.match(fixture, /CREATE POLICY hris_employees_tenant_read_guard[\s\S]*AS RESTRICTIVE/);
  assert.match(acceptance, /Tenant one employee manager sees tenant one addresses only/);
  assert.match(acceptance, /Tenant two employee manager sees tenant two addresses only/);
  assert.match(acceptance, /tenant one view-only role/);
  assert.match(acceptance, /global employee permission without tenant membership/);
  assert.match(acceptance, /inactive tenant membership/);
  assert.match(acceptance, /inactive session/);
  assert.match(acceptance, /Anonymous session/);
  assert.match(acceptance, /Authenticated client inserted/);
  assert.match(acceptance, /Authenticated client updated/);
  assert.match(acceptance, /Authenticated client deleted/);
});

test('address privacy workflow runs only synthetic PostgreSQL and applies the source migration', () => {
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /POSTGRES_PASSWORD: synthetic_test_only/);
  assert.match(workflow, /20261021060748_employee_addresses_tenant_read_guard\.sql/);
  assert.match(workflow, /tests\/sql\/employee-addresses\/verify\.sql/);
  assert.doesNotMatch(workflow, /SUPABASE_URL|SERVICE_ROLE_KEY|service_role_key/i);
});

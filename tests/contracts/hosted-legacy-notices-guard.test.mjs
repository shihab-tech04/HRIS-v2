import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (name) => readFileSync(
  new URL(`../../supabase/staging/hosted-legacy-notices/${name}`, import.meta.url),
  'utf8',
);

test('legacy notices hotfix fails closed when hosted topology or policy changes', () => {
  const sql = read('apply-restrictive-read-guard.staging.sql');
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(sql, /count\(\*\) FROM public\.tenant_memberships\) <> 0/);
  assert.match(sql, /slug = 'synesis-it' AND is_active IS TRUE/);
  assert.match(sql, /polname = 'notices_read'/);
  assert.match(sql, /'hris_notices_membership_guard'/);
  assert.match(sql, /active IS TRUE AND n\.tenant_id <> public\.synesis_tenant_id\(\)/);
  assert.match(sql, /lock_timeout = '5s'/);
});

test('restrictive rule is single-tenant and grants no new public access', () => {
  const sql = read('apply-restrictive-read-guard.staging.sql');
  assert.match(sql, /CREATE POLICY hris_notices_legacy_security_guard\s+ON public\.notices AS RESTRICTIVE FOR SELECT TO authenticated/);
  assert.match(sql, /tenant_id = public\.synesis_tenant_id\(\)/);
  assert.match(sql, /public\.is_active_admin\(\)/);
  assert.match(sql, /public\.has_permission\('notices\.view'\)/);
  assert.match(sql, /public\.has_permission\('notices\.manage'\)/);
  assert.match(sql, /public\.hris_own_employee_for_tenant\(tenant_id\) IS NOT NULL/);
  assert.match(sql, /audience_type = 'department'/);
  assert.doesNotMatch(sql, /(?:GRANT|INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:ALL|INTO|ON|FROM|public)/i);
  assert.doesNotMatch(sql, /DROP POLICY/);
});

test('rollback touches exactly one additive notice policy', () => {
  const sql = read('rollback-restrictive-read-guard.staging.sql');
  assert.match(sql, /DROP POLICY IF EXISTS hris_notices_legacy_security_guard ON public\.notices/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP FUNCTION|DELETE FROM|TRUNCATE/i);
});

test('read-only verification does not enumerate user identities', () => {
  const sql = read('verify-read-only.sql');
  assert.match(sql, /projected_preserved_admins/);
  assert.match(sql, /notice_policies/);
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\b\s+(TABLE|POLICY|FUNCTION|INTO|FROM|public)/i);
});

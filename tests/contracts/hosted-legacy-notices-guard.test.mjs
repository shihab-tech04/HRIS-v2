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

test('legacy guard retirement requires the tenant replacement and removes only the named policy', () => {
  const sql = read('retire-legacy-security-guard.staging.sql');
  assert.ok(sql.startsWith('-- Retire only the legacy Synesis-pinned notices guard'));
  assert.ok(sql.includes('BEGIN;') && sql.includes('COMMIT;'));
  assert.ok(sql.includes("SET LOCAL lock_timeout = '5s'"));
  assert.ok(sql.includes("policyname = 'hris_notices_membership_guard'"));
  assert.ok(sql.includes("p.permissive = 'RESTRICTIVE'"));
  assert.ok(sql.includes("p.cmd = 'SELECT'"));
  assert.ok(sql.includes("p.qual LIKE '%has_tenant_permission%'"));
  assert.ok(sql.includes("p.qual LIKE '%hris_own_employee_for_tenant%'"));
  assert.ok(sql.includes("p.qual LIKE '%hris_notices_super_admin_tenant_member%'"));
  assert.ok(sql.includes("p.qual NOT LIKE '%is_active_admin%'"));
  assert.ok(sql.includes("to_regprocedure('public.hris_notices_super_admin_tenant_member(uuid)') IS NOT NULL"));
  assert.ok(sql.includes('its catalog definition has drifted.'));
  assert.ok(sql.includes('DROP POLICY IF EXISTS hris_notices_legacy_security_guard ON public.notices'));
  assert.equal((sql.match(/DROP POLICY/g) || []).length, 1);
  for (const forbidden of ['DROP TABLE', 'DROP FUNCTION', 'DELETE FROM', 'TRUNCATE', 'GRANT', 'REVOKE']) {
    assert.ok(!sql.toUpperCase().includes(forbidden), `unexpected statement: ${forbidden}`);
  }
});

test('notices Super Admin access is identity-bound and requires active tenant membership', () => {
  const sql = readFileSync(
    new URL('../../supabase/migrations/20261017030000_hris_employee_announcement_audience.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.hris_notices_super_admin_tenant_member\(p_tenant_id uuid\)/);
  assert.match(sql, /public\.is_live_session\(\)/);
  assert.match(sql, /au\.is_super_admin IS TRUE/);
  assert.match(sql, /u\.email_confirmed_at IS NOT NULL/);
  assert.match(sql, /u\.deleted_at IS NULL/);
  assert.match(sql, /u\.banned_until IS NULL/);
  assert.match(sql, /m\.tenant_id = p_tenant_id/);
  assert.match(sql, /lower\(m\.status\) = 'active'/);
  assert.match(sql, /CREATE POLICY hris_notices_membership_guard[\s\S]*hris_notices_super_admin_tenant_member/);
  assert.doesNotMatch(sql, /hris_notices_membership_guard[\s\S]*public\.is_active_admin\(\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.hris_notices_super_admin_tenant_member\(uuid\) FROM PUBLIC, anon/);
});

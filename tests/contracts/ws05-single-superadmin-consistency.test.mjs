import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const repair = readFileSync(new URL('supabase/staging/ws05_single_superadmin_orphan_employee_auth_link.staging.sql', root), 'utf8');
const probe = readFileSync(new URL('tests/sql/hosted-parity/ws05-single-superadmin-read-only.sql', root), 'utf8');

test('the SQL identity probe reads only one active Super Admin and never changes data', () => {
  assert.match(probe, /FROM auth\.users/);
  assert.match(probe, /JOIN public\.admin_users/);
  assert.match(probe, /a\.is_super_admin IS TRUE/);
  assert.match(probe, /JOIN public\.tenant_memberships/);
  assert.match(probe, /m\.status = 'active'/);
  assert.match(probe, /SINGLE_SUPER_ADMIN_PASS/);
  assert.match(probe, /EMPLOYEE_AUTH_LINKS_FAIL/);
  assert.doesNotMatch(probe, /(?:^|\n)\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|TRUNCATE|DROP|DO|CALL|EXECUTE|GRANT|REVOKE)\b/i);
});

test('staged repair requires verified approval, enforces exactly one auth user, and preserves employee records', () => {
  assert.match(repair, /STAGING ONLY/);
  assert.match(repair, /current_setting\('hris\.ws05_single_admin_reconcile_approved', true\)/);
  assert.match(repair, /current_setting\('hris\.ws05_recovery_restored', true\)/);
  assert.match(repair, /IF v_auth_count <> 1/);
  assert.match(repair, /IF v_super_admin_count <> 1 OR v_active_membership_count <> 1/);
  assert.match(repair, /IF v_orphan_count <> 1/);
  assert.match(repair, /UPDATE public\.employees e\s+SET user_id = NULL/);
  assert.match(repair, /NOT EXISTS \(SELECT 1 FROM auth\.users u WHERE u\.id = e\.user_id\)/);
  assert.match(repair, /GET DIAGNOSTICS v_fixed_count = ROW_COUNT/);
  assert.match(repair, /IF v_fixed_count <> 1/);
  assert.match(repair, /BEGIN;[\s\S]*COMMIT;/);
  assert.doesNotMatch(repair, /\b(?:INSERT\s+INTO|DELETE\s+FROM|TRUNCATE|DROP\s+TABLE|UPDATE\s+auth\.users|UPDATE\s+public\.admin_users)\b/i);
});

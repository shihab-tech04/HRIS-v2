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
  assert.match(probe, /FROM public\.tenant_memberships/);
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

test('tenant and employee invitations fail closed before provisioning additional Auth identities', () => {
  for (const path of [
    'supabase/functions/hris-employee-invite/index.ts',
    'supabase/functions/platform-tenant-invite/index.ts',
  ]) {
    const code = readFileSync(new URL(path, root), 'utf8');
    const policy = code.indexOf('function additionalAuthProvisioningDisabled(): boolean');
    const guard = code.indexOf('if (additionalAuthProvisioningDisabled())');
    const authCreate = code.indexOf('inviteUserByEmail(');
    assert.ok(policy >= 0 && guard > policy && authCreate > guard, path);
    assert.match(code.slice(policy, guard), /return true;/);
    assert.match(code.slice(guard, authCreate), /return reply\(403/);
    assert.match(code.slice(policy, authCreate), /SINGLE_SUPER_ADMIN_LOGIN_ONLY/);
  }
});

test('hosted admin-create-user source denies new identities before privileged Auth creation', () => {
  const code = readFileSync(new URL('supabase/functions/admin-create-user/index.ts', root), 'utf8');
  const policy = code.indexOf('function additionalAuthProvisioningDisabled(): boolean');
  const guard = code.indexOf('if (additionalAuthProvisioningDisabled())');
  const createUser = code.indexOf('adminClient.auth.admin.createUser(');
  assert.ok(policy >= 0 && guard > policy && createUser > guard);
  assert.match(code.slice(policy, guard), /return true;/);
  assert.match(code.slice(policy, createUser), /SINGLE_SUPER_ADMIN_LOGIN_ONLY/);
  assert.match(code.slice(guard, createUser), /status: 403/);
});

test('staged orphan-link repair is pinned to the exact read-only observed pair', () => {
  assert.match(repair, /v_expected_fingerprint constant text := '224deda3117d33aba10bfa607835873d'/);
  assert.match(repair, /md5\(e\.id::text \|\| ':' \|\| e\.user_id::text\)/);
  assert.match(repair, /IF v_orphan_fingerprint IS DISTINCT FROM v_expected_fingerprint THEN/);
  assert.match(repair, /md5\(e\.id::text \|\| ':' \|\| e\.user_id::text\) = v_expected_fingerprint/);
  assert.match(repair, /Stale employee link differs from the approved inventory/);
});

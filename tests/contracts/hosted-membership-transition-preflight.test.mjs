import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const sql = readFileSync(new URL(
  '../../supabase/staging/hosted-membership-transition/preflight-read-only.sql',
  import.meta.url,
), 'utf8');

test('hosted membership gate enumerates roles, constraints and grants without identities', () => {
  assert.match(sql, /tenant_memberships_role_check/);
  assert.match(sql, /active_hr_admin_roles/);
  assert.match(sql, /active_hr_recruiter_roles/);
  assert.match(sql, /hr_admin_grants/);
  assert.match(sql, /hris_system_admin/);
  assert.match(sql, /current_memberships/);
  assert.match(sql, /BLOCKED_ROLE_CONSTRAINT_WITHOUT_REGISTRY_ENTRIES/);
  assert.match(sql, /BLOCKED_NO_APPROVED_MEMBERSHIP_BACKFILL/);
  assert.match(sql, /PASS_MINIMAL_ADMIN_TRANSITION/);
  assert.match(sql, /hris_first_admin_platform_guard/);
  assert.match(sql, /restrictive_bootstrap_guard_installed/);
  assert.match(sql, /bootstrap_guard_role_and_auth_hardening_present/);
  assert.match(sql, /BLOCKED_NO_RESTRICTIVE_BOOTSTRAP_GUARD/);
  assert.match(sql, /BLOCKED_BOOTSTRAP_GUARD_ROLE_OR_AUTH_DRIFT/);
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\s+(?:TABLE|POLICY|FUNCTION|INTO|FROM|public)/i);
  assert.doesNotMatch(sql, /SELECT\s+.*\b(user_id|email|session_id)\b/i);
});

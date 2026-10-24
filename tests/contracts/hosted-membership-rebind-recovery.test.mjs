import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../supabase/staging/hosted-membership-transition/', import.meta.url);
const staged = readFileSync(new URL('20261024_super_admin_membership_rebind.staging.sql', root), 'utf8');
const pre = readFileSync(new URL('preflight-rebind-read-only.sql', root), 'utf8');
const post = readFileSync(new URL('postflight-rebind-read-only.sql', root), 'utf8');

test('the controlled rebound stage has exactly one membership insertion and one distinct audit, with no permission or Auth writes', () => {
  assert.equal((staged.match(/INSERT INTO public\.tenant_memberships/gi) ?? []).length, 1);
  assert.equal((staged.match(/INSERT INTO public\.admin_audit_logs/gi) ?? []).length, 1);
  assert.match(staged, /PHASE03_TENANT_ADMIN_MEMBERSHIP_REBOUND/);
  assert.match(staged, /PHASE03_INITIAL_TENANT_ADMIN_BACKFILLED/);
  assert.match(staged, /super_admin\.rebound_to_new_auth/);
  assert.match(staged, /details->>'user_id' IS DISTINCT FROM a\.user_id::text/);
  assert.match(staged, /SET LOCAL lock_timeout/);
  assert.match(staged, /pg_advisory_xact_lock\(20261019, 3\)/);
  assert.match(staged, /u\.email_confirmed_at IS NOT NULL/);
  assert.match(staged, /u\.banned_until IS NULL/);
  assert.match(staged, /hris_first_admin_platform_guard/);
  assert.match(staged, /hardened/);
  assert.match(staged, /'organization\.manage'/);
  assert.match(staged, /'synesis-it'/);
  assert.match(staged, /supabase_migrations\.schema_migrations/);
  assert.ok(staged.trim().endsWith('COMMIT;'));
  assert.doesNotMatch(staged, /\b(?:DROP|ALTER|CREATE|TRUNCATE|UPDATE|DELETE)\s+(?:TABLE|POLICY|FUNCTION|TRIGGER|ROLE|USER|FROM|public|auth)/i);
  assert.doesNotMatch(staged, /INSERT INTO (?:public\.)?(?:roles|role_permissions|admin_users|tenants|auth\.users)/i);
});

test('read-only preflight checks historical audit/user mismatch without returning identities', () => {
  assert.match(pre, /prior_audit_user_differs_from_current_superadmin/);
  assert.match(pre, /READY_FOR_DISPOSABLE_TEST_NOT_HOSTED_APPROVAL/);
  assert.match(pre, /BLOCKED_AUDIT_REBOUND_EVIDENCE/);
  assert.match(pre, /BLOCKED_SECURITY_GUARD/);
  assert.match(pre, /existing_repair_audits/);
  assert.doesNotMatch(pre, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\s+(?:INTO|FROM|TABLE|POLICY|FUNCTION|public)/i);
  assert.doesNotMatch(pre, /SELECT\s+u\.(?:id|email)|AS\s+(?:user_id|email)/i);
});

test('read-only postflight preserves original audit and requires exactly one approved member', () => {
  assert.match(post, /PASS_STRUCTURAL_ONLY_REQUIRES_AUTH_ACCEPTANCE/);
  assert.match(post, /PHASE03_INITIAL_TENANT_ADMIN_BACKFILLED/);
  assert.match(post, /PHASE03_TENANT_ADMIN_MEMBERSHIP_REBOUND/);
  assert.match(post, /authorized_memberships/);
  assert.match(post, /m\.role='hr_admin'/);
  assert.doesNotMatch(post, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\s+(?:INTO|FROM|TABLE|POLICY|FUNCTION|public)/i);
});

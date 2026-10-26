import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20261024220001_platform_tenant_invitations.sql', 'utf8');
const certificationMigration = readFileSync('supabase/migrations/20261026000100_platform_tenant_security_certification.sql', 'utf8');
const edge = readFileSync('supabase/functions/platform-tenant-invite/index.ts', 'utf8');
const api = readFileSync('src/live/platformTenantApi.ts', 'utf8');
const workspace = readFileSync('src/live/PlatformTenantWorkspace.tsx', 'utf8');
const liveApp = readFileSync('src/live/LiveApp.tsx', 'utf8');
const acceptance = readFileSync('tests/sql/isolated-auth/hris-release-rpc-acceptance.mjs', 'utf8');
const checkWorkflow = readFileSync('.github/workflows/check.yml', 'utf8');
const deployWorkflow = readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
const fixture = readFileSync('tests/sql/isolated-auth/recruitment-fixture.sql', 'utf8');

test('invitation details stay private and client roles cannot read or mutate the invitation table', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS private\.platform_tenant_invitations/);
  assert.match(migration, /ALTER TABLE private\.platform_tenant_invitations ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE private\.platform_tenant_invitations FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS platform_tenant_invitations_live_email_uq/);
  assert.match(migration, /expires_at timestamptz NOT NULL/);
  assert.match(acceptance, /invite_private_table/);
});

test('tenant activation requires a separate trusted Phase 21 security certification', () => {
  assert.match(certificationMigration, /private\.platform_tenant_security_certifications/);
  assert.match(certificationMigration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(certificationMigration, /REVOKE ALL ON TABLE private\.platform_tenant_security_certifications[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(certificationMigration, /app_metadata[^;]*hris_tenant_security_certifier/);
  assert.match(certificationMigration, /platform_hris_current_user_can_certify_tenant/);
  assert.match(certificationMigration, /public\.platform_hris_is_super_admin\(\)/);
  assert.match(certificationMigration, /BEFORE INSERT OR UPDATE OF is_active ON public\.tenants/);
  assert.match(certificationMigration, /Approved security certification is required before tenant activation/);
  assert.match(certificationMigration, /security_signoff_complete boolean NOT NULL CHECK/);
  assert.match(certificationMigration, /evidence_reference text NOT NULL/);
  assert.match(certificationMigration, /platform_hris_certify_and_activate_tenant/);
  assert.match(certificationMigration, /PLATFORM_TENANT_SECURITY_CERTIFIED_AND_ACTIVATED/);
  assert.match(certificationMigration, /REVOKE ALL ON FUNCTION public\.platform_hris_certify_and_activate_tenant\(uuid,boolean,text\)[\s\S]*?FROM PUBLIC, anon/);
  assert.match(certificationMigration, /GRANT EXECUTE ON FUNCTION public\.platform_hris_certify_and_activate_tenant\(uuid,boolean,text\)[\s\S]*?TO authenticated/);
  assert.match(certificationMigration, /SET search_path = ''/);
});

test('invitation creation and acceptance bind a confirmed email to the invited Auth user', () => {
  assert.match(migration, /public\.platform_hris_is_super_admin\(\)/);
  assert.match(migration, /public\.is_live_session\(\)/);
  assert.match(migration, /lower\(u\.email\) = v_invitation\.email/);
  assert.match(migration, /v_invitation\.invited_auth_user_id IS DISTINCT FROM auth\.uid\(\)/);
  assert.match(migration, /u\.email_confirmed_at IS NOT NULL/);
  assert.match(migration, /u\.deleted_at IS NULL/);
  assert.match(migration, /u\.banned_until IS NULL OR u\.banned_until <= now\(\)/);
  assert.match(migration, /'accepted',[\s\S]*?tenant_id/);
  assert.match(migration, /'inactive_pending_certification', true/);
  assert.match(migration, /'PLATFORM_TENANT_INVITATION_ACCEPTED'/);
  assert.match(migration, /IF v_invitation\.status = 'accepted' THEN[\s\S]*?RETURN pg_catalog\.jsonb_build_object/);
});

test('only the server service role can finalize delivery, and every RPC has explicit grants', () => {
  assert.match(migration, /IF auth\.role\(\) IS DISTINCT FROM 'service_role' THEN/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.platform_hris_mark_tenant_invitation_sent\(uuid,uuid\)[\s\S]*?FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.platform_hris_mark_tenant_invitation_sent\(uuid,uuid\)[\s\S]*?TO service_role/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.platform_hris_create_tenant_invitation\(text,text,text,text,text,text\)[\s\S]*?FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.platform_hris_create_tenant_invitation\(text,text,text,text,text,text\)[\s\S]*?TO authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.platform_hris_accept_tenant_invitation\(uuid\)[\s\S]*?FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.platform_hris_accept_tenant_invitation\(uuid\)[\s\S]*?TO authenticated/);
});

test('Edge Function verifies the caller and uses server-only Auth Admin invitation', () => {
  assert.match(edge, /verify_jwt|Authorization/);
  assert.match(edge, /caller\.auth\.getUser\(\)/);
  assert.match(edge, /caller\.rpc\("platform_hris_is_super_admin"\)/);
  assert.match(edge, /caller\.rpc\("platform_hris_create_tenant_invitation"/);
  assert.match(edge, /admin\.auth\.admin\.inviteUserByEmail/);
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edge, /platform_hris_mark_tenant_invitation_sent/);
  assert.match(edge, /platform_invitation/);
  assert.match(edge, /Access-Control-Allow-Methods/);
  assert.doesNotMatch(edge, /console\.(?:log|error)\([^)]*inviteEmail/);
});

test('Super Admin UI offers existing-account and invitation paths; recipient sees pending certification', () => {
  assert.match(workspace, /administratorMode: 'existing' \| 'invite'/);
  assert.match(workspace, /invitePlatformTenantAdministrator\(/);
  assert.match(workspace, /Send invitation/);
  assert.match(workspace, /same confirmed email/);
  assert.match(workspace, /Approved security sign-off reference/);
  assert.match(workspace, /assigned security certifier/);
  assert.match(workspace, /Certify and activate tenant/);
  assert.match(api, /platform_hris_list_tenant_certifications/);
  assert.match(api, /platform_hris_certify_and_activate_tenant/);
  assert.match(api, /supabase\.functions\.invoke\('platform-tenant-invite'/);
  assert.match(api, /platform_hris_accept_tenant_invitation/);
  assert.match(liveApp, /platform_invitation/);
  assert.match(liveApp, /Invitation accepted/);
  assert.match(liveApp, /inactive pending security certification/);
  assert.match(liveApp, /updateUser\(\{ password \}\)/);
  assert.match(acceptance, /admin\.auth\.admin\.inviteUserByEmail/);
  assert.match(acceptance, /platform_hris_accept_tenant_invitation/);
  assert.match(acceptance, /ordinaryAdminInvite/);
  assert.match(acceptance, /wrongAccountAcceptance/);
  assert.match(acceptance, /securityCertifier/);
  assert.match(acceptance, /directActivationDenied/);
  assert.match(acceptance, /approvedCertification/);
});

test('frontend never receives a service-role credential', () => {
  assert.doesNotMatch(api + workspace + liveApp, /SUPABASE_SERVICE_ROLE_KEY|service_role_key|sb_secret_/i);
});

test('Super Admin tenant entry is enabled in the tested Pages build and its disposable handoff fixture matches hosted schema', () => {
  assert.match(checkWorkflow, /VITE_ENABLE_PLATFORM_TENANTS: 'true'/);
  assert.match(deployWorkflow, /VITE_ENABLE_PLATFORM_TENANTS: 'true'/);
  assert.match(checkWorkflow, /expected_sha=39d07585c854709f5c16b2712a6634da386c5c4d/);
  assert.match(deployWorkflow, /expected_sha=39d07585c854709f5c16b2712a6634da386c5c4d/);
  assert.match(fixture, /CREATE TABLE public\.onboarding_handoffs \([\s\S]*?created_at timestamptz NOT NULL DEFAULT now\(\)/);
});

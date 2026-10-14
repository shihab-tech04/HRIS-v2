import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const sql=readFileSync('supabase/staging/phase2a/tenant_provisioning.staging.sql','utf8');
const emailSql=readFileSync('supabase/staging/phase2b/platform_tenant_admin_email.staging.sql','utf8');
const client=readFileSync('src/live/platformTenantApi.ts','utf8');
const workspace=readFileSync('src/live/PlatformTenantWorkspace.tsx','utf8');
test('Phase 2A SQL is staged and new tenants start inactive',()=>{
 assert.match(sql,/PHASE 2A STAGING CONTRACT ONLY/);
 assert.match(sql,/VALUES\(v_code,v_slug,v_name,p_timezone,p_default_locale,FALSE\)/);
 assert.match(sql,/INSERT INTO public\.tenant_memberships/);
 assert.match(sql,/INSERT INTO public\.admin_audit_logs/);
 assert.doesNotMatch(sql,/DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM\s+public\./i);
});
test('Privileged operations check live session and protected server identity',()=>{
 assert.match(sql,/public\.is_live_session\(\)/);
 assert.match(sql,/a\.user_id = auth\.uid\(\)/);
 assert.match(sql,/a\.active IS TRUE AND a\.is_super_admin IS TRUE/);
 for(const fn of ['platform_hris_list_tenants','platform_hris_provision_tenant',
  'platform_hris_update_tenant_metadata','platform_hris_set_tenant_admin']){
  assert.match(sql,new RegExp('FUNCTION public\\.'+fn+'\\('));
  assert.match(sql,new RegExp('REVOKE ALL ON FUNCTION public\\.'+fn+'\\('));
 }
 assert.match(sql,/SECURITY DEFINER SET search_path = ''/);
 assert.doesNotMatch(sql,/GRANT\s+(?:ALL|INSERT|UPDATE|DELETE)\s+ON\s+(?:TABLE\s+)?public\.tenants\s+TO\s+authenticated/i);
});
test('Staging-only client is not mounted in production',()=>{
 assert.match(client,/VITE_ENABLE_PLATFORM_TENANTS === 'true'/);
 assert.match(client,/requireStagingFeature\(\)/);
 assert.match(client,/supabase\.rpc\('platform_hris_is_super_admin'\)/);
 assert.match(client,/throw error/);
});

test('Phase 2B resolves exact confirmed account emails only through Super Admin RPCs',()=>{
 assert.match(emailSql,/PHASE 2B STAGING CONTRACT ONLY/);
 assert.match(emailSql,/public\.platform_hris_is_super_admin\(\)/);
 assert.match(emailSql,/lower\(u\.email\) = v_email[\s\S]*?u\.email_confirmed_at IS NOT NULL/);
 assert.match(emailSql,/platform_hris_provision_tenant\([\s\S]*?v_admin_user_id/);
 assert.match(emailSql,/platform_hris_set_tenant_admin\(p_tenant_id, v_admin_user_id, p_enabled\)/);
 for(const fn of ['platform_hris_provision_tenant_by_email','platform_hris_set_tenant_admin_by_email']){
  assert.match(emailSql,new RegExp('REVOKE ALL ON FUNCTION public\\.'+fn+'\\('));
  assert.match(emailSql,new RegExp('GRANT EXECUTE ON FUNCTION public\\.'+fn+'\\(.* TO authenticated'));
 }
 assert.doesNotMatch(emailSql,/GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)\s+ON\s+(?:TABLE\s+)?auth\.users/i);
 assert.doesNotMatch(emailSql,/INSERT INTO auth\.users|UPDATE auth\.users|DELETE FROM auth\.users/i);
 assert.match(client,/supabase\.rpc\('platform_hris_provision_tenant_by_email'/);
 assert.match(client,/supabase\.rpc\('platform_hris_set_tenant_admin_by_email'/);
 assert.match(workspace,/type="email" autoComplete="email" label=\{tx\('First administrator email'\)\}/);
 assert.match(workspace,/provisionPlatformTenantByEmail\(/);
 assert.match(workspace,/setPlatformTenantAdministratorByEmail\(/);
 assert.match(workspace,/does not expose an account directory or send invitations/);
 assert.doesNotMatch(workspace,/Auth user ID|user UUID/);
});

test('Adding an admin never silently overwrites a recruiter membership',()=>{
 assert.doesNotMatch(sql,/SET\s+role\s*=\s*'hr_admin'/i);
 assert.match(sql,/ON CONFLICT \(tenant_id,user_id\) DO UPDATE[\s\S]*?WHERE public\.tenant_memberships\.role='hr_admin'/);
 assert.match(sql,/IF NOT FOUND THEN[\s\S]*?Existing membership cannot be converted to administrator/);
});
test('Refreshing data also revalidates permissions and protects old tenant records',()=>{
 const ui=readFileSync('src/live/LiveApp.tsx','utf8');
 assert.match(ui,/\[user\?\.id, refreshKey\]/);
 assert.match(ui,/if \(!user \|\| !tenantId \|\| membershipLoading \|\| !tenants\.some/);
 assert.match(ui,/setRecords\(empty\(\)\)/);
 assert.match(ui,/lastAccessUserId\.current !== user\.id/);
 assert.match(ui,/event === 'TOKEN_REFRESHED'/);
});

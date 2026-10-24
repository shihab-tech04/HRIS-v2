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
 assert.match(sql,/JOIN auth\.users u ON u\.id=a\.user_id/);
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
 assert.match(emailSql,/u\.deleted_at IS NULL[\s\S]*?u\.banned_until IS NULL OR u\.banned_until <= now\(\)/);
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
 assert.match(workspace,/type="email" autoComplete="email" label=\{tx\(createForm\.administratorMode === 'invite' \? 'Invitee email' : 'First administrator email'\)\}/);
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
test('Tenant creation and admin appointment reject a missing or powerless role',()=>{
 const guard=/IF NOT EXISTS \(\s*SELECT 1 FROM public\.roles r\s+JOIN public\.role_permissions rp ON rp\.role_id=r\.id\s+AND rp\.permission_id='organization\.manage'\s+WHERE r\.id='hr_admin' AND r\.active IS TRUE\s*\) THEN\s*RAISE EXCEPTION 'Tenant administrator role is not configured for scoped authorization'/g;
 assert.equal([...sql.matchAll(guard)].length,2);
 for(const fixture of ['tests/sql/phase2a/fixture.sql','tests/sql/phase2a/supabase-fixture.sql']){
  const content=readFileSync(fixture,'utf8');
  assert.match(content,/CREATE TABLE public\.roles/);
  assert.match(content,/CREATE TABLE public\.role_permissions/);
  assert.match(content,/VALUES\s*\('hr_admin','organization\.manage'\)/);
 }
 const guardSql=readFileSync('supabase/staging/phase2a/first_admin_guard.staging.sql','utf8');
 assert.match(guardSql,/JOIN public\.role_permissions rp ON rp\.role_id=r\.id/);
 assert.match(guardSql,/rp\.permission_id='organization\.manage'/);
 assert.match(guardSql,/r\.id='hr_admin' AND r\.active IS TRUE/);
 const authorization=readFileSync('tests/sql/phase2a/verify_authorization.sql','utf8');
 assert.match(authorization,/Missing HR admin registry role allowed self-enrolment/);
});
test('Every tenant-admin entry rejects banned and soft-deleted Auth identities',()=>{
 const guardSql=readFileSync('supabase/staging/phase2a/first_admin_guard.staging.sql','utf8');
 for(const source of [guardSql,emailSql]) {
  assert.match(source,/u\.email_confirmed_at IS NOT NULL/);
  assert.match(source,/u\.deleted_at IS NULL/);
  assert.match(source,/u\.banned_until IS NULL OR u\.banned_until <= now\(\)/);
 }
 assert.equal((sql.match(/u\.deleted_at IS NULL/g)||[]).length,3);
 assert.equal((sql.match(/u\.banned_until IS NULL OR u\.banned_until <= now\(\)/g)||[]).length,3);
 for(const file of [
  'tests/sql/phase2a/verify_authorization.sql',
  'tests/sql/phase2a/verify_provisioning.sql',
  'tests/sql/phase2a/verify_admin_roles.sql',
 ]) {
  const body=readFileSync(file,'utf8');
  assert.match(body,/banned_until=now\(\)\+interval '1 day'/);
  assert.match(body,/ROLLBACK/);
 }
 assert.match(readFileSync('tests/sql/phase2a/verify_provisioning.sql','utf8'),/deleted_at=now\(\)/);
 assert.match(readFileSync('tests/sql/phase2a/verify_admin_roles.sql','utf8'),/deleted_at=now\(\)/);
 const emailJourney=readFileSync('tests/sql/phase2a/verify_admin_emails.sql','utf8');
 assert.match(emailJourney,/platform_hris_provision_tenant_by_email/);
 assert.match(emailJourney,/platform_hris_set_tenant_admin_by_email/);
 assert.match(emailJourney,/email-banned/);
 assert.match(emailJourney,/deleted_at=now\(\)/);
 assert.match(emailJourney,/AND role='hr_recruiter' AND status='active'/);
});
test('Refreshing data also revalidates permissions and protects old tenant records',()=>{
 const ui=readFileSync('src/live/LiveApp.tsx','utf8');
 assert.match(ui,/\[user\?\.id, refreshKey\]/);
 assert.match(ui,/if \(!user \|\| !tenantId \|\| membershipLoading \|\| !tenants\.some/);
 assert.match(ui,/setRecords\(empty\(\)\)/);
 assert.match(ui,/lastAccessUserId\.current !== user\.id/);
 assert.match(ui,/event === 'TOKEN_REFRESHED'/);
});

test('Phase 2A Auth acceptance is restricted to disposable host temp roots',()=>{
 const runner=readFileSync('tests/sql/phase2a/run-local.mjs','utf8');
 assert.match(runner,/process\.env\.GITHUB_ACTIONS === 'true' \? '\/tmp\/' : '\/private\/tmp\/'/);
 assert.match(runner,/workdir\.startsWith\(allowedTempRoot\)/);
 const browser=readFileSync('tests/sql/phase2a/run-browser.mjs','utf8');
 assert.match(browser,/Switch language to Bengali/);
 assert.match(browser,/Switch language to English/);
 assert.match(browser,/width: 390, height: 844/);
 assert.match(browser,/width: 1440, height: 1000/);
});

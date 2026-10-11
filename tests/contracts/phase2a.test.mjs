import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const sql=readFileSync('supabase/staging/phase2a/tenant_provisioning.staging.sql','utf8');
const client=readFileSync('src/live/platformTenantApi.ts','utf8');
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

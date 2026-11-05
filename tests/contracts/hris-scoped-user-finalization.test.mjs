import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../../supabase/migrations/20261105093000_hris_scoped_user_finalization.sql', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../../supabase/functions/admin-create-user/index.ts', import.meta.url), 'utf8');
const adapter = readFileSync(new URL('../../src/live/realUserProvisioningApi.ts', import.meta.url), 'utf8');

test('SQL assigns an explicit active tenant membership and links employee atomically', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.admin_finalize_system_user\(/);
  assert.match(sql, /SELECT e\.tenant_id,e\.full_name[\s\S]*?INTO v_tenant_id,v_display_name/);
  assert.match(sql, /JOIN public\.tenants t ON t\.id=e\.tenant_id AND t\.is_active IS TRUE/);
  assert.match(sql, /FOR UPDATE OF e/);
  assert.match(sql, /INSERT INTO public\.admin_users/);
  assert.match(sql, /INSERT INTO public\.user_roles/);
  assert.match(sql, /INSERT INTO public\.tenant_memberships\(tenant_id,user_id,role,status\)/);
  assert.match(sql, /VALUES\(v_tenant_id,p_user_id,p_role_id,'active'\)/);
  assert.match(sql, /UPDATE public\.employees[\s\S]*?WHERE id=p_employee_id AND tenant_id=v_tenant_id AND user_id IS NULL/);
  assert.match(sql, /'tenant_id',v_tenant_id/);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+public\.|TRUNCATE|DROP\s+TABLE/i);
});

test('SQL requires scoped manage permission and never permits a delegated role escalation', () => {
  assert.match(sql, /current_setting\('role',true\) IS DISTINCT FROM 'service_role'/);
  assert.match(sql, /request\.jwt\.claim\.role/);
  assert.match(sql, /p_actor_id/);
  assert.match(sql, /m\.tenant_id=v_tenant_id/);
  assert.match(sql, /granted\.permission_id='admin_users\.manage'/);
  assert.match(sql, /granted\.permission_id=requested\.permission_id/);
  assert.match(sql, /RAISE EXCEPTION 'Delegation denied/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.admin_finalize_system_user[\s\S]*?FROM PUBLIC,anon,authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.admin_finalize_system_user[\s\S]*?TO service_role/);
  assert.doesNotMatch(sql, /SECURITY DEFINER[\s\S]*?GRANT EXECUTE[\s\S]*?TO anon;/);
});

test('SQL never offers unassociated tenant roles to the privileged account creation UI', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.admin_get_my_provisioning_context/);
  assert.match(sql, /v_tenant_id := public\.synesis_tenant_id\(\)/);
  assert.match(sql, /r\.id IN \('employee','hr_admin'\)/);
  assert.match(sql, /m\.tenant_id=v_tenant_id AND m\.role=r\.id/);
  assert.match(sql, /e\.tenant_id=v_tenant_id AND ur\.role_id=r\.id/);
  assert.match(sql, /e\.tenant_id=v_tenant_id[\s\S]*?AND e\.user_id IS NULL/);
});

test('client and server require confirmed SQL employee and tenant linkage after provisioning', () => {
  assert.match(adapter, /supabase\.functions\.invoke\('admin-create-user'/);
  assert.match(adapter, /result\.success !== true/);
  assert.match(edge, /finalized\?\.tenant_id !== tenantId/);
  assert.match(edge, /finalized\?\.employee_id !== employeeId/);
  assert.match(edge, /finalized\?\.role_id !== roleId/);
  assert.match(edge, /adminClient\.auth\.admin\.deleteUser\(created.user.id\)/);
});

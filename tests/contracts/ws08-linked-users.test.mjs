import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adapter = readFileSync(new URL('../../src/live/realUserDirectoryApi.ts', import.meta.url), 'utf8');
const screen = readFileSync(new URL('../../src/live/RealLinkedUserDirectory.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261109035656_hris_admin_role_access_management.sql', import.meta.url), 'utf8');

test('linked-user management reads the tenant membership role and restricts access to the active tenant', () => {
  for (const word of ['admin_users.view', 'employees.view', 'admin_users.manage', 'synesis_tenant_id',
    'tenant_memberships', 'admin_users', 'has_tenant_permission', 'departments', 'designations']) {
    assert.ok(adapter.includes(word), word);
  }
  assert.match(adapter, /\.eq\('tenant_id', tenantId\)\.in\('user_id', ids\)/);
  assert.match(adapter, /rpc\('admin_update_user_access'/);
  assert.match(adapter, /result\.tenant_id !== tenantId/);
  assert.match(adapter, /result\.membership_status !== \(active \? 'active' : 'inactive'\)/);
  assert.match(adapter, /finalScope\.data !== tenantId/);
  assert.match(adapter, /range\(offset, offset \+ REAL_USER_DIRECTORY_PAGE_SIZE - 1\)/);
  assert.doesNotMatch(adapter, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|functions\.invoke\(|auth\.admin/);
});

test('account changes require an explicit deactivation confirmation and keep protected identities read-only', () => {
  assert.match(screen, /confirmDisable/);
  assert.match(screen, /user\.isSuperAdmin/);
  assert.match(screen, /aria-labelledby/);
  assert.match(screen, /md:hidden/);
  assert.match(screen, /membershipStatus/);
  assert.match(screen, /updateRealUserAccess/);
  assert.match(screen, /loadRealUserEffectivePermissions/);
  assert.match(screen, /Effective permissions/);
});

test('the live shell mounts the real directory beside provisioning and keeps role administration Super Admin only', () => {
  assert.match(shell, /<RealLinkedUserDirectory[\s\S]+?<RealUserProvisioningReadiness/);
  assert.match(shell, /onCreated=\{\(\) => setUserDirectoryRevision/);
  assert.match(shell, /id: 'role-management'/);
  assert.match(shell, /page === 'role-management' && isSuperAdmin && tenantId && <RealRoleManagement/);
});

test('role and account RPC releases protect tenant membership authorization and server-side grants', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_save_role/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_update_user_access/);
  assert.match(migration, /UPDATE public\.tenant_memberships|INSERT INTO public\.tenant_memberships/);
  assert.match(migration, /ON CONFLICT \(tenant_id,user_id\) DO UPDATE SET\s+role=excluded\.role,\s+status=excluded\.status/);
  assert.match(migration, /public\.has_tenant_permission\(v_tenant_id,'admin_users\.manage'\)/);
  assert.doesNotMatch(migration, /effective_permissions_for_user/);
  assert.match(migration, /Protected Super Administrator cannot be modified/);
  assert.match(migration, /Only a Platform Super Admin can deactivate an account used by another active organization/);
  assert.match(migration, /Role cannot be deactivated while active accounts are assigned/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_update_user_access\(uuid,text,boolean\) FROM PUBLIC,anon/);
  assert.match(migration, /tenant_memberships_admin_directory_read[\s\S]+?has_tenant_permission\(tenant_id,'admin_users\.view'\)[\s\S]+?has_tenant_permission\(tenant_id,'employees\.view'\)/);
});

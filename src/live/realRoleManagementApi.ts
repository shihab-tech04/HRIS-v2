import { supabase } from '../lib/supabase';

export type ManagedPermission = { id: string; module: string; action: string; description: string | null };
export type ManagedRole = {
  id: string; name: string; description: string; active: boolean; isSystem: boolean; permissionIds: string[];
};
export type RealRoleManagement = { tenantId: string; roles: ManagedRole[]; permissions: ManagedPermission[] };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roleIdPattern = /^[a-z0-9][a-z0-9_]{1,63}$/;

function obj(input: unknown): Record<string, unknown> {
  if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('The server returned an invalid role record.');
  return input as Record<string, unknown>;
}
function str(input: unknown, field: string): string {
  if (typeof input !== 'string' || !input.trim()) throw new Error('The server returned an invalid ' + field + '.');
  return input.trim();
}
async function verifySuperAdmin(tenantId: string, permission: 'roles.view' | 'roles.manage'): Promise<void> {
  if (!uuidPattern.test(tenantId)) throw new Error('Select a valid organization.');
  const [scope, superAdmin, access] = await Promise.all([
    supabase.rpc('synesis_tenant_id'),
    supabase.rpc('platform_hris_is_super_admin'),
    supabase.rpc('has_tenant_permission', { p_tenant_id: tenantId, p_permission_id: permission }),
  ]);
  if (scope.error || scope.data !== tenantId) throw new Error('The selected organization does not match the authenticated server tenant.');
  if (superAdmin.error || superAdmin.data !== true) throw new Error('Only an authorized Super Admin can manage system roles.');
  if (access.error || access.data !== true) throw new Error('Role permission could not be verified for this organization.');
}

export async function loadRealRoleManagement(tenantId: string): Promise<RealRoleManagement> {
  await verifySuperAdmin(tenantId, 'roles.view');
  const [roleResult, permissionResult] = await Promise.all([
    supabase.from('roles').select('id,name,description,active,is_system')
      .not('id', 'in', '("12345","nadiaaa")').not('name', 'ilike', 'nadia%')
      .order('name', { ascending: true }),
    supabase.from('permissions').select('id,module,action,description')
      .not('id', 'ilike', 'nadia%').order('module', { ascending: true }).order('action', { ascending: true }),
  ]);
  if (roleResult.error || permissionResult.error || !Array.isArray(roleResult.data) || !Array.isArray(permissionResult.data)) {
    throw new Error('Role and permission catalogs could not be loaded through authorized access.');
  }
  const roles: ManagedRole[] = roleResult.data.map(input => {
    const row = obj(input);
    if (typeof row.active !== 'boolean' || typeof row.is_system !== 'boolean') throw new Error('The server returned incomplete role settings.');
    return {
      id: str(row.id, 'role identifier'), name: str(row.name, 'role name'),
      description: typeof row.description === 'string' ? row.description : '',
      active: row.active, isSystem: row.is_system, permissionIds: [],
    };
  });
  const permissions = permissionResult.data.map(input => {
    const row = obj(input);
    return {
      id: str(row.id, 'permission identifier'),
      module: str(row.module, 'permission module'),
      action: str(row.action, 'permission action'),
      description: typeof row.description === 'string' ? row.description : null,
    };
  });
  if (new Set(roles.map(role => role.id)).size !== roles.length
    || new Set(permissions.map(permission => permission.id)).size !== permissions.length) {
    throw new Error('The server returned duplicate role or permission identifiers.');
  }
  const roleIds = roles.map(role => role.id);
  let grants: unknown[] = [];
  if (roleIds.length) {
    const result = await supabase.from('role_permissions').select('role_id,permission_id').in('role_id', roleIds);
    if (result.error || !Array.isArray(result.data)) throw new Error('Role permission assignments could not be loaded.');
    grants = result.data;
  }
  const roleMap = new Map(roles.map(role => [role.id, role] as const));
  const permissionIds = new Set(permissions.map(permission => permission.id));
  for (const input of grants) {
    const row = obj(input);
    const roleId = str(row.role_id, 'permission role');
    const permissionId = str(row.permission_id, 'assigned permission');
    const role = roleMap.get(roleId);
    if (!role || !permissionIds.has(permissionId)) throw new Error('The server returned an unauthorized or unknown role permission.');
    role.permissionIds.push(permissionId);
  }
  const finalScope = await supabase.rpc('synesis_tenant_id');
  if (finalScope.error || finalScope.data !== tenantId) throw new Error('Organization access changed while loading roles. Reload the page.');
  return { tenantId, roles, permissions };
}

export async function saveRealRole(input: {
  tenantId: string; roleId: string; originalRoleId?: string | null; name: string; description: string; active: boolean; permissionIds: string[];
}): Promise<ManagedRole> {
  await verifySuperAdmin(input.tenantId, 'roles.manage');
  const roleId = input.roleId.trim();
  const name = input.name.trim();
  const description = input.description.trim();
  if (!roleIdPattern.test(roleId) || name.length < 2 || name.length > 80 || description.length > 240) {
    throw new Error('Provide a valid role ID, role name, and description.');
  }
  if (new Set(input.permissionIds).size !== input.permissionIds.length || input.permissionIds.length > 500) {
    throw new Error('The role contains duplicate or invalid permissions.');
  }
  const current = await loadRealRoleManagement(input.tenantId);
  const existing = current.roles.find(role => role.id === roleId);
  if (input.originalRoleId && input.originalRoleId !== roleId) throw new Error('An existing role ID cannot be changed.');
  if (input.originalRoleId && !current.roles.some(role => role.id === input.originalRoleId)) throw new Error('The role being edited is no longer available. Reload and retry.');
  if (existing?.isSystem) throw new Error('System roles are read-only.');
  if (!input.originalRoleId && existing) throw new Error('That role ID is already in use. Choose a different ID.');
  if (input.permissionIds.some(id => !current.permissions.some(permission => permission.id === id))) {
    throw new Error('The role includes a permission outside the current server catalog.');
  }
  const { data, error } = await supabase.rpc('admin_save_role', {
    p_role_id: roleId,
    p_payload: { id: roleId, name, description, active: input.active, permission_ids: input.permissionIds },
  });
  if (error) throw new Error(error.message || 'Role could not be saved.');
  if (data !== roleId) throw new Error('The server did not confirm the saved role.');

  const readback = await loadRealRoleManagement(input.tenantId);
  const saved = readback.roles.find(role => role.id === roleId);
  if (!saved || saved.name !== name || saved.description !== description || saved.active !== input.active
    || [...saved.permissionIds].sort().join('|') !== [...input.permissionIds].sort().join('|')) {
    throw new Error('The role save could not be confirmed by an authorized readback.');
  }
  return saved;
}

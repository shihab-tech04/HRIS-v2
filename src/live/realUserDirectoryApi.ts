import { supabase } from '../lib/supabase';
import { loadRealProvisioningReadiness } from './realUserProvisioningApi';

// Tenant-scoped real-account directory and access controls. Reads remain
// server-authorized; writes use the guarded HRIS access RPC and read back state.
export const REAL_USER_DIRECTORY_PAGE_SIZE = 50;
export type RealLinkedUser = {
  userId: string; employeeId: string; employeeNumber: string;
  fullName: string; officialEmail: string; employmentStatus: string;
  roles: string[]; department: string | null; designation: string | null;
  membershipStatus: 'active' | 'inactive' | null;
  adminActive: boolean | null; isSuperAdmin: boolean;
};
export type RealLinkedUserPage = {
  tenantId: string; rows: RealLinkedUser[]; page: number;
  total: number; hasNext: boolean; organizationNamesAvailable: boolean;
};
export type RealEffectivePermission = { id: string; module: string; action: string; description: string | null };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('The server returned an invalid ' + field + '.');
  return value.trim();
}

export async function loadAssignableUserRoles(tenantId: string): Promise<Array<{ id: string; name: string; description: string }>> {
  const context = await loadRealProvisioningReadiness(tenantId);
  const allowed = (id: string, name: string) => id !== '12345' && id !== 'nadiaaa'
    && !name.trim().toLowerCase().startsWith('nadia');
  if (!context.isSuperAdmin) return context.assignableRoles.filter(role => allowed(role.id, role.name));

  const roles = await supabase.from('roles').select('id,name,description')
    .eq('active', true).eq('is_system', false)
    .not('id', 'in', '("12345","nadiaaa")').not('name', 'ilike', 'nadia%')
    .order('name', { ascending: true });
  if (roles.error || !Array.isArray(roles.data)) throw new Error('Authorized account roles could not be loaded.');
  return roles.data.map(input => {
    const row = obj(input);
    return {
      id: str(row.id, 'role identifier'),
      name: str(row.name, 'role name'),
      description: typeof row.description === 'string' ? row.description : '',
    };
  }).filter(role => allowed(role.id, role.name));
}

export async function updateRealUserAccess(
  tenantId: string, userId: string, roleId: string, active: boolean,
): Promise<void> {
  uuid(tenantId, 'organization identifier');
  uuid(userId, 'account identifier');
  if (!roleId.trim() || roleId.length > 80 || typeof active !== 'boolean') {
    throw new Error('Choose a valid role and account status.');
  }
  const access = await supabase.rpc('has_tenant_permission', {
    p_tenant_id: tenantId, p_permission_id: 'admin_users.manage',
  });
  if (access.error || access.data !== true) throw new Error('You are not authorized to manage accounts in this organization.');
  const scope = await supabase.rpc('synesis_tenant_id');
  if (scope.error || scope.data !== tenantId) throw new Error('The selected organization does not match the authenticated server tenant.');
  const { data, error } = await supabase.rpc('admin_update_user_access', {
    p_user_id: userId, p_role_id: roleId.trim(), p_active: active,
  });
  if (error) throw new Error(error.message || 'Account access could not be updated.');
  const result = obj(data);
  if (result.success !== true || result.user_id !== userId || result.tenant_id !== tenantId
    || result.role_id !== roleId.trim() || result.active !== active
    || result.membership_status !== (active ? 'active' : 'inactive')) {
    throw new Error('The server did not confirm the organization role and account status update.');
  }
  const finalScope = await supabase.rpc('synesis_tenant_id');
  if (finalScope.error || finalScope.data !== tenantId) {
    throw new Error('Account access changed, but the organization context changed before confirmation. Refresh the directory.');
  }
}

export async function loadRealUserEffectivePermissions(tenantId: string, userId: string): Promise<RealEffectivePermission[]> {
  uuid(tenantId, 'organization identifier');
  uuid(userId, 'account identifier');
  if (!await permit(tenantId, 'admin_users.view') || !await permit(tenantId, 'employees.view')) {
    throw new Error('You are not authorized to inspect account permissions in this organization.');
  }
  if (!await permit(tenantId, 'roles.view') && !await permit(tenantId, 'roles.manage')
    && !await permit(tenantId, 'admin_users.manage')) {
    throw new Error('Role permission visibility is not authorized for this organization.');
  }
  const scope = await supabase.rpc('synesis_tenant_id');
  if (scope.error || scope.data !== tenantId) throw new Error('The selected organization does not match the authenticated server tenant.');

  const membership = await supabase.from('tenant_memberships').select('tenant_id,user_id,role,status')
    .eq('tenant_id', tenantId).eq('user_id', userId).maybeSingle();
  if (membership.error) throw new Error('The organization role could not be read.');
  if (!membership.data) return [];
  const member = obj(membership.data);
  if (uuid(member.tenant_id, 'membership organization') !== tenantId
    || uuid(member.user_id, 'membership account') !== userId
    || (member.status !== 'active' && member.status !== 'inactive')) {
    throw new Error('The server returned an invalid organization membership.');
  }
  if (member.status !== 'active') return [];

  const roleId = str(member.role, 'membership role');
  const [role, account] = await Promise.all([
    supabase.from('roles').select('id,active').eq('id', roleId).maybeSingle(),
    supabase.from('admin_users').select('user_id,active,is_super_admin').eq('user_id', userId).maybeSingle(),
  ]);
  if (role.error || account.error) throw new Error('Role activation or sign-in status could not be verified.');
  if (!role.data || !account.data) throw new Error('The account permission state is unavailable.');
  const roleRow = obj(role.data); const accountRow = obj(account.data);
  if (str(roleRow.id, 'role identifier') !== roleId || typeof roleRow.active !== 'boolean'
    || uuid(accountRow.user_id, 'account identifier') !== userId
    || typeof accountRow.active !== 'boolean' || typeof accountRow.is_super_admin !== 'boolean') {
    throw new Error('The server returned an invalid effective-permission state.');
  }
  if (!roleRow.active || !accountRow.active || accountRow.is_super_admin) return [];

  const assignments = await supabase.from('role_permissions').select('permission_id').eq('role_id', roleId);
  if (assignments.error || !Array.isArray(assignments.data)) throw new Error('The role permissions could not be read.');
  const ids = assignments.data.map(input => str(obj(input).permission_id, 'permission identifier'));
  if (new Set(ids).size !== ids.length) throw new Error('The server returned duplicate role permissions.');
  if (!ids.length) return [];
  const catalog = await supabase.from('permissions').select('id,module,action,description').in('id', ids).not('id', 'ilike', 'nadia%');
  if (catalog.error || !Array.isArray(catalog.data) || catalog.data.length !== ids.length) {
    throw new Error('The role permission catalog is incomplete.');
  }
  const result = catalog.data.map(input => {
    const row = obj(input);
    return {
      id: str(row.id, 'permission identifier'), module: str(row.module, 'permission module'),
      action: str(row.action, 'permission action'), description: typeof row.description === 'string' ? row.description : null,
    };
  });
  const finalScope = await supabase.rpc('synesis_tenant_id');
  if (finalScope.error || finalScope.data !== tenantId) throw new Error('Organization access changed while loading effective permissions.');
  return result.sort((a, b) => a.module.localeCompare(b.module) || a.action.localeCompare(b.action));
}
function uuid(value: unknown, field: string): string {
  const result = str(value, field);
  if (!uuidPattern.test(result)) throw new Error('The server returned an invalid ' + field + '.');
  return result;
}
function obj(input: unknown): Record<string, unknown> {
  if (!input || Array.isArray(input) || typeof input !== 'object') {
    throw new Error('The server returned an invalid authorized user record.');
  }
  return input as Record<string, unknown>;
}
async function permit(tenantId: string, permission: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_tenant_permission', {
    p_tenant_id: tenantId, p_permission_id: permission,
  });
  if (error) throw new Error('Server access verification failed. Retry.');
  return data === true;
}

export async function loadRealLinkedUserPage(
  tenantId: string, page = 0, nameSearch = '',
): Promise<RealLinkedUserPage> {
  uuid(tenantId, 'organization identifier');
  if (!Number.isSafeInteger(page) || page < 0 || page > 100000) throw new Error('Invalid directory page.');
  if (nameSearch.trim().length > 80) throw new Error('Search cannot exceed 80 characters.');

  // Both permissions are required. Never substitute a preview role or browser JWT claim.
  if (!await permit(tenantId, 'admin_users.view') || !await permit(tenantId, 'employees.view')) {
    throw new Error('You are not authorized to view real user accounts in this organization.');
  }
  // Read the effective role from the selected tenant membership. user_roles is
  // a legacy global mirror and is not used by the authorization resolver.
  const scoped = await supabase.rpc('synesis_tenant_id');
  if (scoped.error || scoped.data !== tenantId) {
    throw new Error('The selected organization does not match the authenticated server tenant.');
  }
  const organizationNamesAvailable =
    await permit(tenantId, 'organization.view') || await permit(tenantId, 'organization.manage');
  const offset = page * REAL_USER_DIRECTORY_PAGE_SIZE;
  let query = supabase.from('employees').select(
    'id,tenant_id,user_id,employee_number,full_name,official_email,employment_status,department_id,designation_id',
    { count: 'exact' },
  ).eq('tenant_id', tenantId).not('user_id', 'is', null);
  if (nameSearch.trim()) query = query.ilike('full_name', '%' + nameSearch.trim() + '%');
  const employeeResult = await query.order('full_name', { ascending: true })
    .range(offset, offset + REAL_USER_DIRECTORY_PAGE_SIZE - 1);
  if (employeeResult.error) throw new Error('Authorized user directory could not be loaded. Retry.');
  if (!Array.isArray(employeeResult.data) || typeof employeeResult.count !== 'number'
    || employeeResult.count < 0) throw new Error('The server returned an incomplete directory page.');

  const employees = employeeResult.data.map(input => {
    const row = obj(input);
    if (uuid(row.tenant_id, 'tenant identifier') !== tenantId) {
      throw new Error('The server returned a record outside the selected organization.');
    }
    return {
      userId: uuid(row.user_id, 'account identifier'),
      employeeId: uuid(row.id, 'employee identifier'),
      employeeNumber: str(row.employee_number, 'employee number'),
      fullName: str(row.full_name, 'employee name'),
      officialEmail: str(row.official_email, 'official email'),
      employmentStatus: str(row.employment_status, 'employment status'),
      departmentId: row.department_id == null ? null : uuid(row.department_id, 'department identifier'),
      designationId: row.designation_id == null ? null : uuid(row.designation_id, 'designation identifier'),
    };
  });
  const ids = employees.map(e => e.userId);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate linked account identities were returned.');
  if (!ids.length) return {
    tenantId, rows: [], page, total: employeeResult.count,
    hasNext: offset < employeeResult.count, organizationNamesAvailable,
  };

  const [roleResult, adminResult] = await Promise.all([
    supabase.from('tenant_memberships').select('user_id,tenant_id,role,status')
      .eq('tenant_id', tenantId).in('user_id', ids),
    supabase.from('admin_users').select('user_id,active,is_super_admin').in('user_id', ids),
  ]);
  if (roleResult.error || adminResult.error || !Array.isArray(roleResult.data) || !Array.isArray(adminResult.data)) {
    throw new Error('Authorized account roles or admin status could not be loaded.');
  }
  const memberIds = new Set(ids);
  const roleMap = new Map<string, Set<string>>();
  const membershipStatusMap = new Map<string, 'active' | 'inactive'>();
  for (const raw of roleResult.data) {
    const row = obj(raw); const id = uuid(row.user_id, 'role owner');
    if (!memberIds.has(id)) throw new Error('The server returned an unauthorized role.');
    if (uuid(row.tenant_id, 'role tenant') !== tenantId) throw new Error('The server returned an account role outside the selected organization.');
    if (row.status !== 'active' && row.status !== 'inactive') throw new Error('The server returned an invalid membership status.');
    if (!roleMap.has(id)) roleMap.set(id, new Set());
    roleMap.get(id)!.add(str(row.role, 'assigned role'));
    membershipStatusMap.set(id, row.status);
  }
  const adminMap = new Map<string, { active: boolean; isSuperAdmin: boolean }>();
  for (const raw of adminResult.data) {
    const row = obj(raw); const id = uuid(row.user_id, 'admin status owner');
    if (!memberIds.has(id) || typeof row.active !== 'boolean' || typeof row.is_super_admin !== 'boolean') {
      throw new Error('The server returned an unauthorized administrative record.');
    }
    adminMap.set(id, { active: row.active, isSuperAdmin: row.is_super_admin });
  }

  const departments = new Map<string, string>();
  const designations = new Map<string, string>();
  if (organizationNamesAvailable) {
    const departmentIds = [...new Set(employees.map(e => e.departmentId).filter((v): v is string => !!v))];
    const designationIds = [...new Set(employees.map(e => e.designationId).filter((v): v is string => !!v))];
    const [d, t] = await Promise.all([
      departmentIds.length ? supabase.from('departments').select('id,tenant_id,name').eq('tenant_id', tenantId).in('id', departmentIds) : Promise.resolve({ data: [], error: null }),
      designationIds.length ? supabase.from('designations').select('id,tenant_id,title').eq('tenant_id', tenantId).in('id', designationIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (d.error || t.error || !Array.isArray(d.data) || !Array.isArray(t.data)) {
      throw new Error('Authorized organization references could not be loaded.');
    }
    for (const input of d.data) {
      const row = obj(input);
      if (uuid(row.tenant_id, 'department tenant') !== tenantId) throw new Error('Foreign department returned.');
      departments.set(uuid(row.id, 'department'), str(row.name, 'department name'));
    }
    for (const input of t.data) {
      const row = obj(input);
      if (uuid(row.tenant_id, 'designation tenant') !== tenantId) throw new Error('Foreign designation returned.');
      designations.set(uuid(row.id, 'designation'), str(row.title, 'designation title'));
    }
  }

  // A second check prevents displaying stale results after a scope/permission change.
  const finalScope = await supabase.rpc('synesis_tenant_id');
  if (finalScope.error || finalScope.data !== tenantId
    || !await permit(tenantId, 'admin_users.view')
    || !await permit(tenantId, 'employees.view')) {
    throw new Error('Account access changed during loading. Refresh and sign in again if necessary.');
  }
  return {
    tenantId, page, total: employeeResult.count,
    hasNext: offset + employees.length < employeeResult.count,
    organizationNamesAvailable,
    rows: employees.map(e => ({
      userId: e.userId,
      employeeId: e.employeeId,
      employeeNumber: e.employeeNumber,
      fullName: e.fullName,
      officialEmail: e.officialEmail,
      employmentStatus: e.employmentStatus,
      roles: [...(roleMap.get(e.userId) || new Set<string>())],
      department: e.departmentId ? departments.get(e.departmentId) || null : null,
      designation: e.designationId ? designations.get(e.designationId) || null : null,
      membershipStatus: membershipStatusMap.get(e.userId) ?? null,
      adminActive: adminMap.get(e.userId)?.active ?? null,
      isSuperAdmin: adminMap.get(e.userId)?.isSuperAdmin ?? false,
    })),
  };
}

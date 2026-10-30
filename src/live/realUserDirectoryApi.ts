import { supabase } from '../lib/supabase';

// Candidate WS08 REAL_AUTH_SQL read-only directory. Not production-routed.
// WS02 must approve exact RLS/role/tenant contracts before enabling this UI.
export const REAL_USER_DIRECTORY_PAGE_SIZE = 50;
export type RealLinkedUser = {
  userId: string; employeeId: string; employeeNumber: string;
  fullName: string; officialEmail: string; employmentStatus: string;
  roles: string[]; department: string | null; designation: string | null;
  adminActive: boolean | null; isSuperAdmin: boolean;
};
export type RealLinkedUserPage = {
  tenantId: string; rows: RealLinkedUser[]; page: number;
  total: number; hasNext: boolean; organizationNamesAvailable: boolean;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('The server returned an invalid ' + field + '.');
  return value.trim();
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
  // Existing user_roles/admin_users SELECT policies resolve this single implicit tenant.
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
    supabase.from('user_roles').select('user_id,role_id').in('user_id', ids),
    supabase.from('admin_users').select('user_id,active,is_super_admin').in('user_id', ids),
  ]);
  if (roleResult.error || adminResult.error || !Array.isArray(roleResult.data) || !Array.isArray(adminResult.data)) {
    throw new Error('Authorized account roles or admin status could not be loaded.');
  }
  const memberIds = new Set(ids);
  const roleMap = new Map<string, Set<string>>();
  for (const raw of roleResult.data) {
    const row = obj(raw); const id = uuid(row.user_id, 'role owner');
    if (!memberIds.has(id)) throw new Error('The server returned an unauthorized role.');
    if (!roleMap.has(id)) roleMap.set(id, new Set());
    roleMap.get(id)!.add(str(row.role_id, 'assigned role'));
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
      adminActive: adminMap.get(e.userId)?.active ?? null,
      isSuperAdmin: adminMap.get(e.userId)?.isSuperAdmin ?? false,
    })),
  };
}

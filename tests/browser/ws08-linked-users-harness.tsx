import { createRoot } from 'react-dom/client';
import { supabase } from '../../src/lib/supabase';
import { RealLinkedUserDirectory } from '../../src/live/RealLinkedUserDirectory';

const tenantId = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const foreignTenant = 'fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const userId = 'f1111111-1111-4111-8111-111111111111';
const employeeId = 'f2222222-2222-4222-8222-222222222222';
const departmentId = 'f3333333-3333-4333-8333-333333333333';
const designationId = 'f4444444-4444-4444-8444-444444444444';
const params = new URLSearchParams(window.location.search);
const mode = params.get('mode') || 'allowed';
const locale = params.get('locale') === 'bn' ? 'bn' : 'en';
const calls: Array<{ table?: string; name?: string; args?: unknown; method?: string }> = [];
(window as Window & { __ws08RealDirectoryCalls?: typeof calls }).__ws08RealDirectoryCalls = calls;
let viewPermissionAttempts = 0;
let currentRoleId = 'hr_admin';
let currentMembershipStatus = 'active';
let currentAdminActive = true;

Object.defineProperty(supabase, 'rpc', {
  configurable: true,
  value: async (name: string, args: unknown) => {
    calls.push({ name, args });
    if (name === 'has_tenant_permission') {
      const permission = (args as { p_permission_id?: string })?.p_permission_id || '';
      if (mode === 'denied' && permission === 'admin_users.view') return { data: false, error: null };
      if (mode === 'revoke' && permission === 'admin_users.view' && viewPermissionAttempts++ >= 1) {
        return { data: false, error: null };
      }
      if (mode === 'no-org' && permission === 'organization.view' || mode === 'no-org' && permission === 'organization.manage') {
        return { data: false, error: null };
      }
      return { data: true, error: null };
    }
    if (name === 'admin_get_my_provisioning_context') return { data: {
      can_manage: true, is_super_admin: true, assignable_roles: [], available_employees: [],
    }, error: null };
    if (name === 'admin_update_user_access') {
      const input = args as { p_user_id: string; p_role_id: string; p_active: boolean };
      currentRoleId = input.p_role_id;
      currentAdminActive = input.p_active;
      currentMembershipStatus = input.p_active ? 'active' : 'inactive';
      return { data: { success: true, user_id: input.p_user_id, tenant_id: tenantId, role_id: input.p_role_id,
        active: input.p_active, membership_status: currentMembershipStatus }, error: null };
    }
    if (name === 'synesis_tenant_id') return {
      data: mode === 'scope-mismatch' ? foreignTenant : tenantId, error: null,
    };
    throw new Error('Unexpected RPC: ' + name);
  },
});

type QueryBuilder = {
  select: (fields: string, options?: unknown) => QueryBuilder;
  eq: (field: string, value: unknown) => QueryBuilder;
  not: (field: string, operation: string, value: unknown) => QueryBuilder;
  ilike: (field: string, value: string) => QueryBuilder;
  in: (field: string, value: unknown[]) => QueryBuilder;
  order: (field: string, value?: unknown) => QueryBuilder;
  range: (begin: number, end: number) => QueryBuilder;
  maybeSingle: () => Promise<unknown>;
  then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise<unknown>;
};
Object.defineProperty(supabase, 'from', {
  configurable: true,
  value: (table: string): QueryBuilder => {
    calls.push({ table, method: 'select' });
    const filters: Record<string, unknown> = {};
    const inFilters: Record<string, unknown[]> = {};
    const query: QueryBuilder = {
      select: () => query,
      eq: (name, value) => { calls.push({ table, method: 'eq', args: { name, value } }); filters[name] = value; return query; },
      not: (name, op, value) => { calls.push({ table, method: 'not', args: { name, op, value } }); return query; },
      ilike: (name, value) => { calls.push({ table, method: 'ilike', args: { name, value } }); return query; },
      in: (name, value) => { calls.push({ table, method: 'in', args: { name, value } }); inFilters[name] = value; return query; },
      order: () => query,
      range: () => query,
      maybeSingle: async () => {
        const result = await queryResult(table, mode, tenantId, userId, employeeId, departmentId, designationId,
          currentRoleId, currentMembershipStatus, currentAdminActive, filters, inFilters);
        return { data: Array.isArray(result.data) ? result.data[0] ?? null : null, error: null };
      },
      then: (ok, fail) => {
        return queryResult(table, mode, tenantId, userId, employeeId, departmentId, designationId,
          currentRoleId, currentMembershipStatus, currentAdminActive, filters, inFilters).then(ok, fail);
      },
    };
    return query;
  },
});

Object.defineProperty(supabase, 'functions', {
  configurable: true,
  value: { invoke: async () => { throw new Error('WS08 read-only directory must not invoke Edge Functions'); } },
});

createRoot(document.getElementById('root')!).render(
  <RealLinkedUserDirectory tenantId={tenantId} tenantName="Authorized Organization" locale={locale}
    canManage={mode === 'manage'} isSuperAdmin={mode === 'manage'} />,
);

async function queryResult(table: string, mode: string, tenantId: string, userId: string, employeeId: string,
  departmentId: string, designationId: string, currentRoleId: string, currentMembershipStatus: string,
  currentAdminActive: boolean, filters: Record<string, unknown>, inFilters: Record<string, unknown[]>):
  Promise<{ data: unknown[]; count: number | null; error: null }> {
  let data: unknown[] = [];
  let count: number | null = null;
  if (table === 'employees') {
    data = mode === 'empty' ? [] : [{
      id: employeeId, tenant_id: mode === 'foreign' ? foreignTenant : tenantId, user_id: userId,
      employee_number: 'EMP-009', full_name: 'Authorized Employee', official_email: 'authorized@example.test',
      employment_status: 'active', department_id: departmentId, designation_id: designationId,
    }];
    count = data.length;
  } else if (table === 'tenant_memberships') {
    data = [{ user_id: userId, tenant_id: tenantId, role: currentRoleId, status: currentMembershipStatus }];
  } else if (table === 'admin_users') {
    data = [{ user_id: userId, active: currentAdminActive, is_super_admin: false }];
  } else if (table === 'roles') {
    data = filters.id ? [{ id: filters.id, active: true }] : [
      { id: 'hr_admin', name: 'HR administrator', description: 'People administration', active: true, is_system: false },
      { id: 'employee', name: 'Employee', description: 'Employee access', active: true, is_system: false },
    ];
  } else if (table === 'role_permissions') {
    data = [{ permission_id: 'employees.view' }, { permission_id: 'employees.compensation.view' }];
  } else if (table === 'permissions') {
    const ids = inFilters.id || [];
    data = [
      { id: 'employees.view', module: 'employees', action: 'view', description: 'View employee records' },
      { id: 'employees.compensation.view', module: 'employees', action: 'view_compensation', description: 'View restricted compensation' },
    ].filter(permission => ids.includes(permission.id));
  } else if (table === 'departments') {
    data = [{ id: departmentId, tenant_id: tenantId, name: 'People Operations' }];
  } else if (table === 'designations') {
    data = [{ id: designationId, tenant_id: tenantId, title: 'HR Specialist' }];
  }
  return { data, count, error: null };
}

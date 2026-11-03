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
  then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise<unknown>;
};
Object.defineProperty(supabase, 'from', {
  configurable: true,
  value: (table: string): QueryBuilder => {
    calls.push({ table, method: 'select' });
    const query: QueryBuilder = {
      select: () => query,
      eq: (name, value) => { calls.push({ table, method: 'eq', args: { name, value } }); return query; },
      not: (name, op, value) => { calls.push({ table, method: 'not', args: { name, op, value } }); return query; },
      ilike: (name, value) => { calls.push({ table, method: 'ilike', args: { name, value } }); return query; },
      in: (name, value) => { calls.push({ table, method: 'in', args: { name, value } }); return query; },
      order: () => query,
      range: () => query,
      then: (ok, fail) => {
        let data: unknown[] = [];
        let count: number | null = null;
        if (table === 'employees') {
          data = mode === 'empty' ? [] : [{
            id: employeeId,
            tenant_id: mode === 'foreign' ? foreignTenant : tenantId,
            user_id: userId,
            employee_number: 'EMP-009',
            full_name: 'Authorized Employee',
            official_email: 'authorized@example.test',
            employment_status: 'active',
            department_id: departmentId,
            designation_id: designationId,
          }];
          count = data.length;
        } else if (table === 'user_roles') {
          data = [{ user_id: userId, role_id: 'hr_admin' }];
        } else if (table === 'admin_users') {
          data = [{ user_id: userId, active: true, is_super_admin: false }];
        } else if (table === 'departments') {
          data = [{ id: departmentId, tenant_id: tenantId, name: 'People Operations' }];
        } else if (table === 'designations') {
          data = [{ id: designationId, tenant_id: tenantId, title: 'HR Specialist' }];
        }
        return Promise.resolve({ data, count, error: null }).then(ok, fail);
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
  <RealLinkedUserDirectory tenantId={tenantId} tenantName="Authorized Organization" locale={locale} />,
);

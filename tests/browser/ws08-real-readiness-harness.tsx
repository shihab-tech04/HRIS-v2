import { createRoot } from 'react-dom/client';
import { supabase } from '../../src/lib/supabase';
import { RealUserProvisioningReadiness } from '../../src/live/RealUserProvisioningReadiness';

const tenantId = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherTenantId = 'fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const options = new URLSearchParams(window.location.search);
const mode = options.get('mode') || 'success';
const locale = options.get('locale') === 'bn' ? 'bn' : 'en';
const calls: Array<{ name: string; args: unknown }> = [];
(window as Window & { __ws08Calls?: typeof calls }).__ws08Calls = calls;
let attempts = 0;
let accountCreated = false;

Object.defineProperty(supabase, 'rpc', {
  configurable: true,
  value: async (name: string, args?: unknown) => {
    calls.push({ name, args });
    if (name === 'has_tenant_permission') {
      if (mode === 'denied') return { data: false, error: null };
      if (mode === 'retry' && attempts++ === 0) return { data: null, error: new Error('Transient permission failure') };
      return { data: true, error: null };
    }
    if (name === 'synesis_tenant_id') {
      return { data: mode === 'scope-mismatch' ? otherTenantId : tenantId, error: null };
    }
    if (name === 'admin_get_my_provisioning_context') {
      return {
        data: {
          can_manage: true,
          is_super_admin: false,
          assignable_roles: mode === 'empty' ? [] : [{
            id: 'hr_admin', name: 'HR Administrator', description: 'Tenant role',
          }],
          available_employees: mode === 'empty' || mode === 'no-employees' || accountCreated ? [] : [{
            id: 'fccccccc-cccc-4ccc-8ccc-cccccccccccc',
            employee_number: 'EMP-009',
            full_name: 'Authorized Employee',
            official_email: 'authorized@example.test',
          }],
        },
        error: null,
      };
    }
    throw new Error('Unexpected RPC ' + name);
  },
});

Object.defineProperty(supabase, 'functions', {
  configurable: true,
  value: {
    invoke: async (name: string, args?: { body?: Record<string, string> }) => {
      calls.push({ name: 'edge:' + name, args: { ...args?.body, password: '[hidden]' } });
      if (name !== 'admin-create-user') throw new Error('Unexpected Edge Function ' + name);
      if (mode === 'sql-error') return {
        data: null,
        error: { context: { json: async () => ({ error: 'SQL finalization rejected; account not created.' }) } },
      };
      accountCreated = true;
      return {
        data: { success: true, user: { id: 'fddddddd-dddd-4ddd-8ddd-dddddddddddd', email: args?.body?.email } },
        error: null,
      };
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <RealUserProvisioningReadiness tenantId={tenantId} tenantName="Authorized Test Organization" locale={locale} />,
);

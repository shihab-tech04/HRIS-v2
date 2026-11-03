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
          available_employees: mode === 'empty' ? [] : [{
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
  value: { invoke: async () => { throw new Error('Read-only WS08 panel must never invoke Edge Functions'); } },
});

createRoot(document.getElementById('root')!).render(
  <RealUserProvisioningReadiness tenantId={tenantId} tenantName="Authorized Test Organization" locale={locale} />,
);

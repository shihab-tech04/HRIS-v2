import { createRoot } from 'react-dom/client';
import { supabase } from '../../src/lib/supabase';
import { RealPasswordProvisioningForm } from '../../src/live/RealPasswordProvisioningForm';

const tenantId = 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const employeeId = 'fccccccc-cccc-4ccc-8ccc-cccccccccccc';
const authId = 'fddddddd-dddd-4ddd-8ddd-dddddddddddd';
const options = new URLSearchParams(window.location.search);
const mode = options.get('mode') || 'success';
const mutationApproved = options.get('enabled') === '1';
const locale = options.get('locale') === 'bn' ? 'bn' : 'en';
const calls: Array<{ kind: string; name: string; args?: unknown; bodyKeys?: string[]; email?: string; roleId?: string; employeeId?: string }> = [];
(window as Window & { __ws08CreateCalls?: typeof calls }).__ws08CreateCalls = calls;

Object.defineProperty(supabase, 'rpc', {
  configurable: true,
  value: async (name: string, args: unknown) => {
    calls.push({ kind: 'rpc', name, args });
    if (name === 'has_tenant_permission') return { data: mode !== 'denied', error: null };
    if (name === 'synesis_tenant_id') return {
      data: mode === 'scope-mismatch' ? 'fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' : tenantId, error: null,
    };
    if (name === 'admin_get_my_provisioning_context') return {
      data: {
        can_manage: true, is_super_admin: false,
        assignable_roles: mode === 'empty' ? [] : [{ id: 'hr_admin', name: 'HR Administrator' }],
        available_employees: mode === 'empty' ? [] : [{
          id: employeeId, employee_number: 'EMP-002', full_name: 'Legitimate Employee',
          official_email: 'legitimate@example.test',
        }],
      }, error: null,
    };
    throw Error('unexpected RPC: ' + name);
  },
});
Object.defineProperty(supabase, 'functions', {
  configurable: true,
  value: {
    invoke: async (name: string, { body }: { body: Record<string, unknown> }) => {
      // Only log the allowed field names to avoid persisting the test password.
      calls.push({
        kind: 'function', name, bodyKeys: Object.keys(body).sort(),
        email: String(body.email), roleId: String(body.roleId), employeeId: String(body.employeeId),
      });
      if (mode === 'duplicate') return { data: { error: 'An account with this email already exists.' }, error: new Error('409') };
      if (mode === 'interrupted') throw new Error('Network disconnect');
      if (mode === 'unconfirmed') return { data: { success: true, user: null }, error: null };
      return { data: {
        success: true, user: { id: authId, email: 'legitimate@example.test' },
      }, error: null };
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <RealPasswordProvisioningForm
    tenantId={tenantId} tenantName="Authenticated test tenant" locale={locale}
    mutationApproved={mutationApproved}
  />,
);

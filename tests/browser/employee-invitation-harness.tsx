import { createRoot } from 'react-dom/client';
import { OrganizationEmployeeDirectory } from '../../src/live/OrganizationEmployeeDirectory';
import { supabase } from '../../src/lib/supabase';

type RecordedCall = { kind: string; name?: string; payload?: Record<string, unknown>; args?: unknown };
declare global {
  interface Window { __hrisInvitationCalls: RecordedCall[] }
}

const calls: RecordedCall[] = [];
window.__hrisInvitationCalls = calls;
const mode = new URLSearchParams(window.location.search).get('mode') || 'manager';
const locale = new URLSearchParams(window.location.search).get('locale') === 'bn' ? 'bn' : 'en';
let reissueAttempts = 0;

const directoryPayload = {
  employees: [{
    employee_id: 'fccccccc-cccc-4ccc-8ccc-cccccccccccc',
    employee_number: 'E-009',
    full_name: 'Pending Employee',
    department_id: null,
    department_name: null,
    designation_title: null,
    team_name: null,
    employment_status: 'active',
    invitation: {
      id: 'fddddddd-dddd-4ddd-8ddd-dddddddddddd',
      status: 'expired',
      expires_at: '2026-01-01T00:00:00.000Z',
    },
  }],
  departments: [],
  teams: [],
  available_statuses: ['active'],
  total_count: 1,
};

Object.defineProperty(supabase, 'rpc', {
  configurable: true,
  value: async (name: string, args: unknown) => {
    calls.push({ kind: 'rpc', name, args });
    if (name === 'hris_get_tenant_employee_directory_v2') {
      return { data: directoryPayload, error: null };
    }
    return { data: null, error: null };
  },
});
Object.defineProperty(supabase, 'functions', {
  configurable: true,
  value: {
    invoke: async (name: string, options: { body?: Record<string, unknown> }) => {
      calls.push({ kind: 'function', name, payload: options.body });
      if (mode === 'retry' && options.body?.mode === 'resend' && reissueAttempts++ === 0) {
        return { data: null, error: new Error('temporary delivery failure') };
      }
      return {
        data: {
          success: true,
          invitation_id: 'feeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          already_sent: false,
        },
        error: null,
      };
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <OrganizationEmployeeDirectory
    tenantId="faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    locale={locale}
    employeesManage={mode !== 'readonly'}
  />,
);

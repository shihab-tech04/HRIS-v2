import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EmployeeInvitationAcceptance } from '../../src/live/LiveApp';
import { supabase } from '../../src/lib/supabase';

type RecordedCall = { kind: string; name?: string };

const calls: RecordedCall[] = [];
const testWindow = window as Window & { __hrisInvitationCalls?: RecordedCall[] };
testWindow.__hrisInvitationCalls = calls;
const params = new URLSearchParams(window.location.search);
const locale = params.get('locale') === 'bn' ? 'bn' : 'en';
let acceptAttempts = 0;

Object.defineProperty(supabase.auth, 'updateUser', {
  configurable: true,
  value: async () => {
    calls.push({ kind: 'password_saved' });
    return { data: { user: { id: 'fbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } }, error: null };
  },
});
Object.defineProperty(supabase, 'rpc', {
  configurable: true,
  value: async (name: string) => {
    calls.push({ kind: 'rpc', name });
    if (name !== 'hris_accept_employee_invitation') {
      return { data: null, error: new Error('unexpected RPC') };
    }
    if (params.get('mode') === 'retry' && acceptAttempts++ === 0) {
      return { data: null, error: new Error('temporary acceptance failure') };
    }
    return {
      data: {
        accepted: true,
        tenant_id: 'faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        tenant_name: 'Acceptance Fixture',
        employee_id: 'fccccccc-cccc-4ccc-8ccc-cccccccccccc',
        idempotent: false,
      },
      error: null,
    };
  },
});

function Harness() {
  const [acceptedTenantId, setAcceptedTenantId] = useState('');
  if (acceptedTenantId) {
    return <main><p role="status">Employee invitation accepted for {acceptedTenantId}</p></main>;
  }
  return <EmployeeInvitationAcceptance
    invitationId="fddddddd-dddd-4ddd-8ddd-dddddddddddd"
    locale={locale}
    onAccepted={setAcceptedTenantId}
  />;
}

createRoot(document.getElementById('root')!).render(<Harness />);

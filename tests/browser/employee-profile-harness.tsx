import React from 'react';
import { createRoot } from 'react-dom/client';
import { EmployeeProfileFigma } from '../../src/live/EmployeeProfileFigma';
import { supabase } from '../../src/lib/supabase';
import '../../src/index.css';

type FixtureResult = { data: unknown; error: Error | null };
type FixtureClient = { rpc: (name: string, args: unknown) => Promise<FixtureResult> };

const query = new URLSearchParams(window.location.search);
const locale = query.get('locale') === 'bn' ? 'bn' : 'en';
const state = query.get('state') || 'sparse';
const tenantId = query.get('tenant') || 'local-visual-tenant';
document.documentElement.lang = locale;

const employee = state === 'synthetic' || state === 'tenant-switch' ? {
  full_name: 'Synthetic QA Employee',
  employee_number: 'QA-EMP-001',
  official_email: 'qa.employee@example.invalid',
  official_phone: '+880 2 555 0100',
  designation_title: 'Design Review Fixture',
  department_name: 'Synthetic Organization',
  team_name: 'Visual QA',
} : {};

const client = supabase as unknown as FixtureClient;
Object.defineProperty(client, 'rpc', {
  configurable: true,
  value: async (name: string, args: unknown): Promise<FixtureResult> => {
    if (name !== 'hris_get_my_dashboard_data') return { data: null, error: new Error('Unexpected local fixture RPC') };
    if (state === 'loading') return new Promise<FixtureResult>(() => undefined);
    if (state === 'tenant-switch' && (args as { p_tenant_id?: unknown })?.p_tenant_id === 'switched-local-tenant') {
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    if (state === 'error') return { data: null, error: new Error('Local fixture error') };
    if (state === 'empty') return { data: { employee: null }, error: null };
    if (state === 'tenant-mismatch') return { data: { tenant_id: 'different-local-tenant', employee }, error: null };
    if (state === 'employee-tenant-mismatch') return { data: { employee: { tenant_id: 'different-local-tenant' } }, error: null };
    return { data: { employee }, error: null };
  },
});

function EmployeeProfileFixture() {
  const [activeTenant, setActiveTenant] = React.useState(tenantId);
  return <div className="min-h-screen bg-[#EFF7F8]">
    <div data-testid="fixture-note" className="sr-only">Local visual fixture only. No production employee data is loaded.</div>
    {state === 'tenant-switch' && <button type="button" onClick={() => setActiveTenant('switched-local-tenant')}
      className="absolute left-2 top-2 z-10 min-h-10 rounded border border-slate-400 bg-white px-3 text-sm">
      Switch local fixture tenant
    </button>}
    <div className="flex min-h-screen">
      <aside aria-hidden="true" className="hidden w-[111px] shrink-0 bg-[#E7F1F3] lg:block" />
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:pl-[50px] lg:pr-8 lg:pt-[102px] lg:pb-8">
        <div className="mx-auto w-full max-w-[1600px]">
          <EmployeeProfileFigma tenantId={activeTenant} locale={locale} />
        </div>
      </main>
    </div>
  </div>;
}

createRoot(document.getElementById('root')!).render(<EmployeeProfileFixture />);

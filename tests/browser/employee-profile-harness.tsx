import React from 'react';
import { createRoot } from 'react-dom/client';
import { EmployeeProfileFigma } from '../../src/live/EmployeeProfileFigma';
import { supabase } from '../../src/lib/supabase';
import '../../src/index.css';

type FixtureResult = { data: unknown; error: Error | null };
type FixtureClient = { rpc: (name: string, args: unknown) => Promise<FixtureResult> };
declare global {
  interface Window {
    __profileFixtureCalls: Array<{ name: string; args: unknown }>;
  }
}

const query = new URLSearchParams(window.location.search);
const locale = query.get('locale') === 'bn' ? 'bn' : 'en';
const state = query.get('state') || 'sparse';
const tenantId = query.get('tenant') || 'local-visual-tenant';
document.documentElement.lang = locale;

const employee = state === 'synthetic' || state === 'tenant-switch' || state === 'employment-details' || state === 'save-error' ? {
  full_name: 'Synthetic QA Employee',
  employee_number: 'QA-EMP-001',
  official_email: 'qa.employee@example.invalid',
  official_phone: '+880 2 555 0100',
  personal_email: 'qa.personal@example.invalid',
  phone: '+880 1700 000001',
  address: 'Synthetic present address',
  mailing_address: 'Synthetic permanent address',
  father_name: 'Synthetic father',
  mother_name: 'Synthetic mother',
  date_of_birth: '1990-01-02',
  birthplace: 'Synthetic birthplace',
  blood_group: 'O+',
  gender: 'Other',
  religion: 'Synthetic religion',
  nationality: 'Bangladeshi',
  marital_status: 'Single',
  nid_number: 'synthetic-nid-0123456789',
  passport_number: 'synthetic-passport-12345',
  etin_number: 'synthetic-etin-012345',
  emergency_contact_name: 'Synthetic emergency contact',
  emergency_contact_phone: '+880 1700 000101',
  emergency_contact_relation: 'Parent',
  designation_title: 'Design Review Fixture',
  department_name: 'Synthetic Organization',
  team_name: 'Visual QA',
} : {};

const client = supabase as unknown as FixtureClient;
const calls: Window['__profileFixtureCalls'] = [];
// Only the disposable browser fixture tracks deleted rows; no production records are modified.
const deletedProfileRecords = new Set<string>();
window.__profileFixtureCalls = calls;
Object.defineProperty(client, 'rpc', {
  configurable: true,
  value: async (name: string, args: unknown): Promise<FixtureResult> => {
    calls.push({ name, args });
    if (name === 'employee_get_my_employment_info_v1') {
      if (state !== 'employment-details') return { data: null, error: new Error('E02-09 optional RPC not installed in this fixture') };
      return { data: [{
        joining_date: '2022-05-01', employment_type: 'Permanent',
        designation_title: 'Design Review Fixture', department_name: 'Synthetic Organization',
        manager_name: 'Synthetic Manager', work_location_name: 'Synthetic Dhaka HQ',
        grade_name: 'Synthetic Grade 7',
      }], error: null };
    }
    if (name === 'employee_submit_profile_change_request') {
      if (state === 'save-error') return { data: null, error: new Error('Synthetic profile request rejection') };
      return { data: 'synthetic-profile-request-id', error: null };
    }
    if (name === 'employee_delete_my_profile_record_v1') {
      if (query.get('delete') === 'error') {
        return { data: null, error: new Error('Synthetic profile deletion rejection') };
      }
      const record = args as { p_kind?: string; p_record_id?: string };
      if (!record.p_record_id || !['education', 'experience', 'family'].includes(record.p_kind || '')) {
        return { data: null, error: new Error('Invalid synthetic profile record') };
      }
      deletedProfileRecords.add(`${record.p_kind}:${record.p_record_id}`);
      return { data: true, error: null };
    }
    if (name.startsWith('employee_save_my_')) return { data: 'synthetic-profile-row-id', error: null };
    if (name !== 'employee_get_my_profile_v1') return { data: null, error: new Error('Unexpected local fixture RPC') };
    if (state === 'loading') return new Promise<FixtureResult>(() => undefined);
    if (state === 'tenant-switch' && (args as { p_tenant_id?: unknown })?.p_tenant_id === 'switched-local-tenant') {
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    if (state === 'error') return { data: null, error: new Error('Local fixture error') };
    const requestedTenant = (args as { p_tenant_id?: string })?.p_tenant_id || tenantId;
    const responseTenant = state === 'tenant-mismatch' ? 'different-local-tenant' : requestedTenant;
    const responseEmployee = state === 'empty' ? null
      : state === 'employee-tenant-mismatch' ? { ...employee, tenant_id: 'different-local-tenant' }
        : employee;
    return { data: {
      tenant_id: responseTenant,
      employee: responseEmployee,
      education: state === 'synthetic' && !deletedProfileRecords.has('education:synthetic-education-id') ? [{
        id: 'synthetic-education-id', education_level: 'Bachelor', institution: 'Synthetic University',
        subject_major: 'Design', degree_title: 'Bachelor of Design', result_type: 'GPA', result: '3.8',
        currently_studying: false, starting_year: 2015, passing_year: 2019, duration: '4 years',
        achievements: 'Synthetic design award',
      }] : [],
      experience: state === 'synthetic' && !deletedProfileRecords.has('experience:synthetic-experience-id') ? [{
        id: 'synthetic-experience-id', role_title: 'Product Designer', company: 'Synthetic Studio',
        job_type: 'Full time', company_website: 'https://example.invalid', joining_date: '2020-01-01',
        departure_date: '2022-01-01', total_duration: '2 years', office_address: 'Synthetic office',
        description: 'Synthetic responsibilities',
      }] : [],
      training: state === 'synthetic' ? [{
        id: 'synthetic-training-id', title: 'Synthetic training', institute_name: 'QA Institute',
        training_number: 'TRAIN-001', year: '2024', duration: '3 days',
        certificate_url: 'synthetic/profile-certificates/training.pdf',
      }] : [],
      certifications: state === 'synthetic' ? [{
        id: 'synthetic-certification-id', title: 'Synthetic certification', institute_name: 'QA Board',
        issue_date: '2023-01-01', expiry_date: '2027-01-01',
        certificate_document_url: 'synthetic/profile-certificates/certification.pdf',
      }] : [],
      family_members: state === 'synthetic' && !deletedProfileRecords.has('family:synthetic-family-id') ? [{
        id: 'synthetic-family-id', name: 'Synthetic family member', phone: '+880 1700 000202',
        nid_number: 'synthetic-family-nid', date_of_birth: '1992-02-03', relationship: 'Sibling',
        present_address: 'Synthetic family present address', permanent_address: 'Synthetic family permanent address',
        is_nominee: true,
      }] : [],
      bank: state === 'synthetic' ? {
        bank_name: 'Synthetic Bank', account_number: 'synthetic-bank-secret-123456',
        branch_name: 'QA Branch', routing_number: '123456789',
      } : null,
    }, error: null };
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

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Locale } from './project-locale';
import addressBookIcon from '../assets/employee-figma/address-book.svg';
import graduationCapIcon from '../assets/employee-figma/graduation-cap.svg';
import editPenIcon from '../assets/employee-figma/edit-pen.svg';

type Profile = Record<string, unknown>;
type Panel = 'personal' | 'experience' | 'training' | 'bank' | 'family';
type LoadState = { tenantId: string; employee: Profile } | null;

const copy = {
  en: {
    heading: 'My Profile',
    intro: 'Personal and employment information',
    personal: 'Personal & Educational Information',
    experience: 'Work Experience',
    training: 'Training & certification',
    bank: 'Bank',
    family: 'Family & Nominee',
    name: 'Name',
    id: 'ID',
    email: 'Official email',
    designation: 'Designation',
    department: 'Department',
    team: 'Team',
    phone: 'Official phone',
    status: 'Employment status',
    personalInformation: 'Personal information',
    educationalInformation: 'Educational information',
    unavailable: 'Not available',
    missingSection: 'This information is not available through an approved employee read service.',
    missingEducation: 'Educational records are not available through an approved employee read service.',
    loading: 'Loading your profile…',
    error: 'Your employee profile could not be loaded.',
    retry: 'Retry',
    edit: 'Edit',
    editUnavailable: 'Editing is unavailable until the required approval and API contract are verified',
  },
  bn: {
    heading: 'আমার প্রোফাইল',
    intro: 'ব্যক্তিগত ও কর্মসংস্থান সংক্রান্ত তথ্য',
    personal: 'ব্যক্তিগত ও শিক্ষাগত তথ্য',
    experience: 'কর্ম-অভিজ্ঞতা',
    training: 'প্রশিক্ষণ ও সনদ',
    bank: 'ব্যাংক',
    family: 'পরিবার ও মনোনীত ব্যক্তি',
    name: 'নাম',
    id: 'আইডি',
    email: 'অফিসিয়াল ইমেইল',
    designation: 'পদবি',
    department: 'বিভাগ',
    team: 'টিম',
    phone: 'অফিসিয়াল ফোন',
    status: 'কর্মসংস্থানের অবস্থা',
    personalInformation: 'ব্যক্তিগত তথ্য',
    educationalInformation: 'শিক্ষাগত তথ্য',
    unavailable: 'তথ্য পাওয়া যায়নি',
    missingSection: 'অনুমোদিত কর্মী তথ্যসেবা থেকে এই তথ্য পাওয়া যাচ্ছে না।',
    missingEducation: 'অনুমোদিত কর্মী তথ্যসেবা থেকে শিক্ষাগত তথ্য পাওয়া যাচ্ছে না।',
    loading: 'আপনার প্রোফাইল লোড হচ্ছে…',
    error: 'আপনার কর্মী প্রোফাইল লোড করা যায়নি।',
    retry: 'আবার চেষ্টা করুন',
    edit: 'সম্পাদনা',
    editUnavailable: 'অনুমোদন ও এপিআই চুক্তি যাচাই না হওয়া পর্যন্ত সম্পাদনা সম্ভব নয়',
  },
} as const;

function textValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function EmployeeProfileFigma({ tenantId, locale }: { tenantId: string; locale: Locale }) {
  const words = copy[locale === 'bn' ? 'bn' : 'en'];
  const [panel, setPanel] = useState<Panel>('personal');
  const [loaded, setLoaded] = useState<LoadState>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let current = true;
    setLoaded(null);
    setLoading(true);
    setFailed(false);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('hris_get_my_dashboard_data', { p_tenant_id: tenantId });
        if (error) throw error;
        const record: unknown = data;
        if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid dashboard data');
        const employee: unknown = (record as Profile).employee;
        if (!employee || typeof employee !== 'object' || Array.isArray(employee)) throw new Error('No employee record');
        const profile = employee as Profile;
        if (typeof profile.tenant_id === 'string' && profile.tenant_id !== tenantId) throw new Error('Tenant mismatch');
        if (current) setLoaded({ tenantId, employee: profile });
      } catch {
        if (current) setFailed(true);
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => { current = false; };
  }, [tenantId, revision]);

  const employee = loaded?.tenantId === tenantId ? loaded.employee : null;
  const value = (key: string) => textValue(employee?.[key], words.unavailable);
  const name = value('full_name');
  const initials = name === words.unavailable ? '—' :
    name.split(/\s+/).filter(Boolean).slice(0, 2).map(item => item[0].toUpperCase()).join('');

  const tabs: { id: Panel; text: string }[] = [
    { id: 'personal', text: words.personal },
    { id: 'experience', text: words.experience },
    { id: 'training', text: words.training },
    { id: 'bank', text: words.bank },
    { id: 'family', text: words.family },
  ];

  function field(label: string, content: string) {
    return <div className="grid min-w-0 gap-1 border-b border-slate-100 py-3 last:border-0 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-5" key={label}>
      <dt className="text-sm text-[#969696]">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-[#3D3D3D]">{content}</dd>
    </div>;
  }

  return <section data-employee-figma-profile className="min-w-0 space-y-5" aria-labelledby="employee-figma-profile-heading">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="employee-figma-profile-heading" className="text-2xl font-medium text-[#49454F]">{words.heading}</h2>
        <p className="mt-1 text-sm text-slate-600">{words.intro}</p>
      </div>
      {failed && <button type="button" onClick={() => setRevision(value => value + 1)} disabled={loading}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm text-[#085587] hover:bg-[#EFF7F8] focus-visible:outline-2 focus-visible:outline-[#085587] disabled:opacity-50">
        <RefreshCw aria-hidden="true" className="h-4 w-4" />{words.retry}
      </button>}
    </header>

    {(loading || !employee) && !failed && <p role="status" className="rounded-lg bg-white p-5 text-sm text-slate-600">{words.loading}</p>}
    {failed && <div role="alert" className="rounded-lg border border-rose-200 bg-white p-5 text-sm text-rose-900">{words.error}</div>}

    {employee && <>
      <div className="grid min-w-0 gap-4 md:grid-cols-[203px_minmax(0,1fr)] xl:grid-cols-[203px_minmax(0,1fr)_minmax(0,1fr)] xl:gap-6">
        <div className="grid h-[203px] w-[203px] max-w-full place-items-center rounded-lg bg-[#6FB1E1] p-2" aria-label={words.name + ': ' + name}>
          <span className="grid h-full w-full place-items-center rounded bg-[#EFF7F8] text-4xl font-medium text-[#085587]" aria-hidden="true">{initials}</span>
        </div>
        <dl className="min-w-0 rounded-lg bg-white p-4">
          {field(words.name, name)}
          {field(words.id, value('employee_number'))}
          {field(words.email, value('official_email'))}
          {field(words.designation, value('designation_title'))}
          {field(words.department, value('department_name'))}
        </dl>
        <dl className="min-w-0 rounded-lg bg-white p-4 md:col-start-2 xl:col-start-3">
          {field(words.phone, value('official_phone'))}
          {field(words.team, value('team_name'))}
          {field(words.status, value('employment_status'))}
        </dl>
      </div>

      <div role="tablist" aria-label={words.heading} className="flex min-w-0 gap-2 overflow-x-auto rounded-lg bg-white p-2" >
        {tabs.map(tab => <button type="button" role="tab" key={tab.id} id={'employee-figma-tab-' + tab.id}
          aria-selected={panel === tab.id} aria-controls={'employee-figma-panel-' + tab.id}
          onClick={() => setPanel(tab.id)}
          className={'min-h-11 shrink-0 rounded-lg px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-[#085587] ' +
            (panel === tab.id ? 'bg-[#085587] text-white' : 'bg-white text-[#49454F] hover:bg-[#EFF7F8]')}>
          {tab.text}
        </button>)}
      </div>

      {tabs.map(tab => <div key={tab.id} id={'employee-figma-panel-' + tab.id} role="tabpanel"
        aria-labelledby={'employee-figma-tab-' + tab.id} hidden={panel !== tab.id}
        className="min-w-0 space-y-4">
        {tab.id === 'personal' ? <>
          <section aria-labelledby="employee-figma-personal-title" className="rounded-lg bg-white p-4 sm:p-6">
            <div className="flex items-center justify-between gap-4 border-b border-[#E7EEF2] pb-4">
              <h3 id="employee-figma-personal-title" className="flex items-center gap-3 text-lg font-medium text-[#49454F]">
                <img src={addressBookIcon} alt="" aria-hidden="true" />{words.personalInformation}
              </h3>
              <button type="button" disabled title={words.editUnavailable} aria-label={words.edit + ' — ' + words.editUnavailable}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm text-slate-400 opacity-60">
                <img src={editPenIcon} alt="" aria-hidden="true" />{words.edit}
              </button>
            </div>
            <dl className="mt-2 grid min-w-0 grid-cols-1 gap-x-10 sm:grid-cols-2">
              {field(words.name, name)}
              {field(words.email, value('official_email'))}
              {field(words.phone, value('official_phone'))}
              {field(words.designation, value('designation_title'))}
              {field(words.department, value('department_name'))}
            </dl>
          </section>
          <section aria-labelledby="employee-figma-education-title" className="rounded-lg bg-white p-4 sm:p-6">
            <h3 id="employee-figma-education-title" className="flex items-center gap-3 text-lg font-medium text-[#49454F]">
              <img src={graduationCapIcon} alt="" aria-hidden="true" />{words.educationalInformation}
            </h3>
            <p role="status" className="mt-4 border-t border-[#E7EEF2] pt-4 text-sm text-slate-600">{words.missingEducation}</p>
          </section>
        </> : <section className="rounded-lg bg-white p-5 sm:p-6">
          <h3 className="text-lg font-medium text-[#49454F]">{tab.text}</h3>
          <p role="status" className="mt-4 text-sm text-slate-600">{words.missingSection}</p>
        </section>}
      </div>)}
    </>}
  </section>;
}

import { useEffect, useMemo, useState } from 'react';
import { loadRealProvisioningReadiness } from './realUserProvisioningApi';
import type { RealProvisioningReadiness } from './realUserProvisioningApi';
import type { Locale } from './project-locale';

const messages = {
  en: {
    title: 'Real user provisioning — read-only readiness',
    explanation: 'This view reads authorized SQL-controlled employee and role prerequisites. It does not create accounts or send invitations.',
    separation: 'Browser-only synthetic User Management remains a separate preview.',
    loading: 'Checking selected-organization permissions…',
    retry: 'Retry authorized read',
    roles: 'Assignable roles returned by the server',
    noRoles: 'No roles are assignable to this account.',
    employees: 'Employees eligible for account linking',
    noEmployees: 'No unlinked eligible employees are available.',
    search: 'Search eligible employees',
    number: 'Employee number',
    name: 'Employee name',
    email: 'Official email',
    none: 'No eligible employees match this search.',
    closed: 'Real invitation and account creation are not enabled. WS02 must approve selected-tenant provisioning and invitation contracts first.',
    count: 'eligible employees',
    organization: 'Selected organization',
  },
  bn: {
    title: 'বাস্তব ব্যবহারকারী প্রভিশনিং — শুধুমাত্র পাঠযোগ্য প্রস্তুতি',
    explanation: 'এখানে অনুমোদিত SQL-নিয়ন্ত্রিত কর্মী ও ভূমিকার তথ্য দেখানো হয়। কোনো অ্যাকাউন্ট তৈরি বা আমন্ত্রণ পাঠানো হয় না।',
    separation: 'ব্রাউজার-ভিত্তিক কৃত্রিম ব্যবহারকারী ব্যবস্থাপনা একটি পৃথক প্রিভিউ।',
    loading: 'নির্বাচিত প্রতিষ্ঠানের অনুমতি যাচাই হচ্ছে…',
    retry: 'অনুমোদিত তথ্য আবার লোড করুন',
    roles: 'সার্ভার অনুমোদিত ভূমিকা',
    noRoles: 'এই অ্যাকাউন্টের জন্য কোনো ভূমিকা বরাদ্দযোগ্য নয়।',
    employees: 'অ্যাকাউন্ট যুক্ত করার যোগ্য কর্মী',
    noEmployees: 'অ্যাকাউন্টবিহীন যোগ্য কর্মী নেই।',
    search: 'যোগ্য কর্মী খুঁজুন',
    number: 'কর্মী নম্বর',
    name: 'কর্মীর নাম',
    email: 'অফিসিয়াল ইমেইল',
    none: 'এই অনুসন্ধানে কোনো কর্মী মেলেনি।',
    closed: 'বাস্তব আমন্ত্রণ ও অ্যাকাউন্ট তৈরি চালু নয়। WS02-এর প্রতিষ্ঠানের অনুমতি এবং আমন্ত্রণ চুক্তি অনুমোদন প্রয়োজন।',
    count: 'যোগ্য কর্মী',
    organization: 'নির্বাচিত প্রতিষ্ঠান',
  },
} as const;

// Standalone WS08 slice; deliberately NOT mounted in the WS01-owned shared shell.
// WS01/WS05 may route it only after WS02 contract signoff and WS04 exact-head acceptance.
export function RealUserProvisioningReadiness({ tenantId, tenantName, locale }: {
  tenantId: string; tenantName: string; locale: Locale;
}) {
  const copy = messages[locale === 'bn' ? 'bn' : 'en'];
  const [value, setValue] = useState<RealProvisioningReadiness | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    setValue(null);
    setSearch('');
    void loadRealProvisioningReadiness(tenantId).then(result => {
      if (current) setValue(result);
    }).catch(cause => {
      if (current) setError(cause instanceof Error ? cause.message : 'Could not verify account access.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [tenantId, retry]);

  const currentValue = value?.tenantId === tenantId ? value : null;
  const employees = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (currentValue?.availableEmployees || []).filter(employee =>
      !query || [employee.full_name, employee.employee_number, employee.official_email]
        .some(item => item.toLocaleLowerCase().includes(query)));
  }, [currentValue, search]);

  return <section aria-labelledby="ws08-real-readiness-heading" className="min-w-0 space-y-4">
    <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 id="ws08-real-readiness-heading" className="text-xl font-semibold text-[var(--color-figma-primary-600)]">{copy.title}</h2>
      <p className="mt-2 text-sm text-slate-700">{copy.explanation}</p>
      <p className="mt-2 text-sm text-slate-600">{copy.separation}</p>
      <p className="mt-3 text-sm font-medium">{copy.organization}: {tenantName}</p>
    </header>
    {loading && <p role="status" className="rounded-xl border border-slate-200 bg-white p-4">{copy.loading}</p>}
    {!loading && error && <section role="alert" className="rounded-xl border border-rose-200 bg-white p-4">
      <p className="text-sm text-rose-800">{error}</p>
      <button type="button" onClick={() => setRetry(count => count + 1)}
        className="mt-3 min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--color-figma-primary-600)]">{copy.retry}</button>
    </section>}
    {!loading && currentValue && <>
      <section aria-labelledby="ws08-real-roles" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 id="ws08-real-roles" className="font-semibold">{copy.roles}</h3>
        {currentValue.assignableRoles.length
          ? <ul className="mt-3 flex flex-wrap gap-2">{currentValue.assignableRoles.map(role =>
            <li key={role.id} className="max-w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" title={role.description}>{role.name}</li>)}</ul>
          : <p className="mt-3 text-sm text-slate-600">{copy.noRoles}</p>}
      </section>
      <section aria-labelledby="ws08-real-employees" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 id="ws08-real-employees" className="font-semibold">{copy.employees}</h3>
        <p role="status" className="mt-1 text-sm text-slate-600">{currentValue.availableEmployees.length} {copy.count}</p>
        {currentValue.availableEmployees.length ? <>
          <label htmlFor="ws08-real-employee-search" className="mt-4 block text-sm font-medium">{copy.search}</label>
          <input id="ws08-real-employee-search" value={search} onChange={event => setSearch(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 focus-visible:outline-2 focus-visible:outline-[var(--color-figma-primary-600)]" />
          {employees.length ? <div role="region" aria-label={copy.employees} tabIndex={0}
            className="mt-4 min-w-0 overflow-x-auto rounded-lg border border-slate-200 focus-visible:outline-2 focus-visible:outline-[var(--color-figma-primary-600)]">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-slate-50"><tr>
                <th scope="col" className="p-3">{copy.number}</th>
                <th scope="col" className="p-3">{copy.name}</th>
                <th scope="col" className="p-3">{copy.email}</th>
              </tr></thead>
              <tbody>{employees.map(employee => <tr key={employee.id} className="border-t border-slate-100">
                <td className="p-3">{employee.employee_number}</td>
                <td className="p-3">{employee.full_name}</td>
                <td className="break-all p-3">{employee.official_email}</td>
              </tr>)}</tbody>
            </table>
          </div> : <p className="mt-3 text-sm text-slate-600">{copy.none}</p>}
        </> : <p className="mt-3 text-sm text-slate-600">{copy.noEmployees}</p>}
      </section>
      <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">{copy.closed}</p>
    </>}
  </section>;
}

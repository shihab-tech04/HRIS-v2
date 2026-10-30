import { useEffect, useState } from 'react';
import { loadRealLinkedUserPage } from './realUserDirectoryApi';
import type { RealLinkedUserPage } from './realUserDirectoryApi';
import type { Locale } from './project-locale';

const translations = {
  en: {
    title: 'Linked real user directory',
    description: 'Authenticated employee identities and assigned role IDs returned by tenant-restricted SQL. This is not the browser-only preview.',
    scope: 'Organization',
    search: 'Search linked employee names',
    submit: 'Search',
    all: 'Clear search',
    retry: 'Retry authorized directory',
    loading: 'Loading authorized linked users…',
    empty: 'No linked users match the selected organization and search.',
    employee: 'Employee',
    email: 'Official email',
    role: 'Assigned role IDs',
    department: 'Department',
    designation: 'Designation',
    employment: 'Employment status',
    admin: 'Admin registry status',
    active: 'Active',
    inactive: 'Inactive',
    unknown: 'Not returned',
    restricted: 'Not available to this session',
    none: 'No role rows returned',
    superAdmin: 'Protected Super Admin',
    prev: 'Previous page',
    next: 'Next page',
    page: 'Page',
    records: 'linked records',
    caution: 'Auth account enabled/disabled state and invitation delivery are not provided by this directory. No mutation controls are available; WS02 must approve those contracts.',
  },
  bn: {
    title: 'সংযুক্ত প্রকৃত ব্যবহারকারী তালিকা',
    description: 'অনুমোদিত SQL থেকে প্রতিষ্ঠানের কর্মী পরিচয় ও নির্ধারিত ভূমিকা আইডি দেখানো হচ্ছে। এটি ব্রাউজারের কৃত্রিম প্রিভিউ নয়।',
    scope: 'প্রতিষ্ঠান',
    search: 'সংযুক্ত কর্মীর নাম খুঁজুন',
    submit: 'খুঁজুন',
    all: 'অনুসন্ধান মুছুন',
    retry: 'অনুমোদিত তালিকা আবার লোড করুন',
    loading: 'অনুমোদিত ব্যবহারকারী তালিকা লোড হচ্ছে…',
    empty: 'এই প্রতিষ্ঠান ও অনুসন্ধানে কোনো সংযুক্ত ব্যবহারকারী পাওয়া যায়নি।',
    employee: 'কর্মী',
    email: 'অফিসিয়াল ইমেইল',
    role: 'বরাদ্দকৃত ভূমিকা আইডি',
    department: 'বিভাগ',
    designation: 'পদবি',
    employment: 'চাকরির অবস্থা',
    admin: 'অ্যাডমিন রেজিস্ট্রির অবস্থা',
    active: 'সক্রিয়',
    inactive: 'নিষ্ক্রিয়',
    unknown: 'সার্ভার তথ্য দেয়নি',
    restricted: 'এই সেশনে উপলব্ধ নয়',
    none: 'কোনো ভূমিকার তথ্য নেই',
    superAdmin: 'সংরক্ষিত সুপার অ্যাডমিন',
    prev: 'আগের পৃষ্ঠা',
    next: 'পরের পৃষ্ঠা',
    page: 'পৃষ্ঠা',
    records: 'সংযুক্ত রেকর্ড',
    caution: 'Auth অ্যাকাউন্টের সক্রিয়/নিষ্ক্রিয় অবস্থা ও আমন্ত্রণ সরবরাহের তথ্য এখানে নেই। কোনো পরিবর্তন করার নিয়ন্ত্রণ নেই; WS02-এর চুক্তি অনুমোদন প্রয়োজন।',
  },
};

// Standalone acceptance candidate. Not mounted in Main navigation or released.
export function RealLinkedUserDirectory({ tenantId, tenantName, locale }: {
  tenantId: string; tenantName: string; locale: Locale;
}) {
  const copy = translations[locale === 'bn' ? 'bn' : 'en'];
  const [page, setPage] = useState(0);
  const [nameInput, setNameInput] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<RealLinkedUserPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setResponse(null);
    void loadRealLinkedUserPage(tenantId, page, nameSearch).then(result => {
      if (active) setResponse(result);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'Authorized user directory failed.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tenantId, page, nameSearch, revision]);

  const visible = response?.tenantId === tenantId ? response : null;
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(0);
    setNameSearch(nameInput);
    setRevision(value => value + 1);
  }

  return <section aria-labelledby="ws08-real-linked-heading" className="min-w-0 space-y-4">
    <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 id="ws08-real-linked-heading" className="text-xl font-semibold text-[var(--color-figma-primary-600)]">{copy.title}</h2>
      <p className="mt-2 text-sm text-slate-700">{copy.description}</p>
      <p className="mt-2 text-sm font-medium">{copy.scope}: {tenantName}</p>
    </header>
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-4">
      <label htmlFor="ws08-real-linked-search" className="min-w-[200px] flex-1 text-sm font-medium">{copy.search}
        <input id="ws08-real-linked-search" maxLength={80} value={nameInput} onChange={event => setNameInput(event.target.value)}
          className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base focus-visible:outline-2 focus-visible:outline-[var(--color-figma-primary-600)]" />
      </label>
      <button type="submit" className="min-h-11 rounded-lg bg-[var(--color-figma-primary-600)] px-4 text-sm font-medium text-white">{copy.submit}</button>
      <button type="button" onClick={() => { setNameInput(''); setNameSearch(''); setPage(0); setRevision(i => i + 1); }}
        className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm">{copy.all}</button>
    </form>
    {loading && <p role="status" className="rounded-xl border border-slate-200 bg-white p-4">{copy.loading}</p>}
    {!loading && error && <section role="alert" className="rounded-xl border border-rose-200 bg-white p-4">
      <p className="text-sm text-rose-800">{error}</p>
      <button type="button" onClick={() => setRevision(v => v + 1)}
        className="mt-3 min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium">{copy.retry}</button>
    </section>}
    {!loading && visible && <>
      <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p role="status" className="text-sm text-slate-600">{visible.total} {copy.records}</p>
        {visible.rows.length ? <div role="region" aria-label={copy.title} tabIndex={0}
          className="mt-3 min-w-0 overflow-x-auto rounded-lg border border-slate-200 focus-visible:outline-2 focus-visible:outline-[var(--color-figma-primary-600)]">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-slate-50"><tr>
              {[copy.employee,copy.email,copy.role,copy.department,copy.designation,copy.employment,copy.admin].map(label =>
                <th scope="col" key={label} className="p-3 font-medium">{label}</th>)}
            </tr></thead>
            <tbody>{visible.rows.map(user => <tr key={user.employeeId} className="border-t border-slate-100">
              <td className="p-3"><p className="font-medium">{user.fullName}</p><p className="text-xs text-slate-500">{user.employeeNumber}</p></td>
              <td className="break-all p-3">{user.officialEmail}</td>
              <td className="p-3">{user.roles.join(', ') || copy.none}{user.isSuperAdmin && <p className="text-xs">{copy.superAdmin}</p>}</td>
              <td className="p-3">{visible.organizationNamesAvailable ? (user.department || '—') : copy.restricted}</td>
              <td className="p-3">{visible.organizationNamesAvailable ? (user.designation || '—') : copy.restricted}</td>
              <td className="p-3">{user.employmentStatus}</td>
              <td className="p-3">{user.adminActive === null ? copy.unknown : user.adminActive ? copy.active : copy.inactive}</td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="mt-3 text-sm text-slate-600">{copy.empty}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button type="button" disabled={page === 0} onClick={() => setPage(p => Math.max(0,p-1))}
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-40">{copy.prev}</button>
          <p className="text-sm tabular-nums">{copy.page} {page + 1}</p>
          <button type="button" disabled={!visible.hasNext} onClick={() => setPage(p => p+1)}
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-40">{copy.next}</button>
        </div>
      </section>
      <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{copy.caution}</p>
    </>}
  </section>;
}

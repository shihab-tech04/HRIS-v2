import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { loadAssignableUserRoles, loadRealLinkedUserPage, loadRealUserEffectivePermissions, updateRealUserAccess } from './realUserDirectoryApi';
import type { RealEffectivePermission, RealLinkedUser, RealLinkedUserPage } from './realUserDirectoryApi';
import type { Locale } from './project-locale';

const translations = {
  en: {
    title: 'Linked employee accounts',
    description: 'Review the employee accounts linked to this organization. Role and sign-in status changes are saved through the authorized HRIS access controls.',
    scope: 'Organization', search: 'Search linked employee names', submit: 'Search', clear: 'Clear search',
    retry: 'Retry authorized directory', loading: 'Loading authorized linked users…',
    empty: 'No linked users match the selected organization and search.', employee: 'Employee', email: 'Official email',
    role: 'Organization role', department: 'Department', designation: 'Designation', employment: 'Employment status',
    membership: 'Organization access', signIn: 'Sign-in account', active: 'Active', inactive: 'Inactive',
    unknown: 'Not returned', noRole: 'No organization role', protected: 'Protected Super Admin',
    prev: 'Previous page', next: 'Next page', page: 'Page', records: 'linked records', edit: 'Edit access',
    rolesUnavailable: 'Role choices could not be verified. Retry before editing accounts.', chooseRole: 'Assign role',
    save: 'Save access', cancel: 'Cancel', saving: 'Saving…', disable: 'Allow sign-in',
    disabledHelp: 'When disabled, this account cannot sign in until it is reactivated.',
    confirmDisable: 'I understand this account will be unable to sign in until it is reactivated.',
    confirmRequired: 'Confirm account deactivation to continue.', saved: 'Account role and status saved and read back.',
    retryAction: 'Reload directory', noAssignableRoles: 'No authorized roles can be assigned.',
    unauthorizedTarget: 'Protected Super Admin accounts cannot be changed.',
    inspectPermissions: 'Effective permissions', permissionsLoading: 'Loading current organization permissions…',
    noPermissions: 'This account has no active permissions in the selected organization.', permissionsError: 'Effective permissions could not be loaded.',
    actions: 'Actions',
  },
  bn: {
    title: 'সংযুক্ত কর্মী অ্যাকাউন্ট',
    description: 'এই প্রতিষ্ঠানের সঙ্গে যুক্ত কর্মী অ্যাকাউন্ট দেখুন। অনুমোদিত HRIS নিয়ন্ত্রণের মাধ্যমে ভূমিকা ও সাইন-ইন অবস্থা সংরক্ষণ করা হয়।',
    scope: 'প্রতিষ্ঠান', search: 'সংযুক্ত কর্মীর নাম খুঁজুন', submit: 'খুঁজুন', clear: 'অনুসন্ধান মুছুন',
    retry: 'অনুমোদিত তালিকা আবার লোড করুন', loading: 'অনুমোদিত ব্যবহারকারী তালিকা লোড হচ্ছে…',
    empty: 'এই প্রতিষ্ঠান ও অনুসন্ধানে কোনো সংযুক্ত ব্যবহারকারী পাওয়া যায়নি।', employee: 'কর্মী', email: 'অফিসিয়াল ইমেইল',
    role: 'প্রতিষ্ঠানের ভূমিকা', department: 'বিভাগ', designation: 'পদবি', employment: 'চাকরির অবস্থা',
    membership: 'প্রতিষ্ঠানে প্রবেশাধিকার', signIn: 'সাইন-ইন অ্যাকাউন্ট', active: 'সক্রিয়', inactive: 'নিষ্ক্রিয়',
    unknown: 'সার্ভার তথ্য দেয়নি', noRole: 'প্রতিষ্ঠানের ভূমিকা নেই', protected: 'সংরক্ষিত সুপার অ্যাডমিন',
    prev: 'আগের পৃষ্ঠা', next: 'পরের পৃষ্ঠা', page: 'পৃষ্ঠা', records: 'সংযুক্ত রেকর্ড', edit: 'প্রবেশাধিকার সম্পাদনা',
    rolesUnavailable: 'ভূমিকার বিকল্প যাচাই করা যায়নি। অ্যাকাউন্ট সম্পাদনার আগে আবার চেষ্টা করুন।', chooseRole: 'ভূমিকা নির্ধারণ করুন',
    save: 'অ্যাক্সেস সংরক্ষণ', cancel: 'বাতিল', saving: 'সংরক্ষণ হচ্ছে…', disable: 'সাইন-ইন অনুমোদন',
    disabledHelp: 'নিষ্ক্রিয় করলে পুনরায় সক্রিয় না করা পর্যন্ত এই অ্যাকাউন্টে সাইন-ইন করা যাবে না।',
    confirmDisable: 'আমি বুঝেছি যে পুনরায় সক্রিয় না করা পর্যন্ত এই অ্যাকাউন্টে সাইন-ইন করা যাবে না।',
    confirmRequired: 'চালিয়ে যেতে অ্যাকাউন্ট নিষ্ক্রিয়করণ নিশ্চিত করুন।', saved: 'অ্যাকাউন্টের ভূমিকা ও অবস্থা সংরক্ষণ করে আবার যাচাই করা হয়েছে।',
    retryAction: 'তালিকা আবার লোড করুন', noAssignableRoles: 'বরাদ্দ করার মতো অনুমোদিত ভূমিকা নেই।',
    unauthorizedTarget: 'সংরক্ষিত সুপার অ্যাডমিন অ্যাকাউন্ট পরিবর্তন করা যাবে না।',
    inspectPermissions: 'কার্যকর অনুমতি', permissionsLoading: 'বর্তমান প্রতিষ্ঠানের অনুমতি লোড হচ্ছে…',
    noPermissions: 'নির্বাচিত প্রতিষ্ঠানে এই অ্যাকাউন্টের কোনো সক্রিয় অনুমতি নেই।', permissionsError: 'কার্যকর অনুমতি লোড করা যায়নি।',
    actions: 'কার্যক্রম',
  },
} as const;

export function RealLinkedUserDirectory({ tenantId, tenantName, locale, canManage, isSuperAdmin, revision = 0, onSaved }: {
  tenantId: string; tenantName: string; locale: Locale; canManage: boolean; isSuperAdmin: boolean;
  revision?: number; onSaved?: () => void;
}) {
  const copy = translations[locale === 'bn' ? 'bn' : 'en'];
  const [page, setPage] = useState(0);
  const [nameInput, setNameInput] = useState('');
  const [nameSearch, setNameSearch] = useState('');
  const [localRevision, setLocalRevision] = useState(0);
  const [response, setResponse] = useState<RealLinkedUserPage | null>(null);
  const [assignableRoles, setAssignableRoles] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roleError, setRoleError] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [success, setSuccess] = useState('');
  const [inspectingUserId, setInspectingUserId] = useState<string | null>(null);
  const [effectivePermissions, setEffectivePermissions] = useState<RealEffectivePermission[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionsError, setPermissionsError] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [draftRoleId, setDraftRoleId] = useState('');
  const [draftActive, setDraftActive] = useState(true);
  const [deactivationConfirmed, setDeactivationConfirmed] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const savingRef = useRef(false);
  const selectedTenantRef = useRef(tenantId);
  selectedTenantRef.current = tenantId;

  useEffect(() => { setSuccess(''); }, [tenantId, revision]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    setRoleError('');
    setMutationError('');
    setResponse(null);
    setEditingUserId(null);
    setInspectingUserId(null); setEffectivePermissions([]); setPermissionsError('');
    setAssignableRoles([]);
    void (async () => {
      try {
        const result = await loadRealLinkedUserPage(tenantId, page, nameSearch);
        if (current) setResponse(result);
      } catch (cause) {
        if (current) setError(cause instanceof Error ? cause.message : 'Authorized user directory failed.');
      }
      if (current && canManage) {
        try {
          setAssignableRoles(await loadAssignableUserRoles(tenantId));
        } catch {
          if (current) setRoleError(copy.rolesUnavailable);
        }
      }
      if (current) setLoading(false);
    })();
    return () => { current = false; };
  }, [tenantId, page, nameSearch, revision, localRevision, canManage, copy.rolesUnavailable]);

  const visible = response?.tenantId === tenantId ? response : null;
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess('');
    setPage(0);
    setNameSearch(nameInput);
    setLocalRevision(value => value + 1);
  }
  function clearSearch() {
    setSuccess('');
    setNameInput(''); setNameSearch(''); setPage(0); setLocalRevision(value => value + 1);
  }
  function beginEdit(user: RealLinkedUser) {
    if (!canManage || user.isSuperAdmin) return;
    setMutationError(''); setSuccess(''); setInspectingUserId(null); setEffectivePermissions([]);
    setEditingUserId(user.userId);
    setDraftRoleId(user.roles[0] || assignableRoles[0]?.id || '');
    setDraftActive(user.adminActive ?? true);
    setDeactivationConfirmed(false);
  }
  async function saveAccess(event: FormEvent<HTMLFormElement>, user: RealLinkedUser) {
    event.preventDefault();
    if (savingRef.current || !canManage || user.isSuperAdmin) return;
    if (draftActive === false && !deactivationConfirmed) {
      setMutationError(copy.confirmRequired);
      return;
    }
    if (!assignableRoles.some(role => role.id === draftRoleId)) {
      setMutationError(copy.noAssignableRoles);
      return;
    }
    savingRef.current = true;
    setSavingUserId(user.userId);
    setMutationError(''); setSuccess('');
    try {
      await updateRealUserAccess(tenantId, user.userId, draftRoleId, draftActive);
      if (selectedTenantRef.current !== tenantId) return;
      setEditingUserId(null);
      setInspectingUserId(null); setEffectivePermissions([]);
      setSuccess(copy.saved);
      setLocalRevision(value => value + 1);
      onSaved?.();
    } catch (cause) {
      if (selectedTenantRef.current === tenantId) {
        setMutationError(cause instanceof Error ? cause.message : 'Account access could not be updated.');
      }
    } finally {
      savingRef.current = false;
      if (selectedTenantRef.current === tenantId) setSavingUserId(null);
    }
  }

  async function toggleEffectivePermissions(user: RealLinkedUser) {
    if (!isSuperAdmin || user.isSuperAdmin || permissionsLoading) return;
    if (inspectingUserId === user.userId) { setInspectingUserId(null); setEffectivePermissions([]); setPermissionsError(''); return; }
    setEditingUserId(null); setInspectingUserId(user.userId); setEffectivePermissions([]); setPermissionsError(''); setPermissionsLoading(true);
    try {
      const result = await loadRealUserEffectivePermissions(tenantId, user.userId);
      if (selectedTenantRef.current === tenantId) setEffectivePermissions(result);
    } catch (cause) {
      if (selectedTenantRef.current === tenantId) setPermissionsError(cause instanceof Error ? cause.message : copy.permissionsError);
    } finally {
      if (selectedTenantRef.current === tenantId) setPermissionsLoading(false);
    }
  }

  function permissionDetails(userId: string) {
    if (inspectingUserId !== userId) return null;
    return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" aria-live="polite">
      {permissionsLoading && <p role="status" className="text-sm text-slate-600">{copy.permissionsLoading}</p>}
      {permissionsError && <p role="alert" className="text-sm text-rose-800">{permissionsError}</p>}
      {!permissionsLoading && !permissionsError && (effectivePermissions.length
        ? <ul className="flex flex-wrap gap-2">{effectivePermissions.map(permission => <li key={permission.id} title={permission.description || undefined}
          className="max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">{permission.module} · {permission.action}</li>)}</ul>
        : <p className="text-sm text-slate-600">{copy.noPermissions}</p>)}
    </div>;
  }

  function editor(user: RealLinkedUser) {
    return <form onSubmit={event => void saveAccess(event, user)} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
      <label className="block text-sm font-medium">{copy.chooseRole}
        <select required value={draftRoleId} onChange={event => setDraftRoleId(event.target.value)} disabled={savingUserId === user.userId || assignableRoles.length === 0}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-[var(--color-figma-primary-600)]">
          <option value="" disabled>{copy.noAssignableRoles}</option>
          {assignableRoles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
      </label>
      <div className="space-y-2">
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={draftActive} onChange={event => { setDraftActive(event.target.checked); setDeactivationConfirmed(false); }}
            disabled={savingUserId === user.userId} className="h-4 w-4 accent-[var(--color-figma-primary-600)]" />
          {copy.disable}
        </label>
        {!draftActive && <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={deactivationConfirmed} onChange={event => setDeactivationConfirmed(event.target.checked)}
            disabled={savingUserId === user.userId} className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-figma-primary-600)]" />
          <span>{copy.confirmDisable}<span className="mt-1 block text-xs text-slate-600">{copy.disabledHelp}</span></span>
        </label>}
        {draftActive && <p className="text-xs text-slate-600">{copy.disabledHelp}</p>}
      </div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" disabled={savingUserId === user.userId || assignableRoles.length === 0 || (!draftActive && !deactivationConfirmed)}
          className="min-h-11 rounded-lg bg-[var(--color-figma-primary-600)] px-4 text-sm font-medium text-white disabled:opacity-50">
          {savingUserId === user.userId ? copy.saving : copy.save}
        </button>
        <button type="button" disabled={savingUserId === user.userId} onClick={() => { setEditingUserId(null); setMutationError(''); }}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm">{copy.cancel}</button>
      </div>
    </form>;
  }

  const roleText = (user: RealLinkedUser) => user.roles.join(', ') || copy.noRole;
  const membershipText = (user: RealLinkedUser) => user.membershipStatus === null
    ? copy.unknown : user.membershipStatus === 'active' ? copy.active : copy.inactive;
  const signInText = (user: RealLinkedUser) => user.adminActive === null
    ? copy.unknown : user.adminActive ? copy.active : copy.inactive;

  return <section aria-labelledby="ws08-real-linked-heading" className="min-w-0 space-y-4">
    <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 id="ws08-real-linked-heading" className="text-xl font-semibold text-[var(--color-figma-primary-600)]">{copy.title}</h2>
      <p className="mt-2 text-sm text-slate-700">{copy.description}</p>
      <p className="mt-2 text-sm font-medium">{copy.scope}: {tenantName}</p>
    </header>
    <form onSubmit={submitSearch} className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-4">
      <label htmlFor="ws08-real-linked-search" className="min-w-0 flex-1 text-sm font-medium">{copy.search}
        <input id="ws08-real-linked-search" maxLength={80} value={nameInput} onChange={event => setNameInput(event.target.value)}
          className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base focus-visible:outline-2 focus-visible:outline-[var(--color-figma-primary-600)]" />
      </label>
      <button type="submit" className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-[var(--color-figma-primary-600)]">{copy.submit}</button>
      <button type="button" onClick={clearSearch} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm">{copy.clear}</button>
    </form>
    {loading && <p role="status" className="rounded-xl border border-slate-200 bg-white p-4">{copy.loading}</p>}
    {!loading && error && <section role="alert" className="rounded-xl border border-rose-200 bg-white p-4">
      <p className="text-sm text-rose-800">{error}</p>
      <button type="button" onClick={() => setLocalRevision(value => value + 1)} className="mt-3 min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium">{copy.retry}</button>
    </section>}
    {!loading && roleError && <p role="alert" className="rounded-xl border border-amber-200 bg-white p-4 text-sm text-amber-900">{roleError}</p>}
    {!loading && mutationError && <p role="alert" className="rounded-xl border border-rose-200 bg-white p-4 text-sm text-rose-800">{mutationError}
      <button type="button" onClick={() => setLocalRevision(value => value + 1)} className="ml-3 min-h-9 rounded-lg border border-slate-300 px-3 text-sm">{copy.retryAction}</button>
    </p>}
    {!loading && success && <p role="status" className="rounded-xl border border-emerald-200 bg-white p-4 text-sm text-emerald-900">{success}</p>}
    {!loading && visible && <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p role="status" className="text-sm text-slate-600">{visible.total} {copy.records}</p>
      {visible.rows.length ? <>
        <div className="mt-3 hidden min-w-0 overflow-x-auto rounded-lg border border-slate-200 md:block">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="bg-slate-50"><tr>
            {[copy.employee,copy.email,copy.role,copy.department,copy.designation,copy.employment,copy.membership,copy.signIn,...(canManage || isSuperAdmin ? [copy.actions] : [])].map(label =>
                <th scope="col" key={label} className="p-3 font-medium">{label}</th>)}</tr></thead>
            <tbody>{visible.rows.map(user => <>
              <tr key={user.employeeId} className="border-t border-slate-100">
                <td className="p-3"><p className="font-medium">{user.fullName}</p><p className="text-xs text-slate-500">{user.employeeNumber}</p></td>
                <td className="break-all p-3">{user.officialEmail}</td><td className="p-3">{roleText(user)}</td>
                <td className="p-3">{visible.organizationNamesAvailable ? user.department || '—' : '—'}</td>
                <td className="p-3">{visible.organizationNamesAvailable ? user.designation || '—' : '—'}</td>
                <td className="p-3">{user.employmentStatus}</td><td className="p-3">{membershipText(user)}</td><td className="p-3">{signInText(user)}</td>
                {(canManage || isSuperAdmin) && <td className="p-3"><div className="flex flex-wrap gap-2">
                  {isSuperAdmin && !user.isSuperAdmin && <button type="button" aria-expanded={inspectingUserId === user.userId}
                    onClick={() => void toggleEffectivePermissions(user)} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm">{copy.inspectPermissions}</button>}
                  {canManage && (user.isSuperAdmin ? <span className="self-center text-xs text-slate-500">{copy.protected}</span> : <button type="button" disabled={assignableRoles.length === 0}
                    onClick={() => beginEdit(user)} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50">{copy.edit}</button>)}
                </div></td>}
              </tr>
              {editingUserId === user.userId && <tr key={`${user.employeeId}-editor`} className="border-t border-slate-100"><td colSpan={canManage ? 9 : 8} className="p-3">{editor(user)}</td></tr>}
              {inspectingUserId === user.userId && <tr key={`${user.employeeId}-permissions`} className="border-t border-slate-100"><td colSpan={canManage || isSuperAdmin ? 9 : 8} className="p-3">{permissionDetails(user.userId)}</td></tr>}
            </>)}</tbody>
          </table>
        </div>
        <div className="mt-3 space-y-3 md:hidden">
          {visible.rows.map(user => <article key={user.employeeId} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{user.fullName}</h3><p className="text-xs text-slate-500">{user.employeeNumber}</p></div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{membershipText(user)}</span></div>
            <dl className="mt-3 grid grid-cols-[minmax(0,7rem)_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-slate-600">{copy.email}</dt><dd className="break-all">{user.officialEmail}</dd>
              <dt className="text-slate-600">{copy.role}</dt><dd>{roleText(user)}</dd>
              <dt className="text-slate-600">{copy.department}</dt><dd>{visible.organizationNamesAvailable ? user.department || '—' : '—'}</dd>
              <dt className="text-slate-600">{copy.designation}</dt><dd>{visible.organizationNamesAvailable ? user.designation || '—' : '—'}</dd>
              <dt className="text-slate-600">{copy.employment}</dt><dd>{user.employmentStatus}</dd>
              <dt className="text-slate-600">{copy.signIn}</dt><dd>{signInText(user)}</dd>
            </dl>
            {isSuperAdmin && !user.isSuperAdmin && <button type="button" aria-expanded={inspectingUserId === user.userId}
              onClick={() => void toggleEffectivePermissions(user)} className="mt-3 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm">{copy.inspectPermissions}</button>}
            {canManage && (user.isSuperAdmin ? <p className="mt-3 text-xs text-slate-500">{copy.protected}</p> : <button type="button" disabled={assignableRoles.length === 0}
              onClick={() => beginEdit(user)} className="mt-3 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50">{copy.edit}</button>)}
            {inspectingUserId === user.userId && <div className="mt-3">{permissionDetails(user.userId)}</div>}
            {editingUserId === user.userId && <div className="mt-3">{editor(user)}</div>}
          </article>)}
        </div>
      </> : <p className="mt-3 text-sm text-slate-600">{copy.empty}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button type="button" disabled={page === 0} onClick={() => { setSuccess(''); setPage(value => Math.max(0,value-1)); }} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-40">{copy.prev}</button>
        <p className="text-sm tabular-nums">{copy.page} {page + 1}</p>
        <button type="button" disabled={!visible.hasNext} onClick={() => { setSuccess(''); setPage(value => value+1); }} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-40">{copy.next}</button>
      </div>
    </section>}
  </section>;
}

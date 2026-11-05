import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRealUserAccount, loadRealProvisioningReadiness } from './realUserProvisioningApi';
import type { RealProvisioningReadiness } from './realUserProvisioningApi';
import type { Locale } from './project-locale';

const messages = {
  en: {
    title: 'User management',
    explanation: 'Create an email-and-password account for an existing employee in this organization and assign an authorized role.',
    separation: 'Changes are saved to Supabase after the administrator, employee, and role are verified.',
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
    formTitle: 'Create employee account',
    chooseEmployee: 'Select employee',
    chooseRole: 'Assign role',
    email: 'Login email',
    password: 'Initial password (12 characters minimum)',
    submit: 'Create user',
    submitting: 'Creating account…',
    success: 'User account created. The employee and assigned role have been saved.',
    unavailable: 'An eligible employee and assignable role are required before creating a user.',
    count: 'eligible employees',
    organization: 'Selected organization',
  },
  bn: {
    title: 'ব্যবহারকারী ব্যবস্থাপনা',
    explanation: 'এই প্রতিষ্ঠানের বিদ্যমান কর্মীর জন্য ইমেইল ও পাসওয়ার্ড দিয়ে অ্যাকাউন্ট তৈরি করে অনুমোদিত ভূমিকা দিন।',
    separation: 'প্রশাসক, কর্মী ও ভূমিকা যাচাইয়ের পর তথ্য Supabase-এ সংরক্ষিত হয়।',
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
    formTitle: 'কর্মীর অ্যাকাউন্ট তৈরি',
    chooseEmployee: 'কর্মী নির্বাচন করুন',
    chooseRole: 'ভূমিকা নির্ধারণ করুন',
    email: 'লগইন ইমেইল',
    password: 'প্রাথমিক পাসওয়ার্ড (কমপক্ষে ১২ অক্ষর)',
    submit: 'ব্যবহারকারী তৈরি করুন',
    submitting: 'অ্যাকাউন্ট তৈরি হচ্ছে…',
    success: 'ব্যবহারকারীর অ্যাকাউন্ট, কর্মীর সংযোগ ও ভূমিকা সংরক্ষিত হয়েছে।',
    unavailable: 'অ্যাকাউন্ট তৈরির জন্য উপযুক্ত কর্মী ও অনুমোদিত ভূমিকা প্রয়োজন।',
    count: 'যোগ্য কর্মী',
    organization: 'নির্বাচিত প্রতিষ্ঠান',
  },
} as const;

// Scoped, live Supabase user management. Existing shell layouts and employee directories are preserved.
export function RealUserProvisioningReadiness({ tenantId, tenantName, locale }: {
  tenantId: string; tenantName: string; locale: Locale;
}) {
  const copy = messages[locale === 'bn' ? 'bn' : 'en'];
  const [value, setValue] = useState<RealProvisioningReadiness | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState('');
  const submittingRef = useRef(false);
  const selectedTenantRef = useRef(tenantId);
  selectedTenantRef.current = tenantId;

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    setValue(null);
    setSearch('');
    setEmployeeId('');
    setRoleId('');
    setEmail('');
    setPassword('');
    setSubmitError('');
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current || !currentValue || !employeeId || !roleId) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    setSuccess('');
    try {
      await createRealUserAccount({ tenantId, employeeId, roleId, email, password });
      if (selectedTenantRef.current !== tenantId) return;
      setPassword('');
      setSuccess(copy.success);
      setRetry(count => count + 1);
    } catch (cause) {
      if (selectedTenantRef.current === tenantId) {
        setSubmitError(cause instanceof Error ? cause.message : 'Unable to create the user.');
      }
    } finally {
      submittingRef.current = false;
      if (selectedTenantRef.current === tenantId) setSubmitting(false);
    }
  };

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
      <section aria-labelledby="ws08-create-user-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h3 id="ws08-create-user-heading" className="font-semibold">{copy.formTitle}</h3>
        {success && <p role="status" className="mt-3 text-sm text-[var(--color-figma-primary-600)]">{success}</p>}
        {submitError && <p role="alert" className="mt-3 text-sm text-rose-700">{submitError}</p>}
        {currentValue.availableEmployees.length && currentValue.assignableRoles.length ? (
          <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={event => { void submit(event); }}>
            <div>
              <label htmlFor="hris-new-user-employee" className="block text-sm font-medium">{copy.chooseEmployee}</label>
              <select id="hris-new-user-employee" required value={employeeId} disabled={submitting}
                onChange={event => {
                  const id = event.target.value;
                  setEmployeeId(id);
                  setEmail(currentValue.availableEmployees.find(employee => employee.id === id)?.official_email || '');
                  setSuccess('');
                }}
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                <option value="">{copy.chooseEmployee}</option>
                {currentValue.availableEmployees.map(employee =>
                  <option key={employee.id} value={employee.id}>{employee.full_name} ({employee.employee_number})</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="hris-new-user-role" className="block text-sm font-medium">{copy.chooseRole}</label>
              <select id="hris-new-user-role" required value={roleId} disabled={submitting}
                onChange={event => { setRoleId(event.target.value); setSuccess(''); }}
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                <option value="">{copy.chooseRole}</option>
                {currentValue.assignableRoles.map(role =>
                  <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="hris-new-user-email" className="block text-sm font-medium">{copy.email}</label>
              <input id="hris-new-user-email" type="email" autoComplete="off" required disabled={submitting}
                value={email} onChange={event => setEmail(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
            </div>
            <div>
              <label htmlFor="hris-new-user-password" className="block text-sm font-medium">{copy.password}</label>
              <input id="hris-new-user-password" type="password" autoComplete="new-password" minLength={12}
                required disabled={submitting} value={password} onChange={event => setPassword(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={submitting || !employeeId || !roleId || !email || password.length < 12}
                className="min-h-11 rounded-lg bg-[var(--color-figma-primary-600)] px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
                {submitting ? copy.submitting : copy.submit}
              </button>
            </div>
          </form>
        ) : <p className="mt-3 text-sm text-slate-600">{copy.unavailable}</p>}
      </section>
    </>}
  </section>;
}

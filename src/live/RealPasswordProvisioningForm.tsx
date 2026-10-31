import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { loadRealProvisioningReadiness } from './realUserProvisioningApi';
import type { RealProvisioningReadiness } from './realUserProvisioningApi';
import { provisionLegacyPasswordAccount, ProvisioningError } from './realPasswordProvisioning';
import type { Locale } from './project-locale';

const translations = {
  en: {
    title: 'Existing-employee account provisioning',
    note: 'Existing server v3 creates an email-confirmed account using an initial password. It does not send an invitation.',
    gate: 'Account creation is disabled until WS02 approves the selected-tenant contract and WS05 authorizes its release.',
    tenant: 'Selected organization',
    loading: 'Checking authorized roles and unlinked employees…',
    employee: 'Existing employee',
    role: 'Permitted role',
    chooseEmployee: 'Select an eligible employee',
    chooseRole: 'Select a permitted role',
    name: 'Employee full name',
    email: 'Official email',
    password: 'Initial password (12 characters minimum)',
    create: 'Create real account (existing password contract)',
    creating: 'Verifying and submitting…',
    retry: 'Refresh authorized prerequisites',
    none: 'No permitted roles or unlinked eligible employees are available.',
    success: 'A real account was created. Recheck the signed-in user directory before assigning further access.',
    noIdentity: 'Select an existing employee and a permitted role.',
    noRetry: 'Submission outcome requires a directory check before another attempt.',
    noEmail: 'No invitation email is sent by this API.',
  },
  bn: {
    title: 'বিদ্যমান কর্মীর জন্য অ্যাকাউন্ট তৈরি',
    note: 'বর্তমান সার্ভারের v3 প্রাথমিক পাসওয়ার্ড দিয়ে ইমেইল নিশ্চিত করা অ্যাকাউন্ট তৈরি করে। এটি আমন্ত্রণ পাঠায় না।',
    gate: 'WS02 প্রতিষ্ঠানের চুক্তি অনুমোদন এবং WS05 প্রকাশের অনুমতি না দেওয়া পর্যন্ত অ্যাকাউন্ট তৈরি বন্ধ থাকবে।',
    tenant: 'নির্বাচিত প্রতিষ্ঠান',
    loading: 'অনুমোদিত ভূমিকা ও অ্যাকাউন্টবিহীন কর্মী যাচাই হচ্ছে…',
    employee: 'বিদ্যমান কর্মী',
    role: 'অনুমোদিত ভূমিকা',
    chooseEmployee: 'যোগ্য কর্মী নির্বাচন করুন',
    chooseRole: 'অনুমোদিত ভূমিকা নির্বাচন করুন',
    name: 'কর্মীর পূর্ণ নাম',
    email: 'অফিসিয়াল ইমেইল',
    password: 'প্রাথমিক পাসওয়ার্ড (অন্তত ১২ অক্ষর)',
    create: 'বাস্তব অ্যাকাউন্ট তৈরি করুন (বিদ্যমান পাসওয়ার্ড চুক্তি)',
    creating: 'যাচাই করে পাঠানো হচ্ছে…',
    retry: 'অনুমোদিত তথ্য আবার যাচাই করুন',
    none: 'বরাদ্দযোগ্য ভূমিকা বা অ্যাকাউন্টবিহীন যোগ্য কর্মী নেই।',
    success: 'বাস্তব অ্যাকাউন্ট তৈরি হয়েছে। পরবর্তী অনুমতি দেওয়ার আগে ব্যবহারকারী তালিকা যাচাই করুন।',
    noIdentity: 'একজন বিদ্যমান কর্মী ও অনুমোদিত ভূমিকা নির্বাচন করুন।',
    noRetry: 'আবার পাঠানোর আগে অ্যাকাউন্ট তৈরি হয়েছে কি না যাচাই করতে হবে।',
    noEmail: 'এই API কোনো আমন্ত্রণ ইমেইল পাঠায় না।',
  },
};

export function RealPasswordProvisioningForm({ tenantId, tenantName, locale, mutationApproved = false }: {
  tenantId: string; tenantName: string; locale: Locale; mutationApproved?: boolean;
}) {
  const copy = translations[locale === 'bn' ? 'bn' : 'en'];
  const [context, setContext] = useState<RealProvisioningReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const submittingLock = useRef(false);

  useEffect(() => {
    let current = true;
    setContext(null);
    setEmployeeId('');
    setRoleId('');
    setPassword('');
    setNotice('');
    setError('');
    setUnknownOutcome(false);
    setLoading(true);
    void loadRealProvisioningReadiness(tenantId).then(result => {
      if (current) setContext(result);
    }).catch(cause => {
      if (current) setError(cause instanceof Error ? cause.message : 'Access verification failed.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [tenantId, revision]);

  const data = context?.tenantId === tenantId ? context : null;
  const employee = data?.availableEmployees.find(item => item.id === employeeId);
  const canSubmit = mutationApproved && !!data && !loading && !submitting && !unknownOutcome
    && !!employee && data.assignableRoles.some(role => role.id === roleId)
    && password.length >= 12 && password.length <= 1024;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submittingLock.current || !employee || !data) return;
    submittingLock.current = true;
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      await provisionLegacyPasswordAccount({
        tenantId, employeeId: employee.id, roleId, initialPassword: password,
      });
      setNotice(copy.success);
      setUnknownOutcome(true);
    } catch (cause) {
      const failure = cause instanceof ProvisioningError ? cause : null;
      setError(failure?.message || copy.noRetry);
      if (!failure || !['INVALID_INPUT'].includes(failure.code)) {
        setUnknownOutcome(true);
      }
    } finally {
      setPassword('');
      setSubmitting(false);
      submittingLock.current = false;
    }
  }

  return <section aria-labelledby="ws08-real-create-heading" className="min-w-0 space-y-4">
    <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 id="ws08-real-create-heading" className="text-xl font-semibold text-[var(--color-figma-primary-600)]">{copy.title}</h2>
      <p className="mt-2 text-sm text-slate-700">{copy.note}</p>
      <p className="mt-2 text-sm font-medium">{copy.tenant}: {tenantName}</p>
      {!mutationApproved && <p role="status" className="mt-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">{copy.gate}</p>}
    </header>
    {loading && <p role="status" className="rounded-xl border border-slate-200 bg-white p-4">{copy.loading}</p>}
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-white p-4 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm">{notice}</p>}
    {data && <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <label htmlFor="ws08-real-create-employee" className="block text-sm font-medium">{copy.employee}</label>
        <select id="ws08-real-create-employee" value={employeeId} onChange={event => { setEmployeeId(event.target.value); setPassword(''); }}
          disabled={!mutationApproved || submitting || unknownOutcome}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
          <option value="">{copy.chooseEmployee}</option>
          {data.availableEmployees.map(item => <option key={item.id} value={item.id}>{item.employee_number} · {item.full_name}</option>)}
        </select>
      </div>
      {employee && <div className="rounded-lg border border-slate-200 p-3 text-sm">
        <p><strong>{copy.name}:</strong> {employee.full_name}</p>
        <p className="mt-1 break-all"><strong>{copy.email}:</strong> {employee.official_email}</p>
      </div>}
      <div>
        <label htmlFor="ws08-real-create-role" className="block text-sm font-medium">{copy.role}</label>
        <select id="ws08-real-create-role" value={roleId} onChange={event => setRoleId(event.target.value)}
          disabled={!mutationApproved || submitting || unknownOutcome}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
          <option value="">{copy.chooseRole}</option>
          {data.assignableRoles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
        </select>
      </div>
      {mutationApproved && <div>
        <label htmlFor="ws08-real-create-password" className="block text-sm font-medium">{copy.password}</label>
        <input id="ws08-real-create-password" type="password" autoComplete="new-password"
          value={password} minLength={12} maxLength={1024} onChange={event => setPassword(event.target.value)}
          disabled={submitting || unknownOutcome}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base" />
      </div>}
      {!data.assignableRoles.length || !data.availableEmployees.length
        ? <p className="text-sm text-slate-600">{copy.none}</p> : null}
      <button type="submit" disabled={!canSubmit}
        className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-[var(--color-figma-primary-600)] disabled:opacity-50">
        {submitting ? copy.creating : copy.create}
      </button>
      <p className="text-sm text-slate-600">{copy.noEmail}</p>
      {unknownOutcome && <p role="status" className="text-sm">{copy.noRetry}</p>}
    </form>}
    <button type="button" disabled={loading || submitting}
      onClick={() => setRevision(value => value + 1)}
      className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium disabled:opacity-50">
      {copy.retry}
    </button>
  </section>;
}

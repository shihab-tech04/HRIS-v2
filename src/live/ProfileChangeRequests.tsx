import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { projectText, type Locale } from './project-locale';

const fields = [
  ['full_name', 'Full name', 'text'], ['official_email', 'Official email', 'email'],
  ['personal_email', 'Personal email', 'email'], ['official_phone', 'Official phone', 'tel'],
  ['address', 'Address', 'text'], ['mailing_address', 'Mailing address', 'text'],
  ['emergency_contact_name', 'Emergency contact name', 'text'],
  ['emergency_contact_phone', 'Emergency contact phone', 'tel'],
  ['emergency_contact_relation', 'Emergency contact relation', 'text'],
] as const;
const fieldLabels: Record<string, readonly [string, string]> = {
  full_name: ['Full name', 'পূর্ণ নাম'], official_email: ['Official email', 'অফিসিয়াল ইমেইল'],
  phone: ['Phone number', 'ফোন নম্বর'], personal_email: ['Personal email', 'ব্যক্তিগত ইমেইল'],
  official_phone: ['Official phone', 'অফিসিয়াল ফোন'], address: ['Address', 'বর্তমান ঠিকানা'],
  mailing_address: ['Mailing address', 'স্থায়ী ঠিকানা'],
  emergency_contact_name: ['Emergency contact name', 'জরুরি যোগাযোগের নাম'],
  emergency_contact_phone: ['Emergency contact phone', 'জরুরি যোগাযোগের ফোন'],
  emergency_contact_relation: ['Emergency contact relation', 'জরুরি যোগাযোগের সম্পর্ক'],
  father_name: ['Father’s name', 'পিতার নাম'], mother_name: ['Mother’s name', 'মাতার নাম'],
  date_of_birth: ['Date of birth', 'জন্মতারিখ'], birthplace: ['Birthplace', 'জন্মস্থান'],
  blood_group: ['Blood group', 'রক্তের গ্রুপ'], gender: ['Gender', 'লিঙ্গ'],
  religion: ['Religion', 'ধর্ম'], nationality: ['Nationality', 'জাতীয়তা'],
  marital_status: ['Marital status', 'বৈবাহিক অবস্থা'], nid_number: ['NID number', 'জাতীয় পরিচয়পত্র নম্বর'],
  passport_number: ['Passport number', 'পাসপোর্ট নম্বর'], etin_number: ['E-TIN', 'ই-টিন'],
};
type HistoryRow = { id: string; field_key: string; reason: string; status: 'pending' | 'approved' | 'rejected'; submitted_at: string; review_note: string | null };
type ReviewRow = { id: string; employee_number: string | null; full_name: string; field_key: string; requested_value: string; reason: string; submitted_at: string };
const tx = (locale: Locale, value: string) => projectText(locale, value);
const fieldName = (locale: Locale, key: string) => {
  const field = fieldLabels[key];
  return field ? locale === 'bn' ? field[1] : tx(locale, field[0]) : key;
};
const formatDate = (value: string, locale: Locale) => new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', { dateStyle: 'medium' }).format(new Date(value));

export function EmployeeProfileChangeRequests({ tenantId, locale }: { tenantId: string; locale: Locale }) {
  const [fieldKey, setFieldKey] = useState('');
  const [proposed, setProposed] = useState('');
  const [reason, setReason] = useState('');
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const requestSequence = useRef(0);

  async function load() {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError('');
    try {
      const { data, error: loadError } = await supabase.rpc('employee_get_my_profile_change_requests', {
        p_tenant_id: tenantId,
      });
      if (sequence !== requestSequence.current) return;
      if (loadError) throw loadError;
      setRows(Array.isArray(data) ? data as HistoryRow[] : []);
    } catch {
      if (sequence === requestSequence.current) {
        setRows([]);
        setError('Profile request history is unavailable. Refresh to try again.');
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }
  useEffect(() => { void load(); return () => { requestSequence.current += 1; }; }, [tenantId, revision]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!fieldKey || !proposed.trim() || !reason.trim()) {
      setError('Select a field and enter both the proposed value and reason.');
      return;
    }
    if (proposed.trim().length > 500 || reason.trim().length > 1000) {
      setError('The proposed value must be 500 characters or fewer and the reason 1000 characters or fewer.');
      return;
    }
    setSaving(true);
    try {
      const { error: submitError } = await supabase.rpc('employee_submit_profile_change_request', {
        p_tenant_id: tenantId,
        p_field_key: fieldKey, p_requested_value: proposed.trim(), p_reason: reason.trim(),
      });
      if (submitError) {
        setError(submitError.code === '23505' ? 'A request for this field is already pending.' :
          submitError.code === '22023' ? submitError.message : 'Unable to submit this request. Refresh and try again.');
        return;
      }
      setFieldKey(''); setProposed(''); setReason('');
      setMessage('Request submitted for HR review.');
      await load();
    } catch {
      setError('Unable to submit this request. Refresh and try again.');
    } finally { setSaving(false); }
  }

  return <div className="space-y-5">
    <header><h2 className="text-lg font-bold text-[#353535]">{tx(locale, 'Profile change requests')}</h2>
      <p className="mt-1 text-sm text-slate-600">{tx(locale, 'Request a correction to protected HR profile details. An authorized HR reviewer must approve it before your employee record changes.')}</p></header>
    {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{tx(locale, message)}</p>}
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{tx(locale, error)}</p>}
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="profile-change-form-heading">
      <h3 id="profile-change-form-heading" className="font-semibold">{tx(locale, 'Request a protected profile change')}</h3>
      <form onSubmit={submit} noValidate className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">{tx(locale, 'Profile field')}
          <select value={fieldKey} onChange={event => setFieldKey(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3">
            <option value="">{tx(locale, 'Choose a field')}</option>{fields.map(([key, label]) => <option key={key} value={key}>{tx(locale, label)}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">{tx(locale, 'Proposed value')}
          <input maxLength={500} type={fields.find(([key]) => key === fieldKey)?.[2] || 'text'} value={proposed} onChange={event => setProposed(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" />
        </label>
        <label className="text-sm font-medium sm:col-span-2">{tx(locale, 'Reason for this correction')}
          <textarea maxLength={1000} rows={3} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="submit" disabled={saving || loading} className="min-h-11 rounded-lg bg-[#085587] px-4 font-medium text-white disabled:opacity-50">{saving ? tx(locale, 'Submitting…') : tx(locale, 'Submit request')}</button>
          <button type="button" disabled={saving} onClick={() => { setFieldKey(''); setProposed(''); setReason(''); setError(''); setMessage(''); }} className="min-h-11 rounded-lg border border-slate-300 px-4 font-medium disabled:opacity-50">{tx(locale, 'Cancel')}</button>
        </div>
      </form>
    </section>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby="profile-change-history-heading">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4">
        <div><h3 id="profile-change-history-heading" className="font-semibold">{tx(locale, 'Your request history')}</h3><p className="mt-1 text-xs text-slate-500">{tx(locale, 'Your history shows request status and reviewer notes. Proposed values are not shown here.')}</p></div>
        <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50"><RefreshCw className="h-4 w-4" />{tx(locale, 'Refresh history')}</button>
      </div>
      {loading ? <p role="status" className="p-5 text-sm text-slate-600">{tx(locale, 'Loading your request history…')}</p>
        : error ? <div className="p-4"><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 px-3">{tx(locale, 'Retry')}</button></div>
          : rows.length === 0 ? <p className="p-5 text-sm text-slate-600">{tx(locale, 'No profile correction requests yet.')}</p>
            : <ul className="divide-y divide-slate-100">{rows.map(row => <li key={row.id} className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div><p className="font-medium">{fieldName(locale, row.field_key)}</p><p className="mt-1 text-sm text-slate-600">{tx(locale, 'Reason')}: {row.reason}</p>{row.review_note && <p className="mt-1 break-words text-sm text-slate-600">{tx(locale, 'Reviewer note')}: {row.review_note}</p>}<p className="mt-1 text-xs text-slate-500">{formatDate(row.submitted_at, locale)}</p></div>
              <span className={'inline-flex h-fit rounded-full px-3 py-1 text-xs font-medium ' + (row.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : row.status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800')}>{tx(locale, row.status === 'approved' ? 'Approved' : row.status === 'rejected' ? 'Rejected' : 'Pending')}</span>
            </li>)}</ul>}
    </section>
  </div>;
}

export function ProfileChangeReview({ tenantId, locale }: { tenantId: string; locale: Locale }) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const requestSequence = useRef(0);
  async function load() {
    const sequence = ++requestSequence.current;
    setLoading(true); setError('');
    try {
      const { data, error: loadError } = await supabase.rpc('admin_list_profile_change_requests', {
        p_tenant_id: tenantId,
      });
      if (sequence !== requestSequence.current) return;
      if (loadError) throw loadError;
      setRows(Array.isArray(data) ? data as ReviewRow[] : []);
    } catch {
      if (sequence === requestSequence.current) {
        setRows([]);
        setError('Profile correction review is unavailable. Refresh to try again.');
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }
  useEffect(() => { void load(); return () => { requestSequence.current += 1; }; }, [tenantId, revision]);
  async function decide(row: ReviewRow, decision: 'approved' | 'rejected') {
    setBusyId(row.id); setError(''); setMessage('');
    try {
      const { error: reviewError } = await supabase.rpc('admin_review_profile_change_request', {
        p_tenant_id: tenantId,
        p_id: row.id, p_decision: decision, p_note: notes[row.id]?.trim() || null,
      });
      if (reviewError) throw reviewError;
      setRows(current => current.filter(item => item.id !== row.id));
      setMessage(decision === 'approved' ? 'Profile correction approved.' : 'Profile correction rejected.');
    } catch {
      setError('This request could not be decided. It may have changed; refresh the queue.');
    } finally { setBusyId(''); }
  }
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby="profile-change-review-heading">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4">
      <div><h2 id="profile-change-review-heading" className="text-lg font-bold text-[#353535]">{tx(locale, 'Profile correction review')}</h2><p className="mt-1 text-sm text-slate-600">{tx(locale, 'Only users with active-tenant self-service management permission can review these protected changes.')}</p></div>
      <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50"><RefreshCw className="h-4 w-4" />{tx(locale, 'Refresh queue')}</button>
    </div>
    {message && <p role="status" className="p-4 text-sm text-emerald-800">{tx(locale, message)}</p>}
    {error && <div role="alert" className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{tx(locale, error)} <button type="button" onClick={() => setRevision(value => value + 1)} className="underline">{tx(locale, 'Retry')}</button></div>}
    {loading ? <p role="status" className="p-5 text-sm text-slate-600">{tx(locale, 'Loading profile corrections…')}</p>
      : error ? null : rows.length === 0 ? <p className="p-5 text-sm text-slate-600">{tx(locale, 'No pending profile corrections.')}</p>
        : <ul className="divide-y divide-slate-100">{rows.map(row => <li key={row.id} className="space-y-3 p-4">
          <div className="min-w-0"><p className="font-medium">{row.full_name} <span className="text-xs text-slate-500">{row.employee_number || ''}</span></p><p className="mt-1 break-words text-sm">{fieldName(locale, row.field_key)}: <span className="font-medium">{row.requested_value}</span></p><p className="mt-1 break-words text-sm text-slate-600">{tx(locale, 'Reason')}: {row.reason}</p><p className="mt-1 text-xs text-slate-500">{tx(locale, 'Submitted')}: {formatDate(row.submitted_at, locale)}</p></div>
          <label className="block text-sm font-medium">{tx(locale, 'Reviewer note (optional)')}<textarea maxLength={1000} rows={2} value={notes[row.id] || ''} onChange={event => setNotes(current => ({ ...current, [row.id]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={Boolean(busyId)} onClick={() => void decide(row, 'approved')} className="min-h-11 rounded-lg bg-[#085587] px-4 text-sm font-medium text-white disabled:opacity-50">{busyId === row.id ? tx(locale, 'Saving…') : tx(locale, 'Approve correction')}</button><button type="button" disabled={Boolean(busyId)} onClick={() => void decide(row, 'rejected')} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm disabled:opacity-50">{tx(locale, 'Reject correction')}</button></div>
        </li>)}</ul>}
  </section>;
}

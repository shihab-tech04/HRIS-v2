import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { projectText, type Locale } from './project-locale';

type PreboardingPacket = {
  handoff_id: string;
  application_id: string;
  candidate_name: string;
  candidate_email: string;
  job_title: string;
  status: string;
  candidate_personal_data: Record<string, unknown>;
  candidate_completed_steps: string[];
  candidate_submitted_at: string;
  proposed_joining_date: string | null;
};

const fields: Array<[keyof PreboardingPacket['candidate_personal_data'], string]> = [
  ['national_id', 'National ID'], ['passport_number', 'Passport number'], ['date_of_birth', 'Date of birth'],
  ['nationality', 'Nationality'], ['address', 'Address'], ['emergency_contact_name', 'Emergency contact'],
  ['emergency_contact_phone', 'Emergency phone'], ['emergency_contact_relation', 'Relationship'],
  ['bank_name', 'Bank'], ['bank_account_number', 'Bank account'],
  ['tax_identification_number', 'Tax identification number'], ['policies_accepted', 'Policies acknowledged'],
];

function formatValue(value: unknown, locale: Locale) {
  if (typeof value === 'boolean') return projectText(locale, value ? 'Yes' : 'No');
  return typeof value === 'string' && value.trim() ? value : '—';
}

function CandidateActivationForm({ packet, tenantId, locale, onActivated }: {
  packet: PreboardingPacket; tenantId: string; locale: Locale; onActivated: () => void;
}) {
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [joiningDate, setJoiningDate] = useState(packet.proposed_joining_date?.slice(0, 10) || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tx = (copy: string) => projectText(locale, copy);

  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await supabase.rpc('hris_activate_candidate_employee', {
        p_tenant_id: tenantId,
        p_application_id: packet.application_id,
        p_employee_number: employeeNumber.trim(),
        p_joining_date: joiningDate,
      });
      if (result.error) throw result.error;
      const value = result.data as { success?: boolean; employee_id?: string } | null;
      if (value?.success !== true || typeof value.employee_id !== 'string') {
        throw new Error('Activation was not confirmed. Refresh the queue and check the employee directory.');
      }
      onActivated();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      setError(message.includes('already assigned') || message.includes('already linked')
        ? tx('That employee number or Auth identity is already linked in this organization.')
        : tx('Employee activation could not be completed. Check the employee number and joining date, then retry.'));
    } finally { setBusy(false); }
  }

  return <form onSubmit={activate} className="mt-4 grid gap-3 rounded-lg border border-[#B9DCE2] bg-[#F6FBFC] p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
    <label className="text-xs font-medium text-slate-700">{tx('Employee number')}
      <input required maxLength={32} value={employeeNumber} onChange={event => setEmployeeNumber(event.target.value)}
        className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
    </label>
    <label className="text-xs font-medium text-slate-700">{tx('Confirm joining date')}
      <input required type="date" value={joiningDate} onChange={event => setJoiningDate(event.target.value)}
        className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
    </label>
    <button type="submit" disabled={busy || !employeeNumber.trim() || !joiningDate}
      className="min-h-11 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50">
      {busy ? tx('Activating...') : tx('Activate employee')}
    </button>
    {error && <p role="alert" className="sm:col-span-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
  </form>;
}

export function CandidatePreboardingQueue({ tenantId, locale = 'en', canActivate = false }: {
  tenantId: string; locale?: Locale; canActivate?: boolean;
}) {
  const tenantRef = useRef(tenantId);
  tenantRef.current = tenantId;
  const sequence = useRef(0);
  const [packets, setPackets] = useState<PreboardingPacket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const tx = (copy: string) => projectText(locale, copy);

  useEffect(() => { setNotice(''); }, [tenantId]);

  useEffect(() => {
    const request = ++sequence.current;
    const requestTenant = tenantId;
    setPackets([]); setLoading(true); setError('');
    void (async () => {
      try {
        const result = await supabase.rpc('hris_get_candidate_preboarding_queue', { p_tenant_id: requestTenant });
        if (request !== sequence.current || tenantRef.current !== requestTenant) return;
        if (result.error) throw result.error;
        if (!Array.isArray(result.data)) throw new Error('Preboarding service returned an invalid response.');
        setPackets(result.data as PreboardingPacket[]);
      } catch {
        if (request === sequence.current && tenantRef.current === requestTenant) {
          setPackets([]);
          setError(tx('Submitted preboarding packets could not be loaded. Check your organization access and retry.'));
        }
      } finally {
        if (request === sequence.current && tenantRef.current === requestTenant) setLoading(false);
      }
    })();
    return () => { sequence.current += 1; };
  }, [tenantId, revision, locale]);

  function activated() {
    setNotice(tx('Employee activated. The candidate keeps the same sign-in identity.'));
    setRevision(value => value + 1);
  }

  return <section aria-labelledby="preboarding-queue-heading" className="mt-8 space-y-4">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h3 id="preboarding-queue-heading" className="text-xl font-semibold text-[#1E1B39]">{tx('Preboarding handoffs')}</h3>
        <p className="mt-1 text-sm text-slate-600">{tx('Candidate packets awaiting HR verification. Submission does not activate an employee account.')}</p>
      </div>
      <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50" aria-label={tx('Refresh preboarding handoffs')}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" /> {tx('Refresh')}
      </button>
    </header>
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <p>{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="mt-2 min-h-9 font-semibold underline">{tx('Retry')}</button>
    </div>}
    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{tx('Loading submitted packets...')}</p>
      : packets.length === 0 ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{tx('No submitted preboarding packets are waiting for HR.')}</p>
      : <ul className="space-y-3">
        {packets.map(packet => {
          const submittedAt = new Date(packet.candidate_submitted_at);
          const submittedDate = Number.isNaN(submittedAt.getTime())
            ? packet.candidate_submitted_at
            : submittedAt.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-BD');
          const completedCount = new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en').format(packet.candidate_completed_steps.length);
          const completionSummary = locale === 'bn'
            ? `৪টির মধ্যে ${completedCount}টি বিভাগ সম্পন্ন`
            : `${completedCount} of 4 sections`;
          return <li key={packet.handoff_id} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><h4 className="break-words font-semibold text-slate-900">{packet.candidate_name}</h4>
              <p className="mt-1 break-all text-sm text-slate-600">{packet.candidate_email}</p>
              <p className="mt-1 text-sm text-slate-700">{packet.job_title}</p></div>
            <span className="rounded-full bg-[#EFF7F8] px-3 py-1 text-xs font-medium text-[#085587]">{tx('Pending verification')}</span>
          </div>
          <p className="mt-3 text-xs text-slate-500">{tx('Submitted')} {submittedDate} · {completionSummary}</p>
          <details className="mt-3 rounded-lg border border-slate-200 px-3 py-2">
            <summary className="min-h-9 cursor-pointer py-2 text-sm font-medium text-[#085587]">{tx('Review submitted details')}</summary>
            <dl className="mt-2 grid gap-x-6 gap-y-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
              {fields.map(([key, label]) => <div key={key} className="min-w-0"><dt className="text-xs font-medium text-slate-500">{tx(label)}</dt><dd className="mt-1 break-words text-sm text-slate-900">{formatValue(packet.candidate_personal_data?.[key], locale)}</dd></div>)}
            </dl>
          </details>
          {canActivate && <CandidateActivationForm packet={packet} tenantId={tenantId} locale={locale} onActivated={activated} />}
          </li>;
        })}
      </ul>}
  </section>;
}

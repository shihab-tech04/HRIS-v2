import { useEffect, useRef, useState, type FormEvent } from 'react';
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

type ActivationForm = { employeeNumber: string; joiningDate: string; detailsVerified: boolean };

function initialActivationForm(packet: PreboardingPacket): ActivationForm {
  return { employeeNumber: '', joiningDate: packet.proposed_joining_date || '', detailsVerified: false };
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
  const [revision, setRevision] = useState(0);
  const [activationForms, setActivationForms] = useState<Record<string, ActivationForm>>({});
  const [activationErrors, setActivationErrors] = useState<Record<string, string>>({});
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [activationNotice, setActivationNotice] = useState('');
  const tx = (copy: string) => projectText(locale, copy);

  useEffect(() => {
    setActivationForms({}); setActivationErrors({}); setActivationNotice('');
  }, [tenantId]);

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

  const updateActivationForm = (packet: PreboardingPacket, patch: Partial<ActivationForm>) => {
    setActivationForms(current => ({
      ...current,
      [packet.handoff_id]: { ...initialActivationForm(packet), ...current[packet.handoff_id], ...patch },
    }));
  };

  const activateEmployee = async (event: FormEvent<HTMLFormElement>, packet: PreboardingPacket) => {
    event.preventDefault();
    if (!canActivate || activatingId) return;
    const form = { ...initialActivationForm(packet), ...activationForms[packet.handoff_id] };
    if (!form.employeeNumber.trim()) {
      setActivationErrors(current => ({ ...current, [packet.handoff_id]: tx('Enter the employee number assigned by HR.') }));
      return;
    }
    if (!form.joiningDate) {
      setActivationErrors(current => ({ ...current, [packet.handoff_id]: tx('Confirm the employee joining date.') }));
      return;
    }
    if (!form.detailsVerified) {
      setActivationErrors(current => ({ ...current, [packet.handoff_id]: tx('Confirm that you verified all submitted details.') }));
      return;
    }

    setActivationErrors(current => ({ ...current, [packet.handoff_id]: '' }));
    setActivatingId(packet.handoff_id);
    try {
      const result = await supabase.rpc('hris_activate_candidate_employee', {
        p_tenant_id: tenantId,
        p_application_id: packet.application_id,
        p_employee_number: form.employeeNumber.trim(),
        p_joining_date: form.joiningDate,
        p_details_verified: form.detailsVerified,
      });
      if (result.error) {
        const message = result.error.message.toLowerCase();
        if (message.includes('employee role is not configured')) {
          throw new Error(tx('The active Employee role is not configured for this organization. Configure it before activation.'));
        }
        if (message.includes('joining date has not arrived')) {
          throw new Error(tx('Activation is available on or after the confirmed joining date.'));
        }
        if (message.includes('already assigned') || message.includes('already linked')) {
          throw new Error(tx('That employee number or Auth identity is already linked in this organization.'));
        }
        if (message.includes('details were verified')) {
          throw new Error(tx('Confirm that you verified all submitted details.'));
        }
        throw result.error;
      }
      if (!(result.data as { success?: boolean } | null)?.success) {
        throw new Error(tx('Employee activation could not be completed. Check the employee number and joining date, then retry.'));
      }
      setActivationNotice(tx('Employee activated. The candidate keeps the same sign-in identity.'));
      setRevision(value => value + 1);
    } catch (cause) {
      const knownMessages = [
        'The active Employee role is not configured for this organization. Configure it before activation.',
        'Activation is available on or after the confirmed joining date.',
        'That employee number or Auth identity is already linked in this organization.',
        'Confirm that you verified all submitted details.',
      ].map(tx);
      setActivationErrors(current => ({
        ...current,
        [packet.handoff_id]: cause instanceof Error
          ? (knownMessages.includes(cause.message)
            ? cause.message : tx('Employee activation could not be completed. Check the employee number and joining date, then retry.'))
          : tx('Employee activation could not be completed. Check the employee number and joining date, then retry.'),
      }));
    } finally {
      setActivatingId(null);
    }
  };

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
    {activationNotice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{activationNotice}</p>}
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
          const activationForm = { ...initialActivationForm(packet), ...activationForms[packet.handoff_id] };
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
          {canActivate && <form className="mt-4 space-y-3 border-t border-slate-100 pt-4" onSubmit={event => void activateEmployee(event, packet)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">{tx('Employee number')}
                <input required maxLength={32} autoComplete="off" value={activationForm.employeeNumber}
                  onChange={event => updateActivationForm(packet, { employeeNumber: event.target.value })}
                  className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base" />
              </label>
              <label className="block text-sm font-medium text-slate-700">{tx('Confirm joining date')}
                <input required type="date" value={activationForm.joiningDate}
                  onChange={event => updateActivationForm(packet, { joiningDate: event.target.value })}
                  className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base" />
              </label>
            </div>
            <label className="flex min-h-11 items-start gap-3 text-sm text-slate-700">
              <input type="checkbox" checked={activationForm.detailsVerified}
                onChange={event => updateActivationForm(packet, { detailsVerified: event.target.checked })}
                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300" />
              <span>{tx('I verified the submitted details and confirm the employee number and joining date.')}</span>
            </label>
            {activationErrors[packet.handoff_id] && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{activationErrors[packet.handoff_id]}</p>}
            <button type="submit" disabled={loading || activatingId !== null}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#085587] px-4 py-2 text-sm font-semibold text-white hover:bg-[#06466f] disabled:cursor-not-allowed disabled:opacity-60">
              {activatingId === packet.handoff_id ? tx('Activating...') : tx('Activate employee')}
            </button>
          </form>}
          </li>;
        })}
      </ul>}
  </section>;
}

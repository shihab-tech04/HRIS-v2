import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

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
};

const fields: Array<[keyof PreboardingPacket['candidate_personal_data'], string]> = [
  ['national_id', 'National ID'], ['passport_number', 'Passport number'], ['date_of_birth', 'Date of birth'],
  ['nationality', 'Nationality'], ['address', 'Address'], ['emergency_contact_name', 'Emergency contact'],
  ['emergency_contact_phone', 'Emergency phone'], ['emergency_contact_relation', 'Relationship'],
  ['bank_name', 'Bank'], ['bank_account_number', 'Bank account'],
  ['tax_identification_number', 'Tax identification number'], ['policies_accepted', 'Policies acknowledged'],
];

function formatValue(value: unknown) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return typeof value === 'string' && value.trim() ? value : '—';
}

export function CandidatePreboardingQueue({ tenantId }: { tenantId: string }) {
  const tenantRef = useRef(tenantId);
  tenantRef.current = tenantId;
  const sequence = useRef(0);
  const [packets, setPackets] = useState<PreboardingPacket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const request = ++sequence.current;
    const requestTenant = tenantId;
    setPackets([]);
    setLoading(true);
    setError('');
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
          setError('Submitted preboarding packets could not be loaded. Check recruitment management access and retry.');
        }
      } finally {
        if (request === sequence.current && tenantRef.current === requestTenant) setLoading(false);
      }
    })();
    return () => { sequence.current += 1; };
  }, [tenantId, revision]);

  return <section aria-labelledby="preboarding-queue-heading" className="mt-8 space-y-4">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h3 id="preboarding-queue-heading" className="text-xl font-semibold text-[#1E1B39]">Preboarding handoffs</h3>
        <p className="mt-1 text-sm text-slate-600">Candidate-submitted packets waiting for the HR process. Submission does not activate an employee account.</p>
      </div>
      <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50" aria-label="Refresh preboarding handoffs">
        <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
      </button>
    </header>
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <p>{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="mt-2 min-h-9 font-semibold underline">Retry</button>
    </div>}
    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading submitted packets…</p>
      : packets.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No submitted preboarding packets are waiting for HR.</p>
      : <ul className="space-y-3">
        {packets.map(packet => <li key={packet.handoff_id} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><h4 className="break-words font-semibold text-slate-900">{packet.candidate_name}</h4>
              <p className="mt-1 break-all text-sm text-slate-600">{packet.candidate_email}</p>
              <p className="mt-1 text-sm text-slate-700">{packet.job_title}</p></div>
            <span className="rounded-full bg-[#EFF7F8] px-3 py-1 text-xs font-medium text-[#085587]">Feedback pending HR review</span>
          </div>
          <p className="mt-3 text-xs text-slate-500">Submitted {new Date(packet.candidate_submitted_at).toLocaleString()} · {packet.candidate_completed_steps.length} of 4 sections</p>
          <details className="mt-3 rounded-lg border border-slate-200 px-3 py-2">
            <summary className="min-h-9 cursor-pointer py-2 text-sm font-medium text-[#085587]">Review submitted details</summary>
            <dl className="mt-2 grid gap-x-6 gap-y-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
              {fields.map(([key, label]) => <div key={key} className="min-w-0"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-slate-900">{formatValue(packet.candidate_personal_data?.[key])}</dd></div>)}
            </dl>
          </details>
        </li>)}
      </ul>}
  </section>;
}

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Download, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { downloadCsv } from './csv';
import { CandidatePreboardingQueue } from './CandidatePreboardingQueue';

type Milestone = { stage: string; created_at: string };
type Application = {
  application_id: string;
  candidate_name: string;
  job_id: string;
  job_reference: string;
  job_title: string;
  stage: string;
  applied_at: string;
  milestones: Milestone[];
};
type PipelinePayload = {
  applications?: Application[];
  available_stages?: string[];
  total_count?: number;
  limit?: number;
  offset?: number;
};

const PAGE_SIZE = 50;

function OfferIssueForm({ tenantId, application, onIssued }: {
  tenantId: string;
  application: Application;
  onIssued: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('');
  const [payPeriod, setPayPeriod] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [responseDeadline, setResponseDeadline] = useState('');
  const [terms, setTerms] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await supabase.rpc('hris_issue_candidate_offer', {
        p_tenant_id: tenantId,
        p_application_id: application.application_id,
        p_salary_amount: Number(amount),
        p_salary_currency: currency.trim().toUpperCase(),
        p_pay_period: payPeriod,
        p_proposed_joining_date: joiningDate,
        p_response_deadline: responseDeadline,
        p_terms: terms,
      });
      if (result.error) throw result.error;
      setSuccess(true);
      onIssued();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      setError(message.includes('open offer already exists')
        ? 'An offer is already awaiting this candidate’s response. Refresh the pipeline to check its status.'
        : message.includes('not found in this organization')
          ? 'This application is not available in the selected organization.'
          : 'The offer could not be issued. Check the entered terms and your recruitment access, then try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) return <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Offer issued to the candidate. Their response is tracked separately from this application workflow.</p>;

  return <details className="mt-3 rounded-lg border border-slate-200 px-3 py-2">
    <summary className="min-h-9 cursor-pointer py-2 text-sm font-semibold text-[#085587]">Issue offer</summary>
    <form onSubmit={submit} className="mt-2 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-medium text-slate-700">Offer amount
        <input aria-label="Offer amount" type="number" min="0.01" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-700">Currency code
        <input aria-label="Currency code" type="text" required maxLength={3} pattern="[A-Za-z]{3}" value={currency} onChange={event => setCurrency(event.target.value)} placeholder="e.g. BDT" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm uppercase" />
      </label>
      <label className="text-xs font-medium text-slate-700">Pay period
        <select aria-label="Pay period" required value={payPeriod} onChange={event => setPayPeriod(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
          <option value="">Select a pay period</option><option value="monthly">Monthly</option><option value="annual">Annual</option>
        </select>
      </label>
      <label className="text-xs font-medium text-slate-700">Proposed joining date
        <input aria-label="Proposed joining date" type="date" required value={joiningDate} onChange={event => setJoiningDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-700">Candidate response deadline
        <input aria-label="Candidate response deadline" type="date" required value={responseDeadline} onChange={event => setResponseDeadline(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-700 sm:col-span-2">Offer terms
        <textarea aria-label="Offer terms" required maxLength={10000} rows={5} value={terms} onChange={event => setTerms(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <span className="mt-1 block text-xs text-slate-500">These terms will be shown to the candidate before they respond.</span>
      </label>
      {error && <p role="alert" className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
      <div className="sm:col-span-2 flex justify-end">
        <button type="submit" disabled={submitting} className="min-h-11 rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white disabled:opacity-50">{submitting ? 'Issuing offer…' : 'Issue offer to candidate'}</button>
      </div>
    </form>
  </details>;
}

function InterviewScheduleForm({ tenantId, applicationId, onScheduled, compact = false }: {
  tenantId: string;
  applicationId: string;
  onScheduled: () => void;
  compact?: boolean;
}) {
  const [round, setRound] = useState('');
  const [format, setFormat] = useState('Video Call');
  const [scheduledAt, setScheduledAt] = useState('');
  const [duration, setDuration] = useState('30');
  const [location, setLocation] = useState('');
  const [panel, setPanel] = useState('');
  const [instructions, setInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [successTimeZone, setSuccessTimeZone] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await supabase.rpc('hris_schedule_candidate_interview', {
        p_tenant_id: tenantId,
        p_application_id: applicationId,
        p_round_name: round.trim(),
        p_format: format,
        p_scheduled_at: scheduledAt,
        p_duration_minutes: Number(duration),
        p_location_or_link: location.trim() || null,
        p_panel_members: panel.split(',').map(name => name.trim()).filter(Boolean),
        p_instructions: instructions.trim() || null,
      });
      if (result.error) throw result.error;
      setSuccessTimeZone(typeof result.data?.timezone === 'string' ? result.data.timezone : 'organization time zone');
      setSuccess(true);
      onScheduled();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.toLowerCase() : '';
      setError(message.includes('already active')
        ? 'An interview invitation is already awaiting a response. Review the interview response list below.'
        : message.includes('not found in this organization')
          ? 'This application is not available in the selected organization.'
          : message.includes('recruitment management access')
            ? 'You do not have interview scheduling access for this organization.'
            : 'The interview could not be scheduled. Check the details and your recruitment access, then try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) return <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Interview invitation scheduled ({successTimeZone}). The candidate can now review and respond from Interviews.</p>;

  const form = <form onSubmit={submit} className="mt-2 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-medium text-slate-700">Interview round
        <input aria-label="Interview round" required maxLength={120} value={round} onChange={event => setRound(event.target.value)} placeholder="e.g. Technical interview" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-700">Format
        <select aria-label="Interview format" value={format} onChange={event => setFormat(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
          <option>Video Call</option><option>In-person</option><option>Phone Call</option>
        </select>
      </label>
      <label className="text-xs font-medium text-slate-700">Date and time (organization time zone)
        <input aria-label="Interview date and time (organization time zone)" type="datetime-local" required value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-700">Duration in minutes
        <input aria-label="Interview duration in minutes" type="number" min="15" max="480" step="15" required value={duration} onChange={event => setDuration(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-700 sm:col-span-2">{format === 'Video Call' ? 'Secure meeting link' : format === 'In-person' ? 'Interview location' : 'Call details (optional)'}
        <input aria-label={format === 'Video Call' ? 'Secure meeting link' : format === 'In-person' ? 'Interview location' : 'Call details'} type={format === 'Video Call' ? 'url' : 'text'} required={format !== 'Phone Call'} value={location} onChange={event => setLocation(event.target.value)} placeholder={format === 'Video Call' ? 'https://…' : format === 'In-person' ? 'Office and room' : 'Optional dial-in details'} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-700 sm:col-span-2">Panel members (comma separated)
        <input aria-label="Panel members" value={panel} onChange={event => setPanel(event.target.value)} placeholder="Names shown to the candidate" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-700 sm:col-span-2">Candidate instructions (optional)
        <textarea aria-label="Candidate instructions" rows={3} maxLength={4000} value={instructions} onChange={event => setInstructions(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </label>
      {error && <p role="alert" className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
      <div className="sm:col-span-2 flex justify-end"><button type="submit" disabled={submitting} className="min-h-11 rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white disabled:opacity-50">{submitting ? 'Scheduling…' : 'Send interview invitation'}</button></div>
  </form>;
  return compact ? form : <details className="mt-3 rounded-lg border border-slate-200 px-3 py-2">
    <summary className="min-h-9 cursor-pointer py-2 text-sm font-semibold text-[#085587]">Schedule interview</summary>
    {form}
  </details>;
}

type InterviewResponse = {
  id: string;
  application_id: string;
  candidate_name: string;
  candidate_email: string;
  job_title: string;
  round_name: string;
  scheduled_at: string;
  duration_minutes: number;
  candidate_response: string;
  candidate_response_note: string | null;
  candidate_proposed_times: string | null;
  timezone: string | null;
};

function CandidateInterviewResponses({ tenantId, revision, onRescheduled }: {
  tenantId: string;
  revision: number;
  onRescheduled: (applicationId: string) => void;
}) {
  const [rows, setRows] = useState<InterviewResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState('');
  useEffect(() => {
    let current = true;
    setRows([]); setLoading(true); setError('');
    void (async () => {
      try {
        const result = await supabase.rpc('hris_get_candidate_interview_responses', { p_tenant_id: tenantId });
        if (result.error) throw result.error;
        if (!Array.isArray(result.data)) throw new Error('Interview response service returned an invalid response.');
        if (current) setRows(result.data as InterviewResponse[]);
      } catch {
        if (current) { setRows([]); setError('Interview responses could not be loaded. Check recruitment management access and retry.'); }
      } finally { if (current) setLoading(false); }
    })();
    return () => { current = false; };
  }, [tenantId, revision, retry]);

  const responseLabel: Record<string, string> = {
    invited: 'Awaiting candidate response', confirmed: 'Candidate accepted',
    declined: 'Candidate declined', reschedule_requested: 'Reschedule requested',
  };
  return <section aria-labelledby="interview-responses-heading" className="space-y-3">
    <div><h3 id="interview-responses-heading" className="text-xl font-semibold text-[#1E1B39]">Interview responses</h3>
      <p className="mt-1 text-sm text-slate-600">Candidate replies and rescheduling availability for this organization.</p></div>
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="font-semibold underline">Retry</button></div>}
    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading interview responses…</p>
      : rows.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">No interview invitations have been scheduled.</p>
      : <ul className="space-y-3">{rows.map(row => <li key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h4 className="break-words font-semibold text-slate-900">{row.candidate_name}</h4><p className="break-all text-sm text-slate-600">{row.candidate_email}</p><p className="mt-1 text-sm text-slate-700">{row.job_title} · {row.round_name.split(' — ')[0]}</p><p className="mt-1 text-xs text-slate-500">{dateTime(row.scheduled_at, row.timezone || undefined)} · {row.duration_minutes} minutes{row.timezone ? ` · ${row.timezone}` : ''}</p></div>
          <span className="w-fit rounded-full bg-[#EFF7F8] px-3 py-1 text-xs font-medium text-[#085587]">{responseLabel[row.candidate_response] || 'Response recorded'}</span></div>
        {row.candidate_response_note && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><strong>Candidate note:</strong> {row.candidate_response_note}</p>}
        {row.candidate_proposed_times && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><strong>Proposed availability:</strong> {row.candidate_proposed_times}</p>}
        {row.candidate_response === 'reschedule_requested' && <details className="mt-3 rounded-lg border border-slate-200 px-3 py-2" open={expanded === row.id} onToggle={event => setExpanded((event.currentTarget as HTMLDetailsElement).open ? row.id : '')}>
          <summary className="min-h-9 cursor-pointer py-2 text-sm font-semibold text-[#085587]">Offer another time</summary>
          <InterviewScheduleForm key={`${tenantId}-${row.application_id}-${revision}`} compact tenantId={tenantId} applicationId={row.application_id} onScheduled={() => onRescheduled(row.application_id)} />
        </details>}
      </li>)}</ul>}
  </section>;
}

function stageLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function dateTime(value: string, timeZone?: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : parsed.toLocaleString(undefined, timeZone ? { timeZone } : undefined);
}

export function RecruitmentPipeline({ tenantId, canManagePreboarding = false, canManageOffers = false }: { tenantId: string; canManagePreboarding?: boolean; canManageOffers?: boolean }) {
  const tenantRef = useRef(tenantId);
  tenantRef.current = tenantId;
  const [applications, setApplications] = useState<Application[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [stage, setStage] = useState('');
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [recentlyIssuedApplicationIds, setRecentlyIssuedApplicationIds] = useState<Set<string>>(() => new Set());
  const [recentlyScheduledApplicationIds, setRecentlyScheduledApplicationIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  useEffect(() => {
    const request = ++requestSequence.current;
    const requestTenantId = tenantId;
    setApplications([]);
    setStages([]);
    setTotalCount(0);
    setRecentlyIssuedApplicationIds(new Set());
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const result = await supabase.rpc('hris_get_recruitment_pipeline', {
          p_tenant_id: requestTenantId,
          p_search: submittedSearch || null,
          p_stage: stage || null,
          p_limit: PAGE_SIZE,
          p_offset: offset,
        });
        if (request !== requestSequence.current || tenantRef.current !== requestTenantId) return;
        if (result.error) throw result.error;
        const payload = result.data as PipelinePayload | null;
        if (!payload || !Array.isArray(payload.applications) || !Array.isArray(payload.available_stages)
          || typeof payload.total_count !== 'number') {
          throw new Error('Recruitment pipeline returned an invalid response.');
        }
        setApplications(payload.applications);
        setStages(payload.available_stages);
        setTotalCount(payload.total_count);
      } catch {
        if (request !== requestSequence.current || tenantRef.current !== requestTenantId) return;
        setApplications([]);
        setStages([]);
        setTotalCount(0);
        setError('Unable to load applications for this organization. Check your recruitment access and try again.');
      } finally {
        if (request === requestSequence.current && tenantRef.current === requestTenantId) setLoading(false);
      }
    })();
    return () => { requestSequence.current += 1; };
  }, [tenantId, submittedSearch, stage, offset, revision]);

  useEffect(() => { setRecentlyScheduledApplicationIds(new Set()); }, [tenantId]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setSubmittedSearch(search.trim());
  }

  function exportApplications() {
    downloadCsv(`recruitment-applications-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Candidate', 'Job reference', 'Job title', 'Stage', 'Applied at'],
      applications.map(application => [application.candidate_name, application.job_reference,
        application.job_title, stageLabel(application.stage), application.applied_at]));
  }

  const first = totalCount === 0 ? 0 : offset + 1;
  const last = Math.min(offset + applications.length, totalCount);

  return <section aria-labelledby="recruitment-pipeline-heading" className="space-y-4">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h3 id="recruitment-pipeline-heading" className="text-xl font-semibold text-[#1E1B39]">Candidate pipeline</h3>
        <p className="mt-1 text-sm text-slate-600">Tenant-authorized applications and candidate-visible milestone history.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={loading} onClick={() => { setRecentlyIssuedApplicationIds(new Set()); setRevision(value => value + 1); }}
          aria-label="Refresh candidate applications"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
        </button>
        <button type="button" disabled={loading || applications.length === 0} onClick={exportApplications}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#085587] bg-white px-3 text-sm text-[#085587] disabled:opacity-50">
          <Download className="h-4 w-4" aria-hidden="true" /> Export current page
        </button>
      </div>
    </header>

    <p className="rounded-lg border border-[#B9DCE2] bg-[#F4FAFB] p-3 text-sm text-slate-700">
      This read-only view excludes application answers, CVs, uploaded files, private recruiter notes, and panel evaluations.
    </p>

    <form onSubmit={applyFilters} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
      <label className="relative block text-xs font-medium text-slate-600">
        Search candidate, vacancy or stage
        <Search className="pointer-events-none absolute left-3 top-[2.35rem] h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input type="search" value={search} onChange={event => setSearch(event.target.value)}
          aria-label="Search candidate applications" placeholder="Name, job title, reference or stage"
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900" />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Application stage
        <select value={stage} onChange={event => { setStage(event.target.value); setOffset(0); }}
          aria-label="Filter candidate applications by stage"
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900">
          <option value="">All stages</option>
          {stages.map(value => <option key={value} value={value}>{stageLabel(value)}</option>)}
        </select>
      </label>
      <div className="flex items-end"><button type="submit" disabled={loading}
        className="min-h-11 w-full rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto">Apply filters</button></div>
    </form>

    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <p>{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="mt-2 min-h-9 font-semibold underline">Retry</button>
    </div>}

    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading authorized applications…</p>
      : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-sm">
          <h4 className="font-medium text-slate-800">Applications</h4>
          <p aria-live="polite" className="text-slate-500">{first}–{last} of {totalCount}</p>
        </div>
        {applications.length === 0 ? <div className="p-6 text-center">
          <p className="font-medium text-slate-800">{totalCount ? 'No applications on this page' : 'No applications found'}</p>
          <p className="mt-1 text-sm text-slate-600">Try another search or stage, or refresh to check for new applications.</p>
        </div> : <ul className="divide-y divide-slate-100">
          {applications.map(application => <li key={application.application_id} className="p-4 sm:p-5">
            <article className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="break-words font-semibold text-slate-900">{application.candidate_name}</p>
                <p className="mt-1 break-words text-sm text-slate-700">{application.job_title}</p>
                <p className="mt-1 text-xs text-slate-500">{application.job_reference} · Applied {dateTime(application.applied_at)}</p>
              </div>
              <span className="w-fit shrink-0 rounded-full bg-[#EFF7F8] px-3 py-1 text-xs font-medium text-[#085587]">{stageLabel(application.stage)}</span>
            </article>
            <details className="mt-3 rounded-lg border border-slate-200 px-3 py-2">
              <summary className="min-h-8 cursor-pointer py-1 text-sm font-medium text-[#085587]">View candidate-visible milestones</summary>
              {application.milestones.length === 0 ? <p className="py-2 text-sm text-slate-600">No milestones recorded yet.</p>
                : <ol className="mt-2 space-y-2 border-l border-[#B9DCE2] pl-4">
                  {application.milestones.map((milestone, index) => <li key={`${milestone.created_at}-${milestone.stage}-${index}`} className="relative text-sm">
                    <span className="absolute -left-[1.32rem] top-1.5 h-2 w-2 rounded-full bg-[#085587]" aria-hidden="true" />
                    <span className="font-medium text-slate-800">{stageLabel(milestone.stage)}</span>
                    <span className="block text-xs text-slate-500">{dateTime(milestone.created_at)}</span>
                  </li>)}
                </ol>}
            </details>
            {canManageOffers && recentlyIssuedApplicationIds.has(application.application_id)
              && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Offer issued to the candidate. Their response is tracked separately from this application workflow.</p>}
            {canManageOffers && !recentlyIssuedApplicationIds.has(application.application_id) && application.stage !== 'offer_extended' && !['withdrawn', 'rejected', 'offer_accepted', 'hired'].includes(application.stage)
              && <OfferIssueForm key={`${tenantId}-${application.application_id}`} tenantId={tenantId} application={application} onIssued={() => {
                setApplications(current => current.map(value => value.application_id === application.application_id ? { ...value, stage: 'offer_extended' } : value));
                setRecentlyIssuedApplicationIds(current => new Set(current).add(application.application_id));
              }} />}
            {canManageOffers && !recentlyIssuedApplicationIds.has(application.application_id) && application.stage === 'offer_extended'
              && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">An offer is awaiting the candidate’s response.</p>}
            {canManageOffers && recentlyScheduledApplicationIds.has(application.application_id)
              && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Interview invitation scheduled. The candidate can now review and respond from Interviews.</p>}
            {canManageOffers && !recentlyScheduledApplicationIds.has(application.application_id) && application.stage !== 'interview_scheduled'
              && !['withdrawn', 'rejected', 'offer_extended', 'offer_accepted', 'offer_declined', 'hired'].includes(application.stage)
              && <InterviewScheduleForm key={`${tenantId}-${application.application_id}`} tenantId={tenantId} applicationId={application.application_id} onScheduled={() => {
                setRecentlyScheduledApplicationIds(current => new Set(current).add(application.application_id));
                setApplications(current => current.map(value => value.application_id === application.application_id ? { ...value, stage: 'interview_scheduled' } : value));
                setRevision(value => value + 1);
              }} />}
          </li>)}
        </ul>}
        <footer className="flex items-center justify-between gap-3 border-t border-slate-100 p-3">
          <button type="button" disabled={loading || offset === 0} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}
            className="min-h-10 rounded-md border border-slate-300 px-3 text-sm disabled:opacity-50">Previous</button>
          <p className="text-xs text-slate-500">Page size {PAGE_SIZE}</p>
          <button type="button" disabled={loading || offset + PAGE_SIZE >= totalCount} onClick={() => setOffset(value => value + PAGE_SIZE)}
            className="min-h-10 rounded-md border border-slate-300 px-3 text-sm disabled:opacity-50">Next</button>
        </footer>
      </div>}
    {canManageOffers && <CandidateInterviewResponses tenantId={tenantId} revision={revision} onRescheduled={applicationId => {
      setRecentlyScheduledApplicationIds(current => new Set(current).add(applicationId));
      setApplications(current => current.map(value => value.application_id === applicationId ? { ...value, stage: 'interview_scheduled' } : value));
      setRevision(value => value + 1);
    }} />}
    {canManagePreboarding && <CandidatePreboardingQueue tenantId={tenantId} />}
  </section>;
}

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Assessment = {
  id: string;
  application_id: string;
  candidate_name: string;
  job_title: string;
  title: string;
  assessment_type: string;
  instructions: string;
  deadline_date: string;
  status: 'pending' | 'submitted' | 'reviewed';
  submission_data: { submission_text?: string | null; file_url?: string | null; file_name?: string | null } | null;
  submitted_at: string | null;
  reviewed_at: string | null;
};

type Application = { application_id: string; candidate_name: string; job_title: string };

function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function CandidateAssessmentAssignment({ tenantId, application, onAssigned }: {
  tenantId: string;
  application: Application;
  onAssigned: () => void;
}) {
  const [title, setTitle] = useState('');
  const [assessmentType, setAssessmentType] = useState('');
  const [instructions, setInstructions] = useState('');
  const [deadline, setDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setSuccess(false);
    try {
      const result = await supabase.rpc('hris_assign_candidate_assessment', {
        p_tenant_id: tenantId,
        p_application_id: application.application_id,
        p_title: title.trim(),
        p_assessment_type: assessmentType.trim(),
        p_instructions: instructions.trim(),
        p_deadline_date: deadline,
      });
      if (result.error) throw result.error;
      setSuccess(true);
      setTitle(''); setAssessmentType(''); setInstructions(''); setDeadline('');
      onAssigned();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.toLowerCase() : '';
      setError(message.includes('not found in this organization')
        ? 'This application is not available in the selected organization.'
        : message.includes('closed application')
          ? 'An assessment cannot be assigned to a closed application.'
          : 'The assessment could not be assigned. Check the details and recruitment access, then retry.');
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    {success && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Assessment assigned to {application.candidate_name}. The candidate can submit it from Tasks &amp; qualifications.</p>}
    <details className="mt-3 rounded-lg border border-slate-200 px-3 py-2">
    <summary className="min-h-9 cursor-pointer py-2 text-sm font-semibold text-[#085587]">Assign assessment</summary>
    <form onSubmit={submit} className="mt-2 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-medium text-slate-700">Assessment title
        <input aria-label={`Assessment title for ${application.candidate_name}`} required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-700">Assessment type
        <input aria-label={`Assessment type for ${application.candidate_name}`} required maxLength={100} value={assessmentType} onChange={event => setAssessmentType(event.target.value)} placeholder="e.g. Technical" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-700 sm:col-span-2">Candidate instructions
        <textarea aria-label={`Assessment instructions for ${application.candidate_name}`} required maxLength={10000} rows={4} value={instructions} onChange={event => setInstructions(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-700">Due date
        <input aria-label={`Assessment due date for ${application.candidate_name}`} type="date" min={localToday()} required value={deadline} onChange={event => setDeadline(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
      </label>
      {error && <p role="alert" className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
      <div className="sm:col-span-2 flex justify-end">
        <button type="submit" disabled={submitting} className="min-h-11 rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white disabled:opacity-50">
          {submitting ? 'Assigning…' : 'Assign to candidate'}
        </button>
      </div>
    </form>
    </details>
  </>;
}

export function CandidateAssessmentQueue({ tenantId, revision }: { tenantId: string; revision: number }) {
  const [rows, setRows] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [reviewing, setReviewing] = useState('');
  const [reviewError, setReviewError] = useState('');

  useEffect(() => {
    let current = true;
    setRows([]); setLoading(true); setError('');
    void (async () => {
      try {
        const result = await supabase.rpc('hris_get_candidate_assessments', { p_tenant_id: tenantId });
        if (result.error) throw result.error;
        if (!Array.isArray(result.data)) throw new Error('Assessment service returned an invalid response.');
        if (current) setRows(result.data as Assessment[]);
      } catch {
        if (current) { setRows([]); setError('Candidate assessments could not be loaded. Check recruitment management access and retry.'); }
      } finally { if (current) setLoading(false); }
    })();
    return () => { current = false; };
  }, [tenantId, revision, retry]);

  async function markReviewed(row: Assessment) {
    setReviewing(row.id); setReviewError('');
    try {
      const result = await supabase.rpc('hris_review_candidate_assessment', {
        p_tenant_id: tenantId, p_assessment_id: row.id, p_review_note: null,
      });
      if (result.error) throw result.error;
      setRows(current => current.map(item => item.id === row.id ? { ...item, status: 'reviewed', reviewed_at: new Date().toISOString() } : item));
    } catch {
      setReviewError('The review status could not be saved. Refresh the assessment list and retry.');
    } finally { setReviewing(''); }
  }

  const label: Record<Assessment['status'], string> = { pending: 'Awaiting candidate work', submitted: 'Submitted for review', reviewed: 'Review complete' };
  return <section aria-labelledby="candidate-assessments-heading" className="space-y-3">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div><h3 id="candidate-assessments-heading" className="text-xl font-semibold text-[#1E1B39]">Candidate assessments</h3>
        <p className="mt-1 text-sm text-slate-600">Assignments, candidate work and review status for this organization.</p></div>
      <button type="button" disabled={loading} onClick={() => setRetry(value => value + 1)} aria-label="Refresh candidate assessments" className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50 sm:self-auto">
        <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
      </button>
    </div>
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="font-semibold underline">Retry</button></div>}
    {reviewError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{reviewError}</p>}
    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading candidate assessments…</p>
      : rows.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">No candidate assessments have been assigned.</p>
      : <ul className="space-y-3">{rows.map(row => {
        const response = row.submission_data;
        const safeUrl = typeof response?.file_url === 'string' && /^https:\/\//i.test(response.file_url) ? response.file_url : '';
        return <li key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0">
            <h4 className="break-words font-semibold text-slate-900">{row.title}</h4>
            <p className="mt-1 break-words text-sm text-slate-700">{row.candidate_name} · {row.job_title}</p>
            <p className="mt-1 text-xs text-slate-500">{row.assessment_type} · Due {row.deadline_date}</p>
          </div><span className="w-fit rounded-full bg-[#EFF7F8] px-3 py-1 text-xs font-medium text-[#085587]">{label[row.status]}</span></div>
          {row.status === 'pending' && <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{row.instructions}</p>}
          {response?.submission_text && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-800"><p className="font-semibold">Candidate submission</p><p className="mt-1 whitespace-pre-wrap break-words">{response.submission_text}</p></div>}
          {safeUrl && <p className="mt-2 break-all text-sm"><a href={safeUrl} target="_blank" rel="noreferrer" className="font-medium text-[#085587] underline">{response?.file_name || 'Open candidate submission link'}</a></p>}
          {row.status === 'submitted' && <div className="mt-3 flex justify-end"><button type="button" disabled={reviewing === row.id} onClick={() => void markReviewed(row)} className="min-h-11 rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white disabled:opacity-50">{reviewing === row.id ? 'Saving review…' : 'Mark review complete'}</button></div>}
          {row.status === 'reviewed' && row.reviewed_at && <p className="mt-3 text-xs text-slate-500">Reviewed {new Date(row.reviewed_at).toLocaleDateString()}</p>}
        </li>;
      })}</ul>}
  </section>;
}

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Locale } from './project-locale';
import { candidateAssessmentText } from './candidate-assessment-locale';

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
  review_note: string | null;
  reviewed_at: string | null;
};

type Application = { application_id: string; candidate_name: string; job_title: string };

function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function CandidateAssessmentAssignment({ tenantId, application, locale, onAssigned }: {
  tenantId: string;
  application: Application;
  locale: Locale;
  onAssigned: () => void;
}) {
  const tx = (text: string) => candidateAssessmentText(locale, text);
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
        ? tx('This application is not available in the selected organization.')
        : message.includes('closed application')
          ? tx('An assessment cannot be assigned to a closed application.')
          : tx('The assessment could not be assigned. Check the details and recruitment access, then retry.'));
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    {success && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{tx('Assessment assigned. The candidate can submit it from Tasks & qualifications.')}</p>}
    <details className="mt-3 rounded-lg border border-slate-200 px-3 py-2">
    <summary className="min-h-9 cursor-pointer py-2 text-sm font-semibold text-[#085587]">{tx('Assign assessment')}</summary>
    <form onSubmit={submit} className="mt-2 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-medium text-slate-700">{tx('Assessment title')}
        <input aria-label={`${tx('Assessment title')} — ${application.candidate_name}`} required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-700">{tx('Assessment type')}
        <input aria-label={`${tx('Assessment type')} — ${application.candidate_name}`} required maxLength={100} value={assessmentType} onChange={event => setAssessmentType(event.target.value)} placeholder={tx('e.g. Technical')} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-700 sm:col-span-2">{tx('Candidate instructions')}
        <textarea aria-label={`${tx('Assessment instructions')} — ${application.candidate_name}`} required maxLength={10000} rows={4} value={instructions} onChange={event => setInstructions(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-700">{tx('Due date')}
        <input aria-label={`${tx('Due date')} — ${application.candidate_name}`} type="date" min={localToday()} required value={deadline} onChange={event => setDeadline(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
      </label>
      {error && <p role="alert" className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
      <div className="sm:col-span-2 flex justify-end">
        <button type="submit" disabled={submitting} className="min-h-11 rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white disabled:opacity-50">
          {submitting ? tx('Assigning…') : tx('Assign to candidate')}
        </button>
      </div>
    </form>
    </details>
  </>;
}

export function CandidateAssessmentQueue({ tenantId, revision, locale }: { tenantId: string; revision: number; locale: Locale }) {
  const tx = (text: string) => candidateAssessmentText(locale, text);
  const currentLocale = useRef(locale);
  currentLocale.current = locale;
  const [rows, setRows] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [reviewing, setReviewing] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [savingReview, setSavingReview] = useState(false);
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
        if (current) { setRows([]); setError(candidateAssessmentText(currentLocale.current, 'Candidate assessments could not be loaded. Check recruitment management access and retry.')); }
      } finally { if (current) setLoading(false); }
    })();
    return () => { current = false; };
  }, [tenantId, revision, retry]);

  function startReview(row: Assessment) {
    setReviewError('');
    setReviewNote('');
    setReviewing(row.id);
  }

  function cancelReview() {
    if (savingReview) return;
    setReviewing('');
    setReviewNote('');
    setReviewError('');
  }

  async function markReviewed(event: FormEvent<HTMLFormElement>, row: Assessment) {
    event.preventDefault();
    if (!reviewing || reviewing !== row.id || savingReview) return;
    setSavingReview(true); setReviewError('');
    const savedNote = reviewNote.trim() || null;
    try {
      const result = await supabase.rpc('hris_review_candidate_assessment', {
        p_tenant_id: tenantId, p_assessment_id: row.id, p_review_note: savedNote,
      });
      if (result.error) throw result.error;
      setRows(current => current.map(item => item.id === row.id ? { ...item, status: 'reviewed', review_note: savedNote, reviewed_at: new Date().toISOString() } : item));
      setReviewing('');
      setReviewNote('');
    } catch {
      setReviewError(candidateAssessmentText(currentLocale.current, 'The review status could not be saved. Your note is kept here; retry or refresh the assessment list.'));
    } finally { setSavingReview(false); }
  }

  const label: Record<Assessment['status'], string> = {
    pending: tx('Awaiting candidate work'), submitted: tx('Submitted for review'), reviewed: tx('Review complete'),
  };
  return <section aria-labelledby="candidate-assessments-heading" className="space-y-3">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div><h3 id="candidate-assessments-heading" className="text-xl font-semibold text-[#1E1B39]">{tx('Candidate assessments')}</h3>
        <p className="mt-1 text-sm text-slate-600">{tx('Assignments, candidate work and review status for this organization.')}</p></div>
      <button type="button" disabled={loading} onClick={() => setRetry(value => value + 1)} aria-label={tx('Refresh candidate assessments')} className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50 sm:self-auto">
        <RefreshCw className="h-4 w-4" aria-hidden="true" /> {tx('Refresh')}
      </button>
    </div>
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="font-semibold underline">{tx('Retry')}</button></div>}
    {reviewError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{reviewError}</p>}
    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{tx('Loading candidate assessments…')}</p>
      : rows.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{tx('No candidate assessments have been assigned.')}</p>
      : <ul className="space-y-3">{rows.map(row => {
        const response = row.submission_data;
        const safeUrl = typeof response?.file_url === 'string' && /^https:\/\//i.test(response.file_url) ? response.file_url : '';
        return <li key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0">
            <h4 className="break-words font-semibold text-slate-900">{row.title}</h4>
            <p className="mt-1 break-words text-sm text-slate-700">{row.candidate_name} · {row.job_title}</p>
            <p className="mt-1 text-xs text-slate-500">{row.assessment_type} · {tx('Due')} {row.deadline_date}</p>
          </div><span className="w-fit rounded-full bg-[#EFF7F8] px-3 py-1 text-xs font-medium text-[#085587]">{label[row.status]}</span></div>
          {row.status === 'pending' && <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{row.instructions}</p>}
          {response?.submission_text && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-800"><p className="font-semibold">{tx('Candidate submission')}</p><p className="mt-1 whitespace-pre-wrap break-words">{response.submission_text}</p></div>}
          {safeUrl && <p className="mt-2 break-all text-sm"><a href={safeUrl} target="_blank" rel="noreferrer" className="font-medium text-[#085587] underline">{response?.file_name || tx('Open candidate submission link')}</a></p>}
          {row.status === 'submitted' && reviewing !== row.id && <div className="mt-3 flex justify-end"><button type="button" onClick={() => startReview(row)} className="min-h-11 rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white">{tx('Review submission')}</button></div>}
          {row.status === 'submitted' && reviewing === row.id && <form onSubmit={event => void markReviewed(event, row)} className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
            <div><label htmlFor={`assessment-review-note-${row.id}`} className="block text-sm font-semibold text-slate-800">{tx('Internal review note')} <span className="font-normal text-slate-600">({tx('optional')})</span></label>
              <p id={`assessment-review-note-help-${row.id}`} className="mt-1 text-xs text-slate-600">{tx('This note is visible only to authorized recruitment staff.')}</p>
              <textarea id={`assessment-review-note-${row.id}`} aria-describedby={`assessment-review-note-help-${row.id}`} maxLength={5000} rows={4} value={reviewNote} onChange={event => setReviewNote(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={cancelReview} disabled={savingReview} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 disabled:opacity-50">{tx('Cancel')}</button>
              <button type="submit" disabled={savingReview} className="min-h-11 rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white disabled:opacity-50">{savingReview ? tx('Saving review…') : tx('Mark review complete')}</button>
            </div>
          </form>}
          {row.status === 'reviewed' && row.reviewed_at && <p className="mt-3 text-xs text-slate-500">{tx('Reviewed')} {new Date(row.reviewed_at).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US')}</p>}
          {row.status === 'reviewed' && row.review_note && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800"><p className="font-semibold">{tx('Internal review note')}</p><p className="mt-1 whitespace-pre-wrap break-words">{row.review_note}</p><p className="mt-2 text-xs text-slate-500">{tx('Visible only to authorized recruitment staff.')}</p></div>}
        </li>;
      })}</ul>}
  </section>;
}

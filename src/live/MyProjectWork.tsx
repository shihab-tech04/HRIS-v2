import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ClipboardCheck, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Criterion = 'quality_of_work' | 'collaboration_teamwork' | 'delivery_reliability' | 'ownership_communication';
type CriterionOption = { key: Criterion; label: string };
const criteria: CriterionOption[] = [
  { key: 'quality_of_work', label: 'Quality of Work' },
  { key: 'collaboration_teamwork', label: 'Collaboration & Teamwork' },
  { key: 'delivery_reliability', label: 'Delivery & Reliability' },
  { key: 'ownership_communication', label: 'Ownership & Communication' },
];
type Task = { task_id: string; project_name: string; project_code: string; title: string; description: string; due_date: string | null; status: string; feedback_pending: number; members: { employee_name: string }[] };
type Review = {
  id: string; task_title: string; project_name: string; reviewer_employee_id: string;
  reviewer_name: string; reviewee_employee_id: string; reviewee_name: string; status: 'pending' | 'submitted';
  quality_of_work_score: number | null; quality_of_work_not_observed: boolean;
  collaboration_teamwork_score: number | null; collaboration_teamwork_not_observed: boolean;
  delivery_reliability_score: number | null; delivery_reliability_not_observed: boolean;
  ownership_communication_score: number | null; ownership_communication_not_observed: boolean; comments: string;
};
type Draft = { values: Record<Criterion, string>; comments: string };
const emptyDraft = (): Draft => ({ values: { quality_of_work: '', collaboration_teamwork: '', delivery_reliability: '', ownership_communication: '' }, comments: '' });

function errorMessage(cause: unknown, fallback: string) {
  if (cause instanceof Error && cause.message) return cause.message;
  if (cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string') return cause.message;
  return fallback;
}

export function MyProjectWork({ tenantId }: { tenantId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);

  useEffect(() => {
    const request = ++sequence.current;
    setTasks([]); setReviews([]); setLoading(true); setError('');
    void (async () => {
      try {
        const [taskResult, reviewResult] = await Promise.all([
          supabase.rpc('hris_get_my_project_tasks', { p_tenant_id: tenantId }),
          supabase.rpc('hris_get_my_project_peer_reviews', { p_tenant_id: tenantId }),
        ]);
        if (request !== sequence.current) return;
        if (taskResult.error) throw taskResult.error;
        if (reviewResult.error) throw reviewResult.error;
        const nextTasks = (taskResult.data as { tasks?: Task[] } | null)?.tasks;
        const nextReviews = (reviewResult.data as { reviews?: Review[] } | null)?.reviews;
        if (!Array.isArray(nextTasks) || !Array.isArray(nextReviews)) throw new Error('Project work returned an invalid response.');
        setTasks(nextTasks); setReviews(nextReviews);
        setDrafts(current => Object.fromEntries(nextReviews.filter(review => review.status === 'pending')
          .map(review => [review.id, current[review.id] || emptyDraft()])));
      } catch (cause) {
        if (request === sequence.current) setError(errorMessage(cause, 'Unable to load your project work.'));
      } finally { if (request === sequence.current) setLoading(false); }
    })();
    return () => { sequence.current += 1; };
  }, [tenantId, revision]);

  const pending = reviews.filter(review => review.status === 'pending' && review.reviewer_employee_id);

  async function submit(review: Review) {
    const draft = drafts[review.id] || emptyDraft();
    const missing = criteria.find(item => !draft.values[item.key]);
    if (missing) { setError(`Choose a score or Not Observed for ${missing.label}.`); return; }
    const notObserved = criteria.filter(item => draft.values[item.key] === 'not_observed').map(item => item.key);
    const scores = Object.fromEntries(criteria.map(item => [item.key, draft.values[item.key] === 'not_observed' ? null : Number(draft.values[item.key])])) as Record<Criterion, number | null>;
    setSavingId(review.id); setError(''); setNotice('');
    try {
      const result = await supabase.rpc('hris_submit_project_peer_review', {
        p_tenant_id: tenantId, p_review_id: review.id, p_scores: scores,
        p_not_observed: notObserved, p_comments: draft.comments.trim(),
      });
      if (result.error) throw result.error;
      setNotice(`Review for ${review.reviewee_name} submitted.`);
      setRevision(value => value + 1);
    } catch (cause) { setError(errorMessage(cause, 'Unable to submit this review.')); }
    finally { setSavingId(''); }
  }

  return <section aria-labelledby="my-project-work-heading" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 id="my-project-work-heading" className="text-xl font-medium text-[#49454F]">My project work</h3><p className="mt-1 text-sm text-slate-500">Task work and peer feedback are tracked separately.</p></div><button type="button" disabled={loading} onClick={() => { setNotice(''); setRevision(value => value + 1); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true"/>Refresh</button></div>
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><p role="alert">{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-9 rounded-md border border-rose-300 bg-white px-3">Retry</button></div>}
    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading tasks and reviews…</p> : <>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><h4 className="font-semibold text-slate-900">Assigned tasks</h4>{tasks.length === 0 ? <p role="status" className="mt-3 text-sm text-slate-600">No tasks are assigned to you.</p> : <ul className="mt-3 divide-y divide-slate-100">{tasks.map(task => <li key={task.task_id} className="py-3 first:pt-0 last:pb-0"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-slate-500">{task.project_code} · {task.project_name}</p><p className="mt-1 break-words font-medium text-slate-900">{task.title}</p>{task.description && <p className="mt-1 text-sm text-slate-600">{task.description}</p>}<p className="mt-1 text-xs text-slate-500">Due: {task.due_date || 'Not set'} · Collaborators: {task.members.map(member => member.employee_name).join(', ') || '—'}</p>{task.feedback_pending > 0 && <p className="mt-2 inline-block rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">Feedback Pending · {task.feedback_pending} required reviews</p>}</div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{task.status.replace('_', ' ')}</span></div></li>)}</ul>}</div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-[#08558B]" aria-hidden="true"/><h4 className="font-semibold text-slate-900">Peer reviews to complete</h4><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">{pending.length} pending</span></div>{pending.length === 0 ? <p role="status" className="mt-3 text-sm text-slate-600">No peer reviews are waiting for you.</p> : <div className="mt-3 space-y-3">{pending.map(review => {
        const draft = drafts[review.id] || emptyDraft();
        return <article key={review.id} className="rounded-lg border border-slate-200 p-4">
          <div><p className="text-xs text-slate-500">{review.project_name} · {review.task_title}</p><h5 className="mt-1 font-semibold text-slate-900">Review {review.reviewee_name}</h5></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{criteria.map(item => <label key={item.key} className="text-xs font-medium text-slate-600">{item.label}<select value={draft.values[item.key]} onChange={event => setDrafts(current => ({ ...current, [review.id]: { ...(current[review.id] || emptyDraft()), values: { ...(current[review.id] || emptyDraft()).values, [item.key]: event.target.value } } }))} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option key="empty" value="">Select a response</option><option key="not-observed" value="not_observed">Not Observed</option>{[0,1,2,3,4,5].map(score => <option key={score} value={score}>{score}</option>)}</select></label>)}</div>
          <label className="mt-3 block text-xs font-medium text-slate-600">Comments (optional)<textarea maxLength={4000} rows={3} value={draft.comments} onChange={event => setDrafts(current => ({ ...current, [review.id]: { ...(current[review.id] || emptyDraft()), comments: event.target.value } }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></label>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">Reviews are attributed to the reviewer and appear in the recipient’s performance history. Not Observed is not a score.</p><button type="button" disabled={savingId === review.id} onClick={() => void submit(review)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#085587] px-3 text-sm font-medium text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" aria-hidden="true"/>{savingId === review.id ? 'Submitting…' : 'Submit review'}</button></div>
        </article>;
      })}</div>}</div>
    </>}
  </section>;
}

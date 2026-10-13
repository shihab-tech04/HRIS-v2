import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Search, Target } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Goal = {
  id: string;
  title: string;
  description: string;
  category: string;
  target_metric: string;
  current_progress: number;
  due_date: string | null;
  status: string;
  weight: number;
  origin: string;
};
type Appraisal = {
  id: string;
  cycle_id: string;
  employee_id: string;
  reviewer_employee_id: string | null;
  status: string;
  created_at: string;
};
type ReviewCycle = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
};

type GoalFilter = 'all' | 'not_started' | 'in_progress' | 'completed' | 'cancelled';

type ProjectPeerReview = {
  id: string; task_id: string; task_title: string; project_name: string;
  reviewer_name: string; reviewer_task_assignment_id: string;
  reviewer_project_allocation_id: string; reviewee_employee_id: string;
  reviewee_task_assignment_id: string; reviewee_project_allocation_id: string;
  status: string; quality_of_work_score: number | null; quality_of_work_not_observed: boolean;
  collaboration_teamwork_score: number | null; collaboration_teamwork_not_observed: boolean;
  delivery_reliability_score: number | null; delivery_reliability_not_observed: boolean;
  ownership_communication_score: number | null; ownership_communication_not_observed: boolean;
  comments: string;
};

function ProjectPeerReviewHistory({ tenantId, employeeId }: { tenantId: string; employeeId: string }) {
  const [reviews, setReviews] = useState<ProjectPeerReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);
  useEffect(() => {
    const request = ++sequence.current;
    setReviews([]); setLoading(true); setError('');
    if (!employeeId) { setLoading(false); return () => { sequence.current += 1; }; }
    void (async () => {
      try {
        const result = await supabase.rpc('hris_get_my_project_peer_reviews', { p_tenant_id: tenantId });
        if (request !== sequence.current) return;
        if (result.error) throw result.error;
        const rows = (result.data as { reviews?: ProjectPeerReview[] } | null)?.reviews;
        if (!Array.isArray(rows)) throw new Error('Peer-review history returned an invalid response.');
        setReviews(rows.filter(row => row.reviewee_employee_id === employeeId && row.status === 'submitted'));
      } catch (cause) {
        if (request === sequence.current) setError(cause instanceof Error ? cause.message : 'Unable to load peer-review history.');
      } finally { if (request === sequence.current) setLoading(false); }
    })();
    return () => { sequence.current += 1; };
  }, [tenantId, employeeId, revision]);
  const score = (value: number | null, notObserved: boolean) => notObserved ? 'Not Observed' : value === null ? '—' : `${value}/5`;
  return <section aria-labelledby="project-peer-history-heading" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 id="project-peer-history-heading" className="text-lg font-semibold text-[#1E1B39]">Project peer-review history</h3><p className="mt-1 text-sm text-slate-600">Task-linked feedback with the reviewer identified. These records do not alter annual appraisal scores.</p></div><button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">Refresh</button></div>
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}<button type="button" onClick={() => setRevision(value => value + 1)} className="ml-2 min-h-9 font-semibold underline">Retry</button></div>}
    {loading ? <p role="status" className="rounded-lg border border-[#DEE0E3] bg-white p-4 text-sm text-slate-600">Loading task-linked feedback…</p> : reviews.length === 0 ? <p role="status" className="rounded-lg border border-dashed border-[#B9DCE2] bg-white p-4 text-sm text-slate-600">No submitted project peer reviews are linked to your performance history yet.</p> :
      <div className="grid min-w-0 gap-3 xl:grid-cols-2">{reviews.map(review => <article key={review.id} className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm"><p className="text-xs font-medium text-[#615E83]">{review.project_name} · {review.task_title}</p><h4 className="mt-1 font-semibold text-[#1E1B39]">Feedback from {review.reviewer_name}</h4><dl className="mt-3 grid gap-2 sm:grid-cols-2">{[
        ['Quality of Work', score(review.quality_of_work_score, review.quality_of_work_not_observed)],
        ['Collaboration & Teamwork', score(review.collaboration_teamwork_score, review.collaboration_teamwork_not_observed)],
        ['Delivery & Reliability', score(review.delivery_reliability_score, review.delivery_reliability_not_observed)],
        ['Ownership & Communication', score(review.ownership_communication_score, review.ownership_communication_not_observed)],
      ].map(([label, value]) => <div key={label} className="rounded-md bg-slate-50 p-2"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-medium text-slate-800">{value}</dd></div>)}</dl>{review.comments && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700">{review.comments}</p>}</article>)}</div>}
  </section>;
}

function dateLabel(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'No due date';
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function statusLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function GoalCard({
  goal,
  value,
  saving,
  onChange,
  onSave,
}: {
  goal: Goal;
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const progress = Number(goal.current_progress);
  const proposed = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(proposed) && proposed >= 0 && proposed <= 100;
  const changed = valid && Math.abs(proposed - progress) > 0.0001;
  const safeProgress = Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : 0;

  return <article className="rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-[#615E83]">{goal.category} · {goal.origin === 'personal' ? 'Personal goal' : 'Assigned goal'}</p>
        <h3 className="mt-1 break-words text-base font-semibold text-[#1E1B39]">{goal.title}</h3>
      </div>
      <span className="shrink-0 rounded-full bg-[#EFF7F8] px-3 py-1 text-xs font-medium text-[#08558B]">{statusLabel(goal.status)}</span>
    </div>
    {goal.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-600">{goal.description}</p>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="min-w-0 rounded-lg bg-slate-50 p-3">
        <p className="text-xs text-slate-500">Target</p>
        <p className="mt-1 break-words text-sm font-medium text-slate-800">{goal.target_metric || 'No target metric recorded'}</p>
      </div>
      <div className="rounded-lg bg-slate-50 p-3">
        <p className="text-xs text-slate-500">Due date</p>
        <p className="mt-1 text-sm font-medium text-slate-800">{dateLabel(goal.due_date)}</p>
      </div>
    </div>
    <div className="mt-4" aria-label={`${goal.title} progress`}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">Current progress</span>
        <span className="tabular-nums text-slate-600">{safeProgress}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar"
        aria-label={`${goal.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={safeProgress}>
        <div className="h-full rounded-full bg-[#08558B] transition-[width]" style={{ width: `${safeProgress}%` }} />
      </div>
    </div>
    <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-end">
      <label className="block flex-1 text-xs font-medium text-slate-600">
        Update progress (0–100%)
        <input type="number" min="0" max="100" step="0.1" inputMode="decimal" value={value}
          onChange={event => onChange(event.target.value)} aria-label={`Update ${goal.title} progress`}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-2 focus:outline-[#08558B]" />
      </label>
      <button type="button" disabled={!changed || saving} onClick={onSave}
        className="min-h-11 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white hover:bg-[#06466F] disabled:cursor-not-allowed disabled:opacity-50">
        {saving ? 'Saving…' : 'Save progress'}
      </button>
    </div>
  </article>;
}

function AppraisalCard({
  appraisal,
  cycle,
  ownEmployeeId,
}: {
  appraisal: Appraisal;
  cycle?: ReviewCycle;
  ownEmployeeId: string;
}) {
  const assignment = ownEmployeeId && appraisal.reviewer_employee_id === ownEmployeeId
    ? 'Assigned review'
    : ownEmployeeId && appraisal.employee_id === ownEmployeeId
      ? 'Your appraisal'
      : 'Appraisal';
  return <article className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-[#615E83]">{assignment}</p>
        <h4 className="mt-1 break-words font-semibold text-[#1E1B39]">{cycle?.name || 'Review cycle details unavailable'}</h4>
        {cycle && <p className="mt-1 text-sm text-slate-600">{dateLabel(cycle.start_date)} – {dateLabel(cycle.end_date)}</p>}
      </div>
      <span className="shrink-0 rounded-full bg-[#EFF7F8] px-3 py-1 text-xs font-medium text-[#08558B]">{statusLabel(appraisal.status)}</span>
    </div>
    <p className="mt-3 text-sm text-slate-600">
      {assignment === 'Assigned review'
        ? 'This review is assigned to you. Review actions are available only through the approved appraisal workflow.'
        : 'Review status is read only here. Final scores and feedback are not shown in this view.'}
    </p>
  </article>;
}

export function MyPerformance({ tenantId, userId }: { tenantId: string; userId: string }) {
  const tenantRef = useRef(tenantId);
  tenantRef.current = tenantId;
  const [goals, setGoals] = useState<Goal[]>([]);
  const [appraisals, setAppraisals] = useState<Appraisal[]>([]);
  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [ownEmployeeId, setOwnEmployeeId] = useState('');
  const [appraisalLoadError, setAppraisalLoadError] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<GoalFilter>('all');

  async function load(isCurrent: () => boolean = () => true) {
    const requestTenantId = tenantId;
    const current = () => tenantRef.current === requestTenantId && isCurrent();
    setLoading(true);
    setError('');
    setMessage('');
    setAppraisalLoadError(false);
    try {
      const [goalResult, appraisalResult, employeeResult] = await Promise.all([
        supabase.from('performance_goals')
          .select('id,title,description,category,target_metric,current_progress,due_date,status,weight,origin')
          .eq('tenant_id', requestTenantId)
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(100),
        supabase.from('performance_appraisals')
          .select('id,cycle_id,employee_id,reviewer_employee_id,status,created_at')
          .eq('tenant_id', requestTenantId)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('employees')
          .select('id')
          .eq('tenant_id', requestTenantId)
          .eq('user_id', userId)
          .maybeSingle(),
      ]);
      if (goalResult.error) throw goalResult.error;
      if (!current()) return;
      const safeGoals = (Array.isArray(goalResult.data) ? goalResult.data : []) as Goal[];
      setGoals(safeGoals);
      setDrafts(Object.fromEntries(safeGoals.map(goal => [goal.id, String(goal.current_progress)])));
      const safeAppraisals = appraisalResult.error ? []
        : (Array.isArray(appraisalResult.data) ? appraisalResult.data : []) as Appraisal[];
      setAppraisals(safeAppraisals);
      setAppraisalLoadError(Boolean(appraisalResult.error));
      setOwnEmployeeId(employeeResult.error ? '' : employeeResult.data?.id || '');

      const cycleIds = Array.from(new Set(safeAppraisals.map(appraisal => appraisal.cycle_id).filter(Boolean)));
      const cycleResult = cycleIds.length
        ? await supabase.from('performance_cycles')
          .select('id,name,start_date,end_date,status')
          .eq('tenant_id', requestTenantId)
          .in('id', cycleIds)
        : { data: [], error: null };
      if (!current()) return;
      setCycles(cycleResult.error ? [] : (Array.isArray(cycleResult.data) ? cycleResult.data : []) as ReviewCycle[]);
      setAppraisalLoadError(currentError => currentError || Boolean(cycleResult.error));
    } catch (cause) {
      if (!current()) return;
      setGoals([]);
      setDrafts({});
      setAppraisals([]);
      setCycles([]);
      setOwnEmployeeId('');
      setAppraisalLoadError(true);
      setError(cause instanceof Error ? cause.message : 'Unable to load your performance goals.');
    } finally {
      if (current()) setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    setGoals([]);
    setDrafts({});
    setAppraisals([]);
    setCycles([]);
    setOwnEmployeeId('');
    setAppraisalLoadError(false);
    void load(() => active);
    return () => { active = false; };
  }, [tenantId, userId]);

  async function saveProgress(goal: Goal) {
    const saveTenantId = tenantId;
    const value = drafts[goal.id] ?? String(goal.current_progress);
    const progress = Number(value);
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      setError('Enter a progress value from 0 to 100.');
      return;
    }
    setSavingId(goal.id);
    setError('');
    setMessage('');
    try {
      const { data, error: updateError } = await supabase.from('performance_goals')
        .update({ current_progress: progress })
        .eq('tenant_id', saveTenantId)
        .eq('id', goal.id)
        .select('id,current_progress,updated_at')
        .maybeSingle();
      if (updateError) throw updateError;
      if (!data) throw new Error('This goal is no longer available in your organization. Refresh and try again.');
      if (tenantRef.current !== saveTenantId) return;
      const savedProgress = Number(data.current_progress);
      setGoals(current => current.map(item => item.id === goal.id
        ? { ...item, current_progress: savedProgress }
        : item));
      setDrafts(current => ({ ...current, [goal.id]: String(savedProgress) }));
      setMessage(`Progress saved for “${goal.title}”.`);
    } catch (cause) {
      if (tenantRef.current !== saveTenantId) return;
      setError(cause instanceof Error ? cause.message : 'Unable to save progress. Try again.');
    } finally {
      if (tenantRef.current === saveTenantId) setSavingId('');
    }
  }

  const visibleGoals = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return goals.filter(goal => (filter === 'all' || goal.status === filter)
      && (!query || [goal.title, goal.description, goal.category, goal.target_metric]
        .some(value => value.toLocaleLowerCase().includes(query))));
  }, [filter, goals, search]);

  const averageProgress = goals.length
    ? Math.round(goals.reduce((total, goal) => total + Number(goal.current_progress || 0), 0) / goals.length)
    : 0;
  const completedCount = goals.filter(goal => goal.status === 'completed').length;

  return <section aria-labelledby="my-performance-heading" className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 id="my-performance-heading" className="text-2xl font-semibold text-[#1E1B39]">My Performance</h2>
        <p className="mt-1 text-sm text-[#86929E]">Your goals and recorded progress for this organization.</p>
      </div>
      <button type="button" disabled={loading} onClick={() => void load()} aria-label="Refresh performance goals"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#DEE0E3] bg-white px-3 text-sm font-medium text-[#1E1B39] disabled:opacity-50">
        <RefreshCw className="h-4 w-4" /> Refresh
      </button>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-[#DEE0E3] bg-white p-4"><p className="text-sm text-slate-600">Goals in view</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#1E1B39]">{goals.length}</p></div>
      <div className="rounded-xl border border-[#DEE0E3] bg-white p-4"><p className="text-sm text-slate-600">Average recorded progress</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#1E1B39]">{goals.length ? `${averageProgress}%` : '—'}</p></div>
      <div className="rounded-xl border border-[#DEE0E3] bg-white p-4"><p className="text-sm text-slate-600">Completed goals</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#1E1B39]">{completedCount}</p></div>
    </div>

    <section aria-labelledby="my-appraisals-heading" className="space-y-3">
      <div>
        <h3 id="my-appraisals-heading" className="text-lg font-semibold text-[#1E1B39]">Appraisals</h3>
        <p className="mt-1 text-sm text-slate-600">Your review status and any appraisal reviews assigned to you.</p>
      </div>
      {appraisalLoadError
        ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Appraisal status is temporarily unavailable. Your goal progress remains available.
          <button type="button" onClick={() => void load()} className="ml-2 min-h-10 font-semibold underline">Retry</button>
        </div>
        : loading
          ? <p role="status" className="rounded-xl border border-[#DEE0E3] bg-white p-5 text-sm text-slate-600">Loading appraisal status…</p>
          : appraisals.length === 0
          ? <p role="status" className="rounded-xl border border-dashed border-[#B9DCE2] bg-white p-5 text-sm text-slate-600">No appraisals are available for your employee record yet.</p>
          : <div className="grid min-w-0 gap-3 xl:grid-cols-2">
            {appraisals.map(appraisal => <AppraisalCard key={appraisal.id} appraisal={appraisal}
              cycle={cycles.find(cycle => cycle.id === appraisal.cycle_id)} ownEmployeeId={ownEmployeeId} />)}
          </div>}
    </section>

    <ProjectPeerReviewHistory tenantId={tenantId} employeeId={ownEmployeeId} />

    <section aria-label="Performance goal filters" className="grid gap-3 rounded-xl border border-[#DEE0E3] bg-white p-4 sm:grid-cols-[minmax(0,1fr)_220px]">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86929E]" />
        <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search goals"
          aria-label="Search performance goals" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-2 focus:outline-[#08558B]" />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Status
        <select value={filter} onChange={event => setFilter(event.target.value as GoalFilter)} aria-label="Filter performance goals by status"
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-2 focus:outline-[#08558B]">
          <option value="all">All statuses</option>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>
    </section>

    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <p>{error}</p><button type="button" onClick={() => void load()} className="mt-3 min-h-10 rounded-md border border-rose-400 px-3 font-medium">Retry</button>
    </div>}
    {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
    {loading && <p role="status" className="rounded-lg border border-[#DEE0E3] bg-white p-5 text-sm text-slate-600">Loading your goals…</p>}
    {!loading && !error && goals.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <Target className="mx-auto h-8 w-8 text-[#08558B]" /><h3 className="mt-3 font-semibold text-slate-900">No performance goals yet</h3>
      <p className="mt-1 text-sm text-slate-600">Goals assigned to you will appear here when they are available.</p>
    </div>}
    {!loading && !error && goals.length > 0 && (visibleGoals.length
      ? <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          {visibleGoals.map(goal => <GoalCard key={goal.id} goal={goal}
            value={drafts[goal.id] ?? String(goal.current_progress)} saving={savingId === goal.id}
            onChange={value => setDrafts(current => ({ ...current, [goal.id]: value }))}
            onSave={() => void saveProgress(goal)} />)}
        </div>
      : <p role="status" className="rounded-lg border border-[#DEE0E3] bg-white p-5 text-sm text-slate-600">No goals match the current search and status filters.</p>)}

    <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
      Saving changes only your goal’s recorded progress. Appraisal status is read only here; scoring and final feedback require the approved review workflow.
    </p>
  </section>;
}

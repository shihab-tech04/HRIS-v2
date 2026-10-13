import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CalendarClock, CheckCircle2, Clock3, GraduationCap, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';

type LearningSession = {
  id: string;
  trainer_name: string | null;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  meeting_url: string | null;
  capacity: number | null;
  enrollment_deadline: string | null;
  enrolled_count: number;
  available_seats: number | null;
};
type LearningProgram = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  provider: string | null;
  delivery_mode: string;
  duration_hours: number | null;
  self_enrollment: boolean;
  target_skills: string[];
  sessions: LearningSession[];
};
type Enrollment = {
  id: string;
  program_id: string;
  program_title: string;
  session_id: string | null;
  session_start_at: string | null;
  session_location: string | null;
  source: string;
  status: string;
  mandatory: boolean;
  due_date: string | null;
  recommendation_reason: string | null;
  skill_gap: string | null;
  requested_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  completed_at: string | null;
  certificate_url: string | null;
  created_at: string;
};
type LearningSkill = { skill_name: string; proficiency: string | null; verified: boolean };
type LearningContext = {
  tenant_id: string;
  employee_id: string | null;
  programs: LearningProgram[];
  enrollments: Enrollment[];
  skills: LearningSkill[];
};

function dateTime(value: string | null): string {
  if (!value) return 'Time to be confirmed';
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? 'Time to be confirmed' : parsed.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function statusName(status: string): string {
  return status.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function isOpen(enrollment: Enrollment): boolean {
  return enrollment.status === 'requested' || enrollment.status === 'enrolled';
}

export function MyLearning({ tenantId }: { tenantId: string }) {
  const [programs, setPrograms] = useState<LearningProgram[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [skills, setSkills] = useState<LearningSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sessionSelection, setSessionSelection] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Enrollment | null>(null);
  const [revision, setRevision] = useState(0);
  const requestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  activeTenantId.current = tenantId;

  async function load(isCurrent: () => boolean = () => true) {
    const requestId = ++requestSequence.current;
    const requestedTenant = tenantId;
    const current = () => requestId === requestSequence.current
      && activeTenantId.current === requestedTenant && isCurrent();
    setLoading(true);
    setError('');
    setActionError('');
    setMessage('');
    try {
      const result = await supabase.rpc('hris_get_my_learning_context', { p_tenant_id: requestedTenant });
      if (!current()) return;
      if (result.error) throw result.error;
      const data = result.data as LearningContext | null;
      if (!data || data.tenant_id !== requestedTenant || !Array.isArray(data.programs)
          || !Array.isArray(data.enrollments) || !Array.isArray(data.skills)) {
        throw new Error('Learning data returned an invalid response.');
      }
      setPrograms(data.programs);
      setEnrollments(data.enrollments);
      setSkills(data.skills);
      setSessionSelection(currentSelection => {
        const next = { ...currentSelection };
        for (const program of data.programs) {
          if (!program.sessions.some(session => session.id === next[program.id])) {
            next[program.id] = '';
          }
        }
        return next;
      });
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : 'Unable to load your learning workspace.');
    } finally {
      if (current()) setLoading(false);
    }
  }

  useEffect(() => {
    setPrograms([]);
    setEnrollments([]);
    setSkills([]);
    setSearch('');
    setCategory('all');
    setSessionSelection({});
    setReasons({});
    setCancelTarget(null);
    void load();
    return () => { requestSequence.current += 1; };
    // The revision is the explicit refresh/action recovery trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, revision]);

  const categories = useMemo(() => [...new Set(programs.map(program => program.category).filter((value): value is string => Boolean(value)))].sort(), [programs]);
  const visiblePrograms = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return programs.filter(program => (category === 'all' || program.category === category)
      && (!query || [program.title, program.description || '', program.category || '', program.provider || '', ...program.target_skills]
        .some(value => value.toLocaleLowerCase().includes(query))));
  }, [programs, search, category]);
  const pendingCount = enrollments.filter(enrollment => enrollment.status === 'requested').length;
  const activeCount = enrollments.filter(enrollment => enrollment.status === 'enrolled').length;

  async function performAction(key: string, action: () => PromiseLike<{ error: { message: string; code?: string } | null }>, success: string) {
    setSavingKey(key);
    setActionError('');
    setMessage('');
    try {
      const result = await action();
      if (result.error) throw result.error;
      setMessage(success);
      setRevision(value => value + 1);
    } catch (cause) {
      const code = (cause as { code?: string })?.code;
      const causeMessage = cause instanceof Error ? cause.message : 'The learning action could not be saved.';
      setActionError(code === '23505'
        ? 'You already have an open enrollment or request for this program and session.'
        : causeMessage);
    } finally {
      setSavingKey('');
      setCancelTarget(null);
    }
  }

  function selectedSession(program: LearningProgram): string | null {
    return sessionSelection[program.id] || null;
  }

  function existingOpen(program: LearningProgram): Enrollment | undefined {
    const sessionId = selectedSession(program);
    return enrollments.find(enrollment => enrollment.program_id === program.id
      && enrollment.session_id === sessionId && isOpen(enrollment));
  }

  return <section aria-labelledby="my-learning-heading" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><h2 id="my-learning-heading" className="text-2xl font-medium text-[#49454F]">My Learning</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">Explore active learning programs, manage your requests, and keep track of your enrollment history.</p></div>
      <button type="button" aria-label="Refresh learning" onClick={() => setRevision(value => value + 1)} disabled={loading}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />Refresh</button>
    </div>

    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p role="alert">{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">Retry</button></div>}
    {actionError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{actionError}</div>}
    {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}

    <div className="grid gap-3 sm:grid-cols-3">
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">Available programs</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{programs.length}</p></article>
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">Current enrollments</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{activeCount}</p></article>
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">Approval requests pending</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{pendingCount}</p></article>
    </div>

    {skills.length > 0 && <section aria-labelledby="my-learning-skills" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-[#08558B]" aria-hidden="true" /><h3 id="my-learning-skills" className="font-semibold text-[#1E1B39]">Your recorded skills</h3></div>
      <ul className="mt-3 flex flex-wrap gap-2">{skills.map((skill, index) => <li key={`${skill.skill_name}-${index}`} className="inline-flex items-center gap-1.5 rounded-full bg-[#EFF7F8] px-3 py-1.5 text-xs text-[#16445A]">{skill.skill_name}{skill.proficiency ? ` · ${skill.proficiency}` : ''}{skill.verified && <CheckCircle2 className="h-3.5 w-3.5" aria-label="Verified" />}</li>)}</ul>
    </section>}

    <section aria-labelledby="learning-catalog-heading" className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="min-w-[220px] flex-1"><label htmlFor="my-learning-search" className="mb-1 block text-xs font-medium text-slate-600">Search learning programs</label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" aria-hidden="true" /><input id="my-learning-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Title, provider, category, or skill" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-[#085587]" /></div></div>
        <div className="w-full sm:w-56"><label htmlFor="my-learning-category" className="mb-1 block text-xs font-medium text-slate-600">Category</label><select id="my-learning-category" value={category} onChange={event => setCategory(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="all">All categories</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
        <p className="text-xs text-slate-500" aria-live="polite">{visiblePrograms.length} shown</p>
      </div>
      <h3 id="learning-catalog-heading" className="sr-only">Learning program catalog</h3>
      {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading your learning programs…</p>
        : visiblePrograms.length === 0 ? <p role="status" className="rounded-xl border border-dashed border-[#B9DCE2] bg-white p-5 text-sm text-slate-600">{programs.length ? 'No learning programs match your search.' : 'There are no active learning programs in this organization yet.'}</p>
          : <div className="grid min-w-0 gap-3 xl:grid-cols-2">{visiblePrograms.map(program => {
            const sessionId = selectedSession(program);
            const currentOpen = existingOpen(program);
            const selected = program.sessions.find(session => session.id === sessionId);
            const full = selected?.available_seats !== null && selected?.available_seats !== undefined && selected.available_seats <= 0;
            const key = `${program.id}:${sessionId || 'none'}`;
            return <article key={program.id} data-learning-program={program.id} className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-[#615E83]">{program.category || 'Learning program'}{program.provider ? ` · ${program.provider}` : ''}</p><h4 className="mt-1 break-words text-lg font-semibold text-[#1E1B39]">{program.title}</h4></div><span className="shrink-0 rounded-full bg-[#EFF7F8] px-3 py-1 text-xs font-medium text-[#08558B]">{program.delivery_mode.replaceAll('_', ' ')}</span></div>
              {program.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-600">{program.description}</p>}
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Duration</dt><dd className="mt-1 font-medium text-slate-800">{program.duration_hours === null ? 'Not specified' : `${program.duration_hours} hours`}</dd></div><div><dt className="text-xs text-slate-500">Scheduled sessions</dt><dd className="mt-1 font-medium text-slate-800">{program.sessions.length}</dd></div></dl>
              {program.target_skills.length > 0 && <div className="mt-3"><p className="text-xs font-medium text-slate-500">Target skills</p><p className="mt-1 break-words text-sm text-slate-700">{program.target_skills.join(' · ')}</p></div>}
              {program.sessions.length > 0 && <label className="mt-4 block text-xs font-medium text-slate-600">Choose a scheduled session<select aria-label={`Choose session for ${program.title}`} value={sessionId || ''} onChange={event => setSessionSelection(current => ({ ...current, [program.id]: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"><option value="">No session selected</option>{program.sessions.map(session => <option key={session.id} value={session.id}>{dateTime(session.start_at)} · {session.location || 'Location to be confirmed'}{session.available_seats !== null ? ` · ${session.available_seats} seats left` : ''}</option>)}</select></label>}
              {selected && <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[#08558B]" aria-hidden="true" /><span>{dateTime(selected.start_at)}{selected.end_at ? ` – ${dateTime(selected.end_at)}` : ''}{selected.trainer_name ? ` · Trainer: ${selected.trainer_name}` : ''}{selected.location ? ` · ${selected.location}` : ''}</span></div>}
              <div className="mt-4 border-t border-slate-100 pt-4">{currentOpen ? <p className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-slate-700"><Clock3 className="h-4 w-4 text-[#08558B]" aria-hidden="true" />{currentOpen.status === 'requested' ? 'Approval request pending' : 'You are enrolled'}{selected ? ` · ${dateTime(selected.start_at)}` : ''}</p>
                : <div className="flex flex-col gap-2 sm:flex-row sm:items-end">{!program.self_enrollment && <label className="block min-w-0 flex-1 text-xs font-medium text-slate-600">Reason for request <span className="font-normal">(optional)</span><textarea aria-label={`Reason for ${program.title}`} value={reasons[program.id] || ''} maxLength={1000} rows={2} onChange={event => setReasons(current => ({ ...current, [program.id]: event.target.value }))} className="mt-1 min-h-20 w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-sm" placeholder="Share what you hope to learn." /></label>}
                  <button type="button" disabled={Boolean(savingKey) || Boolean(full)} onClick={() => void performAction(key, () => program.self_enrollment
                    ? supabase.rpc('hris_employee_enroll_learning', { p_tenant_id: tenantId, p_program_id: program.id, p_session_id: sessionId })
                    : supabase.rpc('hris_employee_request_learning', { p_tenant_id: tenantId, p_program_id: program.id, p_session_id: sessionId, p_reason: reasons[program.id]?.trim() || null }), program.self_enrollment ? 'Enrollment saved.' : 'Your approval request was submitted.')}
                    className="min-h-11 shrink-0 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white hover:bg-[#06466F] disabled:cursor-not-allowed disabled:opacity-50">{savingKey === key ? 'Saving…' : full ? 'Session full' : program.self_enrollment ? 'Enroll now' : 'Request approval'}</button></div>}
              </div>
            </article>;
          })}</div>}
    </section>

    <section aria-labelledby="learning-history-heading" className="space-y-3">
      <div className="flex items-end justify-between gap-3"><div><h3 id="learning-history-heading" className="text-lg font-semibold text-[#1E1B39]">My enrollment history</h3><p className="mt-1 text-sm text-slate-600">Requests, current enrollments, completed learning, and cancellations.</p></div><BookOpen className="h-5 w-5 text-[#08558B]" aria-hidden="true" /></div>
      {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading enrollment history…</p>
        : enrollments.length === 0 ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Your learning activity will appear here after you enroll or request a program.</p>
          : <div className="grid min-w-0 gap-3 lg:grid-cols-2">{enrollments.map(enrollment => <article key={enrollment.id} data-learning-enrollment={enrollment.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-slate-500">{enrollment.mandatory ? 'Assigned learning' : statusName(enrollment.source)}</p><h4 className="mt-1 break-words font-semibold text-slate-900">{enrollment.program_title}</h4></div><span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{statusName(enrollment.status)}</span></div>
              {enrollment.session_start_at && <p className="mt-2 text-sm text-slate-600">{dateTime(enrollment.session_start_at)}{enrollment.session_location ? ` · ${enrollment.session_location}` : ''}</p>}
              {enrollment.due_date && <p className="mt-2 text-sm text-slate-600">Due {new Date(`${enrollment.due_date}T12:00:00`).toLocaleDateString()}</p>}
              {enrollment.recommendation_reason && <p className="mt-2 break-words text-sm text-slate-600">Request note: {enrollment.recommendation_reason}</p>}
              {enrollment.resolution_note && <p className="mt-2 break-words text-sm text-slate-600">Update: {enrollment.resolution_note}</p>}
              {enrollment.certificate_url && <a href={enrollment.certificate_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-[#08558B] underline">View certificate</a>}
              {isOpen(enrollment) && enrollment.mandatory && <p className="mt-3 text-xs text-slate-500">This enrollment was assigned and cannot be cancelled here.</p>}
              {isOpen(enrollment) && !enrollment.mandatory && <button type="button" disabled={Boolean(savingKey)} onClick={() => setCancelTarget(enrollment)} className="mt-3 min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 disabled:opacity-50">Cancel enrollment</button>}
            </article>)}</div>}
    </section>

    {cancelTarget && <div role="alertdialog" aria-modal="true" aria-labelledby="cancel-learning-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setCancelTarget(null); }}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"><h3 id="cancel-learning-title" className="text-lg font-semibold text-slate-900">Cancel this learning activity?</h3><p className="mt-2 break-words text-sm text-slate-600">{cancelTarget.program_title} will be marked cancelled. You may submit another request or enrollment later if the program remains available.</p><div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" disabled={Boolean(savingKey)} onClick={() => setCancelTarget(null)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium">Keep it</button><button type="button" disabled={Boolean(savingKey)} onClick={() => void performAction(`cancel:${cancelTarget.id}`, () => supabase.rpc('hris_employee_cancel_learning', { p_tenant_id: tenantId, p_id: cancelTarget.id }), 'Learning activity cancelled.')} className="min-h-11 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50">{savingKey === `cancel:${cancelTarget.id}` ? 'Cancelling…' : 'Confirm cancellation'}</button></div></div>
    </div>}
  </section>;
}

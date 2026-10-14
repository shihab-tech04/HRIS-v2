import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { BookOpenCheck, CalendarClock, Check, Pencil, Plus, RefreshCw, UsersRound, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Locale } from './project-locale';
import { learningText } from './learning-locale';

type ProgramSession = {
  id: string;
  trainer_name: string | null;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  meeting_url: string | null;
  capacity: number | null;
  enrollment_deadline: string | null;
  status: string;
  enrolled_count: number;
};
type Program = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  provider: string | null;
  delivery_mode: string;
  duration_hours: number | null;
  self_enrollment: boolean;
  target_skills: string[];
  active: boolean;
  enrollment_count: number;
  sessions: ProgramSession[];
};
type RosterLearner = {
  enrollment_id: string;
  employee_number: string;
  employee_name: string;
  enrolled_at: string;
  mandatory: boolean;
  due_date: string | null;
};
type SessionRoster = {
  session: { id: string; program_title: string; status: string };
  learners: RosterLearner[];
};
type ProgramDraft = {
  title: string;
  description: string;
  category: string;
  provider: string;
  deliveryMode: string;
  durationHours: string;
  selfEnrollment: boolean;
  targetSkills: string;
  active: boolean;
};
type SessionDraft = {
  programId: string;
  sessionId: string | null;
  trainerName: string;
  startAt: string;
  endAt: string;
  location: string;
  meetingUrl: string;
  capacity: string;
  enrollmentDeadline: string;
};

const emptyProgram = (): ProgramDraft => ({
  title: '', description: '', category: '', provider: '', deliveryMode: 'in_person',
  durationHours: '', selfEnrollment: false, targetSkills: '', active: true,
});
const emptySession = (programId: string): SessionDraft => ({
  programId, sessionId: null, trainerName: '', startAt: '', endAt: '',
  location: '', meetingUrl: '', capacity: '', enrollmentDeadline: '',
});

function localDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  const local = new Date(date.valueOf() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function asIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function displayDate(value: string | null, locale: Locale, tx: (english: string) => string): string {
  if (!value) return tx('Time to be confirmed');
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? tx('Time to be confirmed') : date.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function errorText(cause: unknown, tx: (english: string) => string): string {
  return cause instanceof Error ? tx(cause.message) : tx('Unable to save learning changes.');
}

export function LearningProgramAdmin({ tenantId, locale }: { tenantId: string; locale: Locale }) {
  const tx = (english: string, values: Record<string, string | number> = {}) => learningText(locale, english, values);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programDraft, setProgramDraft] = useState<ProgramDraft>(emptyProgram);
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [sessionDraft, setSessionDraft] = useState<SessionDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [rosterSelection, setRosterSelection] = useState<{ tenantId: string; session: ProgramSession } | null>(null);
  const [roster, setRoster] = useState<SessionRoster | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState('');
  const [rosterRevision, setRosterRevision] = useState(0);
  const requestSequence = useRef(0);
  const rosterRequestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  const previousTenantId = useRef(tenantId);
  activeTenantId.current = tenantId;

  async function load(isCurrent: () => boolean = () => true) {
    const requestId = ++requestSequence.current;
    const requestedTenant = tenantId;
    const current = () => requestId === requestSequence.current
      && activeTenantId.current === requestedTenant && isCurrent();
    setLoading(true);
    setError('');
    try {
      const result = await supabase.rpc('hris_get_learning_admin_catalog', { p_tenant_id: requestedTenant });
      if (!current()) return;
      if (result.error) throw result.error;
      if (!Array.isArray(result.data) || result.data.some(row => !row || typeof row.id !== 'string'
          || typeof row.title !== 'string' || !Array.isArray(row.sessions))) {
        throw new Error('Learning program data returned an invalid response.');
      }
      setPrograms(result.data as Program[]);
    } catch (cause) {
      if (current()) setError(errorText(cause, tx));
    } finally {
      if (current()) setLoading(false);
    }
  }

  useEffect(() => {
    if (previousTenantId.current !== tenantId) {
      setProgramDraft(emptyProgram());
      setEditingProgramId(null);
      setSessionDraft(null);
      setMessage('');
      setRosterSelection(null);
      setRoster(null);
      setRosterError('');
    }
    previousTenantId.current = tenantId;
    setPrograms([]);
    void load();
    return () => { requestSequence.current += 1; };
    // Revision is the explicit save recovery and refresh trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, revision]);

  useEffect(() => {
    const selection = rosterSelection;
    if (!selection || selection.tenantId !== tenantId) return;
    const requestId = ++rosterRequestSequence.current;
    const requestedTenant = selection.tenantId;
    const current = () => requestId === rosterRequestSequence.current
      && activeTenantId.current === requestedTenant;
    setRosterLoading(true);
    setRosterError('');
    void (async () => {
      try {
        const result = await supabase.rpc('hris_get_learning_session_roster', {
          p_tenant_id: requestedTenant,
          p_session_id: selection.session.id,
        });
        if (!current()) return;
        if (result.error) throw result.error;
        const data = result.data as SessionRoster | null;
        if (!data || data.session?.id !== selection.session.id || !Array.isArray(data.learners)
            || data.learners.some(learner => !learner || typeof learner.enrollment_id !== 'string'
              || typeof learner.employee_name !== 'string' || typeof learner.employee_number !== 'string')) {
          throw new Error('The session roster returned an invalid response.');
        }
        setRoster(data);
      } catch (cause) {
        if (current()) setRosterError(cause instanceof Error ? tx(cause.message) : tx('Unable to load enrolled employees.'));
      } finally {
        if (current()) setRosterLoading(false);
      }
    })();
    return () => {
      if (requestId === rosterRequestSequence.current) rosterRequestSequence.current += 1;
    };
  }, [tenantId, rosterSelection, rosterRevision]);

  function toggleRoster(session: ProgramSession) {
    setRosterError('');
    setRoster(null);
    setRosterSelection(current => current?.tenantId === tenantId && current.session.id === session.id
      ? null : { tenantId, session });
  }

  function editProgram(program: Program) {
    setMessage('');
    setError('');
    setEditingProgramId(program.id);
    setProgramDraft({
      title: program.title, description: program.description || '', category: program.category || '',
      provider: program.provider || '', deliveryMode: program.delivery_mode,
      durationHours: program.duration_hours === null ? '' : String(program.duration_hours),
      selfEnrollment: program.self_enrollment, targetSkills: program.target_skills.join(', '), active: program.active,
    });
    setSessionDraft(null);
    document.getElementById('learning-program-title')?.focus();
  }

  async function saveProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const skills = programDraft.targetSkills.split(/[\n,]/).map(value => value.trim()).filter(Boolean);
      const result = await supabase.rpc('hris_save_learning_program', {
        p_tenant_id: tenantId,
        p_program_id: editingProgramId,
        p_title: programDraft.title,
        p_description: programDraft.description,
        p_category: programDraft.category,
        p_provider: programDraft.provider,
        p_delivery_mode: programDraft.deliveryMode,
        p_duration_hours: programDraft.durationHours ? Number(programDraft.durationHours) : null,
        p_self_enrollment: programDraft.selfEnrollment,
        p_target_skills: skills,
        p_active: programDraft.active,
      });
      if (result.error) throw result.error;
      setMessage(tx(editingProgramId ? 'Learning program updated.' : 'Learning program created.'));
      setProgramDraft(emptyProgram());
      setEditingProgramId(null);
      setRevision(value => value + 1);
    } catch (cause) {
      setError(errorText(cause, tx));
    } finally {
      setSaving(false);
    }
  }

  function editSession(program: Program, session?: ProgramSession) {
    setMessage('');
    setError('');
    setProgramDraft(emptyProgram());
    setEditingProgramId(null);
    if (!session) {
      setSessionDraft(emptySession(program.id));
    } else {
      setSessionDraft({
        programId: program.id, sessionId: session.id, trainerName: session.trainer_name || '',
        startAt: localDateTime(session.start_at), endAt: localDateTime(session.end_at),
        location: session.location || '', meetingUrl: session.meeting_url || '',
        capacity: session.capacity === null ? '' : String(session.capacity),
        enrollmentDeadline: localDateTime(session.enrollment_deadline),
      });
    }
  }

  async function saveSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionDraft || saving) return;
    const startAt = asIso(sessionDraft.startAt);
    const endAt = asIso(sessionDraft.endAt);
    const enrollmentDeadline = asIso(sessionDraft.enrollmentDeadline);
    if ((sessionDraft.startAt && !startAt) || (sessionDraft.endAt && !endAt)
        || (sessionDraft.enrollmentDeadline && !enrollmentDeadline)) {
      setError(tx('Enter valid session dates and times.'));
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await supabase.rpc('hris_save_learning_session', {
        p_tenant_id: tenantId,
        p_program_id: sessionDraft.programId,
        p_session_id: sessionDraft.sessionId,
        p_trainer_name: sessionDraft.trainerName,
        p_start_at: startAt,
        p_end_at: endAt,
        p_location: sessionDraft.location,
        p_meeting_url: sessionDraft.meetingUrl,
        p_capacity: sessionDraft.capacity ? Number(sessionDraft.capacity) : null,
        p_enrollment_deadline: enrollmentDeadline,
      });
      if (result.error) throw result.error;
      setMessage(tx(sessionDraft.sessionId ? 'Learning session updated.' : 'Learning session scheduled.'));
      setSessionDraft(null);
      setRevision(value => value + 1);
    } catch (cause) {
      setError(errorText(cause, tx));
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
  const labelClass = 'block min-w-0 text-xs font-medium text-slate-600';

  return <section aria-labelledby="learning-programs-heading" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><h2 id="learning-programs-heading" className="text-2xl font-medium text-[#49454F]">{tx("Learning programs")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{tx("Create programs and schedule sessions for employees in this organization.")}</p></div>
      <button type="button" aria-label={tx("Refresh learning programs")} onClick={() => { setMessage(''); setRevision(value => value + 1); }} disabled={loading || saving}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true"/>{tx("Refresh")}</button>
    </div>

    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p role="alert">{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">{tx("Retry")}</button></div>}
    {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}

    <form onSubmit={saveProgram} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2"><BookOpenCheck className="h-5 w-5 text-[#08558B]" aria-hidden="true"/><h3 className="font-semibold text-[#1E1B39]">{tx(editingProgramId ? 'Edit learning program' : 'Create a learning program')}</h3></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>{tx("Program title *")}<input id="learning-program-title" required maxLength={160} value={programDraft.title} onChange={event => setProgramDraft(value => ({ ...value, title: event.target.value }))} className={fieldClass}/></label>
        <label className={labelClass}>{tx("Category")}<input maxLength={120} value={programDraft.category} onChange={event => setProgramDraft(value => ({ ...value, category: event.target.value }))} className={fieldClass}/></label>
        <label className={labelClass}>{tx("Provider")}<input maxLength={160} value={programDraft.provider} onChange={event => setProgramDraft(value => ({ ...value, provider: event.target.value }))} className={fieldClass}/></label>
        <label className={labelClass}>{tx("Delivery mode")}<select aria-label={tx("Delivery mode")} value={programDraft.deliveryMode} onChange={event => setProgramDraft(value => ({ ...value, deliveryMode: event.target.value }))} className={fieldClass}><option value="in_person">{tx("In person")}</option><option value="online">{tx("Online")}</option><option value="hybrid">{tx("Hybrid")}</option></select></label>
        <label className={labelClass}>{tx("Duration in hours")}<input type="number" min="0.25" max="10000" step="0.25" value={programDraft.durationHours} onChange={event => setProgramDraft(value => ({ ...value, durationHours: event.target.value }))} className={fieldClass}/></label>
        <label className={labelClass}>{tx('Target skills')} <span className="font-normal">({tx('comma-separated')})</span><input maxLength={2000} value={programDraft.targetSkills} onChange={event => setProgramDraft(value => ({ ...value, targetSkills: event.target.value }))} className={fieldClass}/></label>
        <label className={`${labelClass} sm:col-span-2`}>{tx("Description")}<textarea rows={3} maxLength={4000} value={programDraft.description} onChange={event => setProgramDraft(value => ({ ...value, description: event.target.value }))} className={`${fieldClass} resize-y`}/></label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={programDraft.selfEnrollment} onChange={event => setProgramDraft(value => ({ ...value, selfEnrollment: event.target.checked }))} className="h-4 w-4 accent-[#08558B]"/>{tx("Employees may enroll directly")}</label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={programDraft.active} onChange={event => setProgramDraft(value => ({ ...value, active: event.target.checked }))} className="h-4 w-4 accent-[#08558B]"/>{tx("Show this program in the employee catalog")}</label>
      </div>
      <p className="mt-2 text-xs text-slate-500">{tx("If direct enrollment is off, employees submit a request for manager review. Inactive programs stay in the manager list but are hidden from the employee catalog.")}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">{editingProgramId && <button type="button" disabled={saving} onClick={() => { setEditingProgramId(null); setProgramDraft(emptyProgram()); setError(''); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm"><X className="h-4 w-4" aria-hidden="true"/>{tx("Cancel edit")}</button>}<button type="submit" disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50"><Check className="h-4 w-4" aria-hidden="true"/>{saving ? tx('Saving…') : editingProgramId ? tx('Save program') : tx('Create program')}</button></div>
    </form>

    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{tx("Loading programs and sessions…")}</p>
      : programs.length === 0 ? <p role="status" className="rounded-xl border border-dashed border-[#B9DCE2] bg-white p-6 text-center text-sm text-slate-600">{tx("No learning programs have been created for this organization.")}</p>
        : <div className="grid min-w-0 gap-3 xl:grid-cols-2">{programs.map(program => <article key={program.id} data-admin-learning-program={program.id} className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-[#615E83]">{program.category || tx('Learning program')}{program.provider ? ` · ${program.provider}` : ''}</p><h3 className="mt-1 break-words text-lg font-semibold text-[#1E1B39]">{program.title}</h3></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${program.active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{tx(program.active ? 'Active' : 'Inactive')}</span></div>
          <p className="mt-2 text-sm text-slate-600">{tx(program.self_enrollment ? 'Direct enrollment' : 'Manager approval required')} · {program.enrollment_count} {tx('open enrollments')}</p>
          {program.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{program.description}</p>}
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => editProgram(program)} aria-label={tx('Edit program {program}', { program: program.title })} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium"><Pencil className="h-4 w-4" aria-hidden="true"/>{tx("Edit program")}</button><button type="button" disabled={saving || !program.active} onClick={() => editSession(program)} aria-label={tx('Schedule session for {program}', { program: program.title })} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#08558B] px-3 text-sm font-medium text-white disabled:opacity-50"><Plus className="h-4 w-4" aria-hidden="true"/>{tx("Schedule session")}</button></div>
          {program.sessions.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{tx("No sessions scheduled.")}</p> : <ul className="mt-4 divide-y divide-slate-100">{program.sessions.map(session => {
            const rosterOpen = rosterSelection?.tenantId === tenantId && rosterSelection.session.id === session.id;
            const rosterId = `learning-roster-${session.id}`;
            return <li key={session.id} className="py-3 first:pt-0 last:pb-0"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="flex items-center gap-2 text-sm font-medium text-slate-800"><CalendarClock className="h-4 w-4 shrink-0 text-[#08558B]" aria-hidden="true"/>{displayDate(session.start_at, locale, tx)}{session.end_at ? ` – ${displayDate(session.end_at, locale, tx)}` : ''}</p><p className="mt-1 break-words text-xs text-slate-600">{session.location || tx('Location to be confirmed')} · {session.enrolled_count}{session.capacity === null ? '' : `/${session.capacity}`} {tx('enrolled')} · {tx(session.status === 'scheduled' ? 'Scheduled' : session.status)}</p></div>{session.status === 'scheduled' && <div className="flex flex-wrap gap-2"><button type="button" aria-expanded={rosterOpen} aria-controls={rosterId} onClick={() => toggleRoster(session)} aria-label={tx(rosterOpen ? 'Hide enrolled employees for {program}' : 'View enrolled employees for {program}', { program: program.title })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-2 text-xs font-medium"><UsersRound className="h-3.5 w-3.5" aria-hidden="true"/>{tx(rosterOpen ? 'Hide roster' : 'View roster')}</button><button type="button" disabled={saving} onClick={() => editSession(program, session)} aria-label={tx('Edit session {date} for {program}', { date: displayDate(session.start_at, locale, tx), program: program.title })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-2 text-xs font-medium"><Pencil className="h-3.5 w-3.5" aria-hidden="true"/>{tx("Edit")}</button></div>}</div>
              {rosterOpen && <section id={rosterId} data-learning-session-roster={session.id} aria-label={tx('Enrolled employees for {program}', { program: program.title })} className="mt-3 min-w-0 rounded-lg border border-[#B9DCE2] bg-[#F8FCFC] p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-semibold text-slate-900">{tx("Enrolled employees")}</h4><p className="text-xs text-slate-600">{tx('{count} currently enrolled', { count: roster?.session.id === session.id ? roster.learners.length : session.enrolled_count })}</p></div><button type="button" aria-label={tx("Refresh enrolled employees")} disabled={rosterLoading} onClick={() => setRosterRevision(value => value + 1)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 text-xs font-medium disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true"/>{tx("Refresh roster")}</button></div>
                {rosterLoading && <p role="status" className="mt-3 text-sm text-slate-600">{tx("Loading enrolled employees…")}</p>}
                {rosterError && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><p role="alert">{rosterError}</p><button type="button" onClick={() => setRosterRevision(value => value + 1)} className="min-h-9 rounded-lg border border-rose-300 bg-white px-3 text-xs font-medium">{tx("Retry roster")}</button></div>}
                {!rosterLoading && !rosterError && roster?.session.id === session.id && roster.learners.length === 0 && <p role="status" className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-600">{tx("No employees are currently enrolled in this session.")}</p>}
                {!rosterLoading && !rosterError && roster?.session.id === session.id && roster.learners.length > 0 && <ul className="mt-3 divide-y divide-slate-200 rounded-lg bg-white px-3">{roster.learners.map(learner => <li key={learner.enrollment_id} className="flex flex-wrap items-start justify-between gap-2 py-3"><div className="min-w-0"><p className="break-words text-sm font-medium text-slate-900">{learner.employee_name}</p><p className="text-xs text-slate-600">{learner.employee_number} · {tx('Enrolled {date}', { date: displayDate(learner.enrolled_at, locale, tx) })}</p></div>{learner.mandatory && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">{tx("Mandatory")}</span>}</li>)}</ul>}
              </section>}
            </li>;
          })}</ul>}
          {sessionDraft?.programId === program.id && <form onSubmit={saveSession} className="mt-4 space-y-3 rounded-lg border border-[#B9DCE2] bg-[#F8FCFC] p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2"><h4 className="font-semibold text-slate-900">{sessionDraft.sessionId ? tx('Edit scheduled session') : tx('Schedule a session for {program}', { program: program.title })}</h4><button type="button" aria-label={tx("Close session form")} disabled={saving} onClick={() => setSessionDraft(null)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white"><X className="h-4 w-4" aria-hidden="true"/></button></div>
            <div className="grid gap-3 sm:grid-cols-2"><label className={labelClass}>{tx("Trainer")}<input maxLength={200} value={sessionDraft.trainerName} onChange={event => setSessionDraft(value => value && ({ ...value, trainerName: event.target.value }))} className={fieldClass}/></label><label className={labelClass}>{tx("Location")}<input maxLength={300} value={sessionDraft.location} onChange={event => setSessionDraft(value => value && ({ ...value, location: event.target.value }))} className={fieldClass}/></label>
              <label className={labelClass}>{tx("Start date and time")}<input type="datetime-local" value={sessionDraft.startAt} onChange={event => setSessionDraft(value => value && ({ ...value, startAt: event.target.value }))} className={fieldClass}/></label><label className={labelClass}>{tx("End date and time")}<input type="datetime-local" value={sessionDraft.endAt} onChange={event => setSessionDraft(value => value && ({ ...value, endAt: event.target.value }))} className={fieldClass}/></label>
              <label className={labelClass}>{tx('Capacity')} <span className="font-normal">{tx("(blank means no limit)")}</span><input type="number" min="1" step="1" value={sessionDraft.capacity} onChange={event => setSessionDraft(value => value && ({ ...value, capacity: event.target.value }))} className={fieldClass}/></label><label className={labelClass}>{tx('Enrollment deadline')} <span className="font-normal">{tx("(informational)")}</span><input type="datetime-local" value={sessionDraft.enrollmentDeadline} onChange={event => setSessionDraft(value => value && ({ ...value, enrollmentDeadline: event.target.value }))} className={fieldClass}/></label>
              <label className={`${labelClass} sm:col-span-2`}>{tx("Meeting link")}<input type="url" maxLength={1000} value={sessionDraft.meetingUrl} onChange={event => setSessionDraft(value => value && ({ ...value, meetingUrl: event.target.value }))} className={fieldClass} placeholder="https://"/></label>
            </div>
            <p className="text-xs text-slate-500">{tx("The deadline is displayed with the session but does not currently block enrollment.")}</p>
              <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setSessionDraft(null)} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm">{tx("Cancel")}</button><button type="submit" disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50"><Check className="h-4 w-4" aria-hidden="true"/>{saving ? tx('Saving…') : sessionDraft.sessionId ? tx('Save session') : tx('Schedule session')}</button></div>
          </form>}
        </article>)}</div>}
  </section>;
}

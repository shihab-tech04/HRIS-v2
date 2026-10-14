import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { BookOpen, CalendarClock, CheckCircle2, Clock3, ExternalLink, GraduationCap, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Locale } from './project-locale';
import { learningText } from './learning-locale';

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
  completion_evidence_required: boolean;
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
  completion_evidence_required?: boolean;
  created_at: string;
  completion_submitted_at?: string | null;
  completion_evidence_name?: string | null;
  completion_verified_at?: string | null;
  completion_verified_by?: string | null;
  completion_verified_by_name?: string | null;
  completion_return_reason?: string | null;
  completion_history?: CompletionHistoryEvent[];
};
type CompletionHistoryEvent = { event_type: string; reason: string | null; evidence_name: string | null; created_at: string };
type CompletionNotification = { id: string; kind: string; enrollment_id: string; program_title: string; created_at: string };
type LearningSkill = { id: string; skill_name: string; proficiency: string | null; verified: boolean };
type LearningJoinLinks = Record<string, string>;
type LearningContext = {
  tenant_id: string;
  employee_id: string | null;
  programs: LearningProgram[];
  enrollments: Enrollment[];
  skills: LearningSkill[];
};

function dateTime(value: string | null, locale: Locale, tx: (english: string) => string): string {
  if (!value) return tx('Time to be confirmed');
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? tx('Time to be confirmed') : parsed.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function statusName(status: string, tx: (english: string) => string): string {
  const normalized = status.replaceAll('_', ' ');
  const title = normalized.replace(/\b\w/g, letter => letter.toUpperCase());
  return tx(title);
}

function isOpen(enrollment: Enrollment): boolean {
  return enrollment.status === 'requested' || enrollment.status === 'enrolled';
}

function isCurrentAssignment(enrollment: Enrollment): boolean {
  return isOpen(enrollment) || enrollment.status === 'pending_verification'
    || enrollment.status === 'returned_for_correction';
}

function safeMeetingUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export function MyLearning({ tenantId, locale }: { tenantId: string; locale: Locale }) {
  const tx = (english: string, values: Record<string, string | number> = {}) => learningText(locale, english, values);
  const [programs, setPrograms] = useState<LearningProgram[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [completionNotifications, setCompletionNotifications] = useState<CompletionNotification[]>([]);
  const [completionEvidence, setCompletionEvidence] = useState<Record<string, File | null>>({});
  const [completionSavingId, setCompletionSavingId] = useState('');
  const [completionError, setCompletionError] = useState('');
  const [skills, setSkills] = useState<LearningSkill[]>([]);
  const [joinLinks, setJoinLinks] = useState<LearningJoinLinks>({});
  const [joinError, setJoinError] = useState('');
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
  const [skillName, setSkillName] = useState('');
  const [skillProficiency, setSkillProficiency] = useState('');
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [skillDeleteTarget, setSkillDeleteTarget] = useState<LearningSkill | null>(null);
  const [skillError, setSkillError] = useState('');
  const [skillMessage, setSkillMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const requestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  const skillHeadingRef = useRef<HTMLHeadingElement>(null);
  const deleteSkillCancelRef = useRef<HTMLButtonElement>(null);
  const deleteSkillTriggerRef = useRef<HTMLButtonElement | null>(null);
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
    setJoinError('');
    setSkillError('');
    setJoinLinks({});
    try {
      const result = await supabase.rpc('hris_get_my_learning_context', { p_tenant_id: requestedTenant });
      if (!current()) return;
      if (result.error) throw result.error;
      const data = result.data as LearningContext | null;
      if (!data || data.tenant_id !== requestedTenant || !Array.isArray(data.programs)
          || !Array.isArray(data.enrollments) || !Array.isArray(data.skills)) {
        throw new Error(tx('Learning data returned an invalid response.'));
      }
      setPrograms(data.programs);
      const completionResult = await supabase.rpc('hris_get_my_learning_completion_data', { p_tenant_id: requestedTenant });
      if (!current()) return;
      if (completionResult.error) throw completionResult.error;
      const completionData = completionResult.data as {
        tenant_id?: string;
        employee_id?: string;
        enrollments?: Array<Partial<Enrollment> & { id: string }>;
        notifications?: CompletionNotification[];
      } | null;
      if (!completionData || completionData.tenant_id !== requestedTenant
          || !Array.isArray(completionData.enrollments) || !Array.isArray(completionData.notifications)) {
        throw new Error(tx('Learning completion data returned an invalid response.'));
      }
      const completionById = new Map(completionData.enrollments.map(row => [row.id, row]));
      setEnrollments(data.enrollments.map(enrollment => ({ ...enrollment, ...completionById.get(enrollment.id) })));
      setCompletionNotifications(completionData.notifications);
      setCompletionEvidence({});
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
      try {
        const linksResult = await supabase.rpc('hris_get_my_learning_join_links', { p_tenant_id: requestedTenant });
        if (!current()) return;
        if (linksResult.error) {
          setJoinError(tx('Online session links could not be loaded. Refresh to try again.'));
        } else if (!linksResult.data || typeof linksResult.data !== 'object' || Array.isArray(linksResult.data)) {
          setJoinError(tx('Online session links returned an invalid response. Refresh to try again.'));
        } else {
          const safeLinks = Object.fromEntries(Object.entries(linksResult.data as Record<string, unknown>)
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(safeMeetingUrl(entry[1]))));
          setJoinLinks(safeLinks);
        }
      } catch {
        if (current()) setJoinError(tx('Online session links could not be loaded. Refresh to try again.'));
      }
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? tx(cause.message) : tx('Unable to load your learning workspace.'));
    } finally {
      if (current()) setLoading(false);
    }
  }

  useEffect(() => {
    setPrograms([]);
    setEnrollments([]);
    setCompletionNotifications([]);
    setCompletionEvidence({});
    setCompletionSavingId('');
    setCompletionError('');
    setSkills([]);
    setJoinLinks({});
    setJoinError('');
    setSearch('');
    setCategory('all');
    setSessionSelection({});
    setReasons({});
    setCancelTarget(null);
    setSkillName('');
    setSkillProficiency('');
    setEditingSkillId(null);
    setSkillDeleteTarget(null);
    setSkillError('');
    void load();
    return () => { requestSequence.current += 1; };
    // The revision is the explicit refresh/action recovery trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, revision]);

  useEffect(() => { setSkillMessage(''); }, [tenantId]);

  const categories = useMemo(() => [...new Set(programs.map(program => program.category).filter((value): value is string => Boolean(value)))].sort(), [programs]);
  const visiblePrograms = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return programs.filter(program => (category === 'all' || program.category === category)
      && (!query || [program.title, program.description || '', program.category || '', program.provider || '', ...program.target_skills]
        .some(value => value.toLocaleLowerCase().includes(query))));
  }, [programs, search, category]);
  const pendingCount = enrollments.filter(enrollment => enrollment.status === 'requested').length;
  const activeCount = enrollments.filter(enrollment => enrollment.status === 'enrolled').length;
  const verifiedLearning = enrollments.filter(enrollment => enrollment.status === 'completed' && Boolean(enrollment.completion_verified_at));

  async function performAction(key: string, action: () => PromiseLike<{ error: { message: string; code?: string } | null }>, success: string) {
    setSavingKey(key);
    setActionError('');
    setMessage('');
    try {
      const result = await action();
      if (result.error) throw result.error;
      setMessage(tx(success));
      setRevision(value => value + 1);
    } catch (cause) {
      const code = (cause as { code?: string })?.code;
      const causeMessage = cause instanceof Error ? tx(cause.message) : tx('The learning action could not be saved.');
      setActionError(code === '23505'
        ? tx('You already have an open enrollment or request for this program and session.')
        : tx(causeMessage));
    } finally {
      setSavingKey('');
      setCancelTarget(null);
    }
  }

  async function submitCompletion(enrollment: Enrollment) {
    if (completionSavingId) return;
    const requestedTenant = tenantId;
    const file = completionEvidence[enrollment.id] || null;
    if (enrollment.completion_evidence_required && !file) {
      setCompletionError(tx('Attach the required completion evidence before submitting.'));
      return;
    }
    let uploadedPath: string | null = null;
    setCompletionSavingId(enrollment.id);
    setCompletionError('');
    setActionError('');
    setMessage('');
    try {
      let evidenceName: string | null = null;
      if (file) {
        const extension = file.name.split('.').at(-1)?.toLowerCase() || '';
        const mimeByExtension: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
        const expectedMime = mimeByExtension[extension];
        if (!expectedMime || (file.type && file.type !== expectedMime && file.type !== 'application/octet-stream')
            || file.size < 1 || file.size > 5 * 1024 * 1024) {
          throw new Error(tx('Choose a PDF, PNG, or JPEG evidence file up to 5 MB.'));
        }
        const userResult = await supabase.auth.getUser();
        if (userResult.error || !userResult.data.user) throw userResult.error || new Error(tx('Sign in again before submitting learning completion.'));
        const safeName = file.name.normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^\.+/, '').slice(0, 180) || `evidence.${extension}`;
        evidenceName = safeName;
        uploadedPath = `${userResult.data.user.id}/${requestedTenant}/${enrollment.id}/${crypto.randomUUID()}`;
        const upload = await supabase.storage.from('learning-completion-evidence').upload(uploadedPath, file, {
          contentType: expectedMime, upsert: false,
        });
        if (upload.error) throw upload.error;
      }
      const result = await supabase.rpc('hris_employee_submit_learning_completion', {
        p_tenant_id: requestedTenant,
        p_enrollment_id: enrollment.id,
        p_evidence_path: uploadedPath,
        p_evidence_name: evidenceName,
      });
      if (result.error) throw result.error;
      if (!result.data || result.data.id !== enrollment.id || result.data.status !== 'pending_verification') {
        throw new Error(tx('Your completion submission could not be verified. Refresh learning before retrying.'));
      }
      if (activeTenantId.current !== requestedTenant) return;
      setCompletionEvidence(current => ({ ...current, [enrollment.id]: null }));
      setMessage(tx('Your completion was submitted for manager verification.'));
      setRevision(value => value + 1);
    } catch (cause) {
      if (uploadedPath) {
        // The delete policy refuses removal if an uncertain request already attached this object.
        try { await supabase.storage.from('learning-completion-evidence').remove([uploadedPath]); } catch { /* Keep the submission recovery state even if cleanup is unavailable. */ }
      }
      if (activeTenantId.current === requestedTenant) {
        const code = (cause as { code?: string })?.code;
        setCompletionError(code === '42501'
          ? tx('Only your active or returned learning assignments can be submitted for verification.')
          : cause instanceof Error ? tx(cause.message) : tx('Unable to submit your learning completion. Try again.'));
      }
    } finally {
      if (activeTenantId.current === requestedTenant) setCompletionSavingId('');
    }
  }

  async function saveSkill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedTenant = tenantId;
    const key = editingSkillId ? `skill-edit:${editingSkillId}` : 'skill-create';
    setSavingKey(key);
    setSkillError('');
    setSkillMessage('');
    try {
      const result = await supabase.rpc('hris_employee_save_my_skill', {
        p_tenant_id: requestedTenant,
        p_skill_id: editingSkillId,
        p_skill_name: skillName.trim(),
        p_proficiency: skillProficiency.trim() || null,
      });
      if (result.error) throw result.error;
      if (activeTenantId.current !== requestedTenant) return;
      setSkillName('');
      setSkillProficiency('');
      setEditingSkillId(null);
      setSkillMessage(tx('Your skill profile was saved. It remains unverified until your organization verifies it.'));
      setRevision(value => value + 1);
    } catch (cause) {
      if (activeTenantId.current !== requestedTenant) return;
      const code = (cause as { code?: string })?.code;
      setSkillError(code === '23505'
        ? tx('That skill is already in your profile.')
        : cause instanceof Error ? tx(cause.message) : tx('Unable to save your skill profile. Try again.'));
    } finally {
      if (activeTenantId.current === requestedTenant) setSavingKey('');
    }
  }

  async function deleteSkill() {
    if (!skillDeleteTarget || savingKey) return;
    const target = skillDeleteTarget;
    const requestedTenant = tenantId;
    setSavingKey(`skill-delete:${target.id}`);
    setSkillError('');
    setSkillMessage('');
    try {
      const result = await supabase.rpc('hris_employee_delete_my_skill', {
        p_tenant_id: requestedTenant,
        p_skill_id: target.id,
      });
      if (result.error) throw result.error;
      if (activeTenantId.current !== requestedTenant) return;
      setSkillDeleteTarget(null);
      setSkillMessage(tx('Skill removed from your profile.'));
      setRevision(value => value + 1);
      requestAnimationFrame(() => skillHeadingRef.current?.focus());
    } catch (cause) {
      if (activeTenantId.current !== requestedTenant) return;
      setSkillError(cause instanceof Error ? tx(cause.message) : tx('Unable to remove this skill. Try again.'));
    } finally {
      if (activeTenantId.current === requestedTenant) setSavingKey('');
    }
  }

  function closeSkillDelete() {
    if (savingKey) return;
    setSkillDeleteTarget(null);
    setSkillError('');
    requestAnimationFrame(() => deleteSkillTriggerRef.current?.focus());
  }

  useEffect(() => {
    if (!skillDeleteTarget) return;
    deleteSkillCancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingKey) closeSkillDelete();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [skillDeleteTarget, savingKey]);

  function selectedSession(program: LearningProgram): string | null {
    return sessionSelection[program.id] || null;
  }

  function existingOpen(program: LearningProgram): Enrollment | undefined {
    const sessionId = selectedSession(program);
    return enrollments.find(enrollment => enrollment.program_id === program.id
      && enrollment.session_id === sessionId && isCurrentAssignment(enrollment));
  }

  return <section aria-labelledby="my-learning-heading" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><h2 id="my-learning-heading" className="text-2xl font-medium text-[#49454F]">{tx("My Learning")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{tx("Explore active learning programs, manage your requests, and keep track of your enrollment history.")}</p></div>
      <button type="button" aria-label={tx("Refresh learning")} onClick={() => setRevision(value => value + 1)} disabled={loading}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />{tx("Refresh")}</button>
    </div>

    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p role="alert">{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">{tx("Retry")}</button></div>}
    {actionError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{actionError}</div>}
    {completionError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{completionError}</div>}
    {joinError && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p role="status">{joinError}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-9 rounded-lg border border-amber-300 bg-white px-3 font-medium">{tx("Refresh")}</button></div>}
    {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
    {completionNotifications.length > 0 && <section aria-labelledby="learning-updates-heading" className="rounded-xl border border-[#B9DCE2] bg-[#F8FCFC] p-4">
      <h3 id="learning-updates-heading" className="font-semibold text-[#1E1B39]">{tx('Learning updates')}</h3>
      <ul className="mt-2 space-y-2">{completionNotifications.slice(0, 5).map(notification => <li key={notification.id} data-learning-notification={notification.id} className="text-sm text-slate-700">
        {notification.kind === 'verified'
          ? tx('{program} completion was verified.', { program: notification.program_title })
          : tx('{program} completion was returned for correction.', { program: notification.program_title })}
        <span className="ml-2 text-xs text-slate-500">{dateTime(notification.created_at, locale, tx)}</span>
      </li>)}</ul>
    </section>}

    <div className="grid gap-3 sm:grid-cols-3">
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">{tx("Available programs")}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{programs.length}</p></article>
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">{tx("Current enrollments")}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{activeCount}</p></article>
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">{tx("Approval requests pending")}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{pendingCount}</p></article>
    </div>

    <section aria-labelledby="my-learning-skills" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2"><GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-[#08558B]" aria-hidden="true" /><div>
          <h3 id="my-learning-skills" ref={skillHeadingRef} tabIndex={-1} className="font-semibold text-[#1E1B39]">{tx("Your skill profile")}</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{tx("Record skills you want to include in your development profile. Proficiency wording is optional and remains self-reported.")}</p>
        </div></div>
      </div>
      {skillError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{skillError}</p>}
      {skillMessage && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{skillMessage}</p>}
      {loading ? <p role="status" className="mt-3 text-sm text-slate-600">{tx("Loading your skill profile…")}</p>
        : skills.length === 0 ? <p role="status" className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">{tx("No skills recorded yet. Add one to start your profile.")}</p>
          : <ul className="mt-3 grid gap-2 sm:grid-cols-2">{skills.map(skill => <li key={skill.id} data-learning-skill={skill.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-[#F8FCFC] p-3">
            <div className="min-w-0"><p className="break-words text-sm font-medium text-slate-900">{skill.skill_name}</p>{skill.proficiency && <p className="mt-0.5 break-words text-xs text-slate-600">{skill.proficiency} · {tx('Self-reported')}</p>}{skill.verified && <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />{tx("Organization verified")}</p>}</div>
            {!skill.verified && <div className="flex shrink-0 gap-2"><button type="button" disabled={Boolean(savingKey)} onClick={() => { setSkillError(''); setEditingSkillId(skill.id); setSkillName(skill.skill_name); setSkillProficiency(skill.proficiency || ''); document.getElementById('learning-skill-name')?.focus(); }} className="min-h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium disabled:opacity-50">{tx("Edit")}</button><button type="button" disabled={Boolean(savingKey)} aria-label={tx('Remove {skill}', { skill: skill.skill_name })} onClick={event => { deleteSkillTriggerRef.current = event.currentTarget; setSkillError(''); setSkillDeleteTarget(skill); }} className="min-h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-rose-800 disabled:opacity-50">{tx("Remove")}</button></div>}
          </li>)}</ul>}
      <div className="mt-4 border-t border-slate-100 pt-4">
        <h4 className="text-sm font-semibold text-[#1E1B39]">{tx('Verified learning')}</h4>
        {loading ? <p role="status" className="mt-2 text-sm text-slate-600">{tx('Loading verified learning…')}</p>
          : verifiedLearning.length === 0 ? <p role="status" className="mt-2 text-sm text-slate-500">{tx('Verified course completions will appear here.')}</p>
            : <ul className="mt-2 grid gap-2 sm:grid-cols-2">{verifiedLearning.map(enrollment => <li key={enrollment.id} data-verified-learning={enrollment.id} className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
              <p className="break-words text-sm font-medium text-slate-900">{enrollment.program_title}</p>
              <p className="mt-1 text-xs text-slate-600">{tx('Verified {date}', { date: dateTime(enrollment.completion_verified_at || null, locale, tx) })}</p>
            </li>)}</ul>}
      </div>
      <form onSubmit={saveSkill} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <label className="block text-xs font-medium text-slate-600">{tx("Skill name")}<input id="learning-skill-name" required maxLength={120} value={skillName} onChange={event => setSkillName(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" placeholder={tx("For example, data analysis")} /></label>
        <label className="block text-xs font-medium text-slate-600">{tx("Proficiency (optional)")}<input maxLength={80} value={skillProficiency} onChange={event => setSkillProficiency(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" placeholder={tx("Use your own wording")} /></label>
        <div className="flex gap-2"><button type="submit" disabled={loading || Boolean(savingKey) || !skillName.trim()} className="min-h-11 flex-1 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50 sm:flex-none">{savingKey.startsWith('skill-') ? tx('Saving…') : editingSkillId ? tx('Save changes') : tx('Add skill')}</button>{editingSkillId && <button type="button" disabled={Boolean(savingKey)} onClick={() => { setEditingSkillId(null); setSkillName(''); setSkillProficiency(''); setSkillError(''); }} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">{tx("Cancel")}</button>}</div>
      </form>
      <p className="mt-2 text-xs text-slate-500">{tx("Skills entered here are not organization verified. Verified skills are read-only in this profile.")}</p>
    </section>

    {skillDeleteTarget && <div role="alertdialog" aria-modal="true" aria-labelledby="delete-skill-title" aria-describedby="delete-skill-description" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) closeSkillDelete(); }}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"><h3 id="delete-skill-title" className="text-lg font-semibold text-slate-900">{tx("Remove this skill?")}</h3><p id="delete-skill-description" className="mt-2 break-words text-sm text-slate-600">{tx('{skill} will be removed from your skill profile. Organization-verified skills cannot be removed here.', { skill: skillDeleteTarget.skill_name })}</p>{skillError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{skillError}</p>}<div className="mt-5 flex flex-wrap justify-end gap-2"><button ref={deleteSkillCancelRef} type="button" disabled={Boolean(savingKey)} onClick={closeSkillDelete} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium disabled:opacity-50">{tx("Keep skill")}</button><button type="button" disabled={Boolean(savingKey)} onClick={() => void deleteSkill()} className="min-h-11 rounded-lg bg-rose-700 px-4 text-sm font-medium text-white disabled:opacity-50">{savingKey === `skill-delete:${skillDeleteTarget.id}` ? tx('Removing…') : tx('Remove skill')}</button></div></div>
    </div>}

    <section aria-labelledby="learning-catalog-heading" className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="min-w-[220px] flex-1"><label htmlFor="my-learning-search" className="mb-1 block text-xs font-medium text-slate-600">{tx("Search learning programs")}</label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" aria-hidden="true" /><input id="my-learning-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={tx("Title, provider, category, or skill")} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-[#085587]" /></div></div>
        <div className="w-full sm:w-56"><label htmlFor="my-learning-category" className="mb-1 block text-xs font-medium text-slate-600">{tx("Category")}</label><select id="my-learning-category" value={category} onChange={event => setCategory(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="all">{tx("All categories")}</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
        <p className="text-xs text-slate-500" aria-live="polite">{tx('{count} shown', { count: visiblePrograms.length })}</p>
      </div>
      <h3 id="learning-catalog-heading" className="sr-only">{tx("Learning program catalog")}</h3>
      {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{tx("Loading your learning programs…")}</p>
        : visiblePrograms.length === 0 ? <p role="status" className="rounded-xl border border-dashed border-[#B9DCE2] bg-white p-5 text-sm text-slate-600">{programs.length ? tx('No learning programs match your search.') : tx('There are no active learning programs in this organization yet.')}</p>
          : <div className="grid min-w-0 gap-3 xl:grid-cols-2">{visiblePrograms.map(program => {
            const sessionId = selectedSession(program);
            const currentOpen = existingOpen(program);
            const selected = program.sessions.find(session => session.id === sessionId);
            const full = selected?.available_seats !== null && selected?.available_seats !== undefined && selected.available_seats <= 0;
            const key = `${program.id}:${sessionId || 'none'}`;
            return <article key={program.id} data-learning-program={program.id} className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-[#615E83]">{program.category || tx('Learning program')}{program.provider ? ` · ${program.provider}` : ''}</p><h4 className="mt-1 break-words text-lg font-semibold text-[#1E1B39]">{program.title}</h4></div><span className="shrink-0 rounded-full bg-[#EFF7F8] px-3 py-1 text-xs font-medium text-[#08558B]">{tx(program.delivery_mode.replaceAll('_', ' '))}</span></div>
              {program.completion_evidence_required && <p className="mt-2 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">{tx('Completion evidence required')}</p>}
              {program.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-600">{program.description}</p>}
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">{tx("Duration")}</dt><dd className="mt-1 font-medium text-slate-800">{program.duration_hours === null ? tx('Not specified') : `${program.duration_hours} ${tx('hours')}`}</dd></div><div><dt className="text-xs text-slate-500">{tx("Scheduled sessions")}</dt><dd className="mt-1 font-medium text-slate-800">{program.sessions.length}</dd></div></dl>
              {program.target_skills.length > 0 && <div className="mt-3"><p className="text-xs font-medium text-slate-500">{tx("Target skills")}</p><p className="mt-1 break-words text-sm text-slate-700">{program.target_skills.join(' · ')}</p></div>}
              {program.sessions.length > 0 && <label className="mt-4 block text-xs font-medium text-slate-600">{tx("Choose a scheduled session")}<select aria-label={tx('Choose session for {program}', { program: program.title })} value={sessionId || ''} onChange={event => setSessionSelection(current => ({ ...current, [program.id]: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"><option value="">{tx("No session selected")}</option>{program.sessions.map(session => <option key={session.id} value={session.id}>{dateTime(session.start_at, locale, tx)} · {session.location || tx('Location to be confirmed')}{session.available_seats !== null ? ` · ${tx('{count} seats left', { count: session.available_seats })}` : ''}</option>)}</select></label>}
              {selected && <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[#08558B]" aria-hidden="true" /><span>{dateTime(selected.start_at, locale, tx)}{selected.end_at ? ` – ${dateTime(selected.end_at, locale, tx)}` : ''}{selected.trainer_name ? ` · ${tx('Trainer:')} ${selected.trainer_name}` : ''}{selected.location ? ` · ${selected.location}` : ''}</span></div>}
              <div className="mt-4 border-t border-slate-100 pt-4">{currentOpen ? <p className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-slate-700"><Clock3 className="h-4 w-4 text-[#08558B]" aria-hidden="true" />{tx(currentOpen.status === 'requested' ? 'Approval request pending' : currentOpen.status === 'pending_verification' ? 'Completion pending verification' : currentOpen.status === 'returned_for_correction' ? 'Completion returned for correction' : 'You are enrolled')}{selected ? ` · ${dateTime(selected.start_at, locale, tx)}` : ''}</p>
                : <div className="flex flex-col gap-2 sm:flex-row sm:items-end">{!program.self_enrollment && <label className="block min-w-0 flex-1 text-xs font-medium text-slate-600">{tx('Reason for request')} <span className="font-normal">{tx("(optional)")}</span><textarea aria-label={tx('Reason for {program}', { program: program.title })} value={reasons[program.id] || ''} maxLength={1000} rows={2} onChange={event => setReasons(current => ({ ...current, [program.id]: event.target.value }))} className="mt-1 min-h-20 w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-sm" placeholder={tx("Share what you hope to learn.")} /></label>}
                  <button type="button" disabled={Boolean(savingKey) || Boolean(full)} onClick={() => void performAction(key, () => program.self_enrollment
                    ? supabase.rpc('hris_employee_enroll_learning', { p_tenant_id: tenantId, p_program_id: program.id, p_session_id: sessionId })
                    : supabase.rpc('hris_employee_request_learning', { p_tenant_id: tenantId, p_program_id: program.id, p_session_id: sessionId, p_reason: reasons[program.id]?.trim() || null }), program.self_enrollment ? 'Enrollment saved.' : 'Your approval request was submitted.')}
                    className="min-h-11 shrink-0 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white hover:bg-[#06466F] disabled:cursor-not-allowed disabled:opacity-50">{savingKey === key ? tx('Saving…') : full ? tx('Session full') : program.self_enrollment ? tx('Enroll now') : tx('Request approval')}</button></div>}
              </div>
            </article>;
          })}</div>}
    </section>

    <section aria-labelledby="learning-history-heading" className="space-y-3">
      <div className="flex items-end justify-between gap-3"><div><h3 id="learning-history-heading" className="text-lg font-semibold text-[#1E1B39]">{tx("My enrollment history")}</h3><p className="mt-1 text-sm text-slate-600">{tx("Requests, current enrollments, completed learning, and cancellations.")}</p></div><BookOpen className="h-5 w-5 text-[#08558B]" aria-hidden="true" /></div>
      {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{tx("Loading enrollment history…")}</p>
        : enrollments.length === 0 ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{tx("Your learning activity will appear here after you enroll or request a program.")}</p>
        : <div className="grid min-w-0 gap-3 lg:grid-cols-2">{enrollments.map(enrollment => {
          const certificateUrl = safeMeetingUrl(enrollment.certificate_url || undefined);
          const evidenceRequired = enrollment.completion_evidence_required === true;
          return <article key={enrollment.id} data-learning-enrollment={enrollment.id} data-learning-status={enrollment.status} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-slate-500">{enrollment.mandatory ? tx('Assigned learning') : statusName(enrollment.source, tx)}</p><h4 className="mt-1 break-words font-semibold text-slate-900">{enrollment.program_title}</h4></div><span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{statusName(enrollment.status, tx)}</span></div>
              {enrollment.session_start_at && <p className="mt-2 text-sm text-slate-600">{dateTime(enrollment.session_start_at, locale, tx)}{enrollment.session_location ? ` · ${enrollment.session_location}` : ''}</p>}
              {enrollment.status === 'enrolled' && safeMeetingUrl(joinLinks[enrollment.id]) && <a href={safeMeetingUrl(joinLinks[enrollment.id])!} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#B9DCE2] bg-[#F8FCFC] px-3 text-sm font-medium text-[#08558B] hover:bg-[#EFF7F8]">{tx("Join online session")}<ExternalLink className="h-4 w-4" aria-hidden="true" /></a>}
              {enrollment.due_date && <p className="mt-2 text-sm text-slate-600">{tx('Due')} {new Date(`${enrollment.due_date}T12:00:00`).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US')}</p>}
              {enrollment.recommendation_reason && <p className="mt-2 break-words text-sm text-slate-600">{tx('Request note:')} {enrollment.recommendation_reason}</p>}
              {enrollment.resolution_note && <p className="mt-2 break-words text-sm text-slate-600">{tx('Update:')} {enrollment.resolution_note}</p>}
              {enrollment.completion_submitted_at && <p className="mt-2 text-sm text-slate-600">{tx('Submitted for verification {date}', { date: dateTime(enrollment.completion_submitted_at, locale, tx) })}</p>}
              {enrollment.completion_evidence_name && <p className="mt-2 break-all text-xs text-slate-500">{tx('Supporting evidence:')} {enrollment.completion_evidence_name}</p>}
              {enrollment.completion_return_reason && <div role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-900">{tx('Returned for correction')}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-amber-900">{enrollment.completion_return_reason}</p></div>}
              {enrollment.status === 'pending_verification' && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{tx('Your completion is pending manager verification. You can continue other work.')}</p>}
              {enrollment.status === 'completed' && enrollment.completion_verified_at && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{tx('Verified {date}', { date: dateTime(enrollment.completion_verified_at, locale, tx) })}{enrollment.completion_verified_by_name ? ` · ${tx('Verified by')} ${enrollment.completion_verified_by_name}` : enrollment.completion_verified_by ? ` · ${tx('Verified by')} ${enrollment.completion_verified_by}` : ''}</p>}
              {enrollment.completion_history && enrollment.completion_history.length > 0 && <details className="mt-3 rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">{tx('Completion review history')}</summary><ol className="mt-2 space-y-2">{enrollment.completion_history.map((event, index) => <li key={`${event.event_type}-${event.created_at}-${index}`} className="border-l-2 border-[#B9DCE2] pl-3 text-xs text-slate-600"><p className="font-medium">{tx(event.event_type === 'returned_for_correction' ? 'Returned for correction' : event.event_type === 'verified' ? 'Verified' : event.event_type === 'resubmitted' ? 'Resubmitted' : 'Submitted for verification')} · {dateTime(event.created_at, locale, tx)}</p>{event.reason && <p className="mt-1 whitespace-pre-wrap break-words">{event.reason}</p>}{event.evidence_name && <p className="mt-1 break-all">{tx('Supporting evidence:')} {event.evidence_name}</p>}</li>)}</ol></details>}
              {certificateUrl && <a href={certificateUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-[#08558B] underline">{tx("View certificate")}</a>}
              {(enrollment.status === 'enrolled' || enrollment.status === 'returned_for_correction') && <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <label className="block text-xs font-medium text-slate-700">{tx(evidenceRequired ? 'Supporting evidence (required)' : 'Supporting evidence (optional)')}<input type="file" required={evidenceRequired} accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" disabled={Boolean(completionSavingId)} onChange={event => { setCompletionError(''); setCompletionEvidence(current => ({ ...current, [enrollment.id]: event.target.files?.[0] || null })); }} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs file:mr-3 file:min-h-8 file:rounded-md file:border-0 file:bg-[#EFF7F8] file:px-3 file:text-xs file:font-medium file:text-[#08558B]" /></label>
                <p className="text-xs text-slate-500">{completionEvidence[enrollment.id]?.name || tx(evidenceRequired ? 'Select a PDF, PNG, or JPEG evidence file to submit.' : 'No evidence selected. You can attach evidence if it is available.')}</p>
                <button type="button" disabled={Boolean(completionSavingId) || loading || (evidenceRequired && !completionEvidence[enrollment.id])} onClick={() => void submitCompletion(enrollment)} className="min-h-11 w-full rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white hover:bg-[#06466F] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{completionSavingId === enrollment.id ? tx('Submitting…') : tx(enrollment.status === 'returned_for_correction' ? 'Resubmit for verification' : 'Mark completed')}</button>
              </div>}
              {isOpen(enrollment) && enrollment.mandatory && <p className="mt-3 text-xs text-slate-500">{tx("This enrollment was assigned and cannot be cancelled here.")}</p>}
              {isOpen(enrollment) && !enrollment.mandatory && <button type="button" disabled={Boolean(savingKey)} onClick={() => setCancelTarget(enrollment)} className="mt-3 min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 disabled:opacity-50">{tx("Cancel enrollment")}</button>}
            </article>;
        })}</div>}
    </section>

    {cancelTarget && <div role="alertdialog" aria-modal="true" aria-labelledby="cancel-learning-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setCancelTarget(null); }}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"><h3 id="cancel-learning-title" className="text-lg font-semibold text-slate-900">{tx("Cancel this learning activity?")}</h3><p className="mt-2 break-words text-sm text-slate-600">{tx('{program} will be marked cancelled. You may submit another request or enrollment later if the program remains available.', { program: cancelTarget.program_title })}</p><div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" disabled={Boolean(savingKey)} onClick={() => setCancelTarget(null)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium">{tx("Keep it")}</button><button type="button" disabled={Boolean(savingKey)} onClick={() => void performAction(`cancel:${cancelTarget.id}`, () => supabase.rpc('hris_employee_cancel_learning', { p_tenant_id: tenantId, p_id: cancelTarget.id }), 'Learning activity cancelled.')} className="min-h-11 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50">{savingKey === `cancel:${cancelTarget.id}` ? tx('Cancelling…') : tx('Confirm cancellation')}</button></div></div>
    </div>}
  </section>;
}

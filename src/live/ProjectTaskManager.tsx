import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, Plus, RefreshCw, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { projectText, type Locale } from './project-locale';

type MemberOption = { id: string; employee_name: string; employee_number: string; status: string };
type TaskMember = { id: string; project_allocation_id: string; employee_id: string; employee_name: string; released_at: string | null };
type ProjectTask = { id: string; title: string; description: string; due_date: string | null; status: 'open' | 'in_progress' | 'completed'; feedback_pending: number; members: TaskMember[] };
type PendingConfirmation =
  | { kind: 'release'; taskId: string; taskTitle: string; member: TaskMember }
  | { kind: 'complete'; taskId: string; taskTitle: string };
type TaskEdit = { taskId: string; title: string; description: string; dueDate: string };

function errorMessage(cause: unknown, fallback: string) {
  if (cause instanceof Error && cause.message) return cause.message;
  if (cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string') return cause.message;
  return fallback;
}

export function ProjectTaskManager({ tenantId, projectId, members, locale }: { tenantId: string; projectId: string; members: MemberOption[]; locale: Locale }) {
  const tx = (english: string) => projectText(locale, english);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [addMember, setAddMember] = useState<Record<string, string>>({});
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [taskEdit, setTaskEdit] = useState<TaskEdit | null>(null);
  const requestSequence = useRef(0);
  const savingRef = useRef(false);
  const cancelConfirmationRef = useRef<HTMLButtonElement>(null);
  const confirmationOriginRef = useRef<HTMLElement | null>(null);
  savingRef.current = saving;

  useEffect(() => {
    if (!pendingConfirmation) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelConfirmationRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingRef.current) {
        event.preventDefault();
        setPendingConfirmation(null);
        setError('');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const target = confirmationOriginRef.current?.isConnected
        ? confirmationOriginRef.current
        : previousFocus?.isConnected ? previousFocus : null;
      target?.focus();
    };
  }, [pendingConfirmation]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    setTasks([]); setLoading(true); setError('');
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('hris_get_project_task_workspace', {
          p_tenant_id: tenantId, p_project_id: projectId,
        });
        if (requestId !== requestSequence.current) return;
        if (rpcError) throw rpcError;
        const rows = (data as { tasks?: ProjectTask[] } | null)?.tasks;
        if (!Array.isArray(rows)) throw new Error('Task workspace returned an invalid response.');
        setTasks(rows);
      } catch (cause) {
        if (requestId === requestSequence.current) setError(errorMessage(cause, 'Unable to load project tasks.'));
      } finally {
        if (requestId === requestSequence.current) setLoading(false);
      }
    })();
    return () => { requestSequence.current += 1; };
  }, [tenantId, projectId, revision]);

  function refresh() { setRevision(value => value + 1); }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await supabase.rpc('hris_create_project_task', {
        p_tenant_id: tenantId, p_project_id: projectId, p_title: title.trim(),
        p_description: description.trim(), p_due_date: dueDate || null,
        p_project_allocation_ids: selectedMembers,
      });
      if (result.error) throw result.error;
      setTitle(''); setDescription(''); setDueDate(''); setSelectedMembers([]); setShowCreate(false);
      setNotice(tx('Task created and assigned.')); refresh();
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to create this task.'));
    } finally { setSaving(false); }
  }

  async function callTaskAction(rpc: string, args: Record<string, unknown>, message: string): Promise<boolean> {
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await supabase.rpc(rpc, args as never);
      if (result.error) throw result.error;
      setNotice(tx(message)); refresh();
      return true;
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to update this task.'));
      return false;
    } finally { setSaving(false); }
  }

  async function saveTaskEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!taskEdit) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await supabase.rpc('hris_update_project_task', {
        p_tenant_id: tenantId, p_task_id: taskEdit.taskId, p_title: taskEdit.title.trim(),
        p_description: taskEdit.description.trim(), p_due_date: taskEdit.dueDate || null,
      });
      if (result.error) throw result.error;
      setTaskEdit(null);
      setNotice(tx('Task details saved.'));
      refresh();
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to save these task details.'));
    } finally { setSaving(false); }
  }

  async function confirmTaskAction() {
    if (!pendingConfirmation || saving) return;
    const confirmation = pendingConfirmation;
    const success = confirmation.kind === 'release'
      ? await callTaskAction('hris_release_project_task_member', {
        p_tenant_id: tenantId, p_task_assignment_id: confirmation.member.id,
      }, locale === 'bn' ? 'সদস্যকে অব্যাহতি দেওয়া হয়েছে। পর্যালোচনার দায় “মতামত অপেক্ষমাণ” হিসেবে রাখা হয়েছে।' : 'Member released. Peer-review obligations are tracked as Feedback Pending.')
      : await callTaskAction('hris_complete_project_task', {
        p_tenant_id: tenantId, p_task_id: confirmation.taskId,
      }, locale === 'bn' ? 'কাজ সম্পন্ন হয়েছে। সহকর্মী পর্যালোচনা “মতামত অপেক্ষমাণ” হিসেবে আলাদাভাবে রাখা হয়েছে।' : 'Task completed. Peer reviews remain separately tracked as Feedback Pending.');
    if (success) setPendingConfirmation(null);
  }

  return <section aria-label={tx('Project task management')} className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h4 className="font-semibold text-slate-900">{tx('Project tasks')}</h4><p className="mt-1 text-xs text-slate-600">{tx('Task assignments and feedback are tracked separately. Reviews never hold up completion.')}</p></div>
      <div className="flex gap-2">
        <button type="button" onClick={() => { setNotice(''); refresh(); }} disabled={loading || saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true"/>{tx('Refresh')}</button>
        <button type="button" onClick={() => { setShowCreate(open => !open); setError(''); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#085587] px-3 text-sm font-medium text-white"><Plus className="h-4 w-4" aria-hidden="true"/>{showCreate ? tx('Close') : tx('New task')}</button>
      </div>
    </div>
    {notice && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {error && !pendingConfirmation && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><p role="alert">{error}</p><button type="button" onClick={refresh} className="min-h-9 rounded-md border border-rose-300 bg-white px-3">Retry</button></div>}
    {showCreate && <form onSubmit={createTask} className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-4" aria-label={tx('Create project task')}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-600">{tx('Task title *')}<input required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"/></label>
        <label className="text-xs font-medium text-slate-600">{tx('Due date')}<input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"/></label>
        <label className="text-xs font-medium text-slate-600 sm:col-span-2">{tx('Description')}<textarea rows={2} maxLength={4000} value={description} onChange={event => setDescription(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></label>
      </div>
      <fieldset><legend className="text-xs font-medium text-slate-700">{tx('Assign project members *')}</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{members.filter(member => member.status === 'active').map(member => <label key={member.id} className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm"><input type="checkbox" checked={selectedMembers.includes(member.id)} onChange={event => setSelectedMembers(value => event.target.checked ? [...value, member.id] : value.filter(id => id !== member.id))}/><span>{member.employee_name} <span className="text-xs text-slate-500">{member.employee_number}</span></span></label>)}</div></fieldset>
      <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => { setShowCreate(false); setTitle(''); setDescription(''); setDueDate(''); setSelectedMembers([]); }} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm">{tx('Cancel')}</button><button type="submit" disabled={saving || !selectedMembers.length} className="min-h-10 rounded-lg bg-[#085587] px-4 text-sm font-medium text-white disabled:opacity-50">{saving ? tx('Saving…') : tx('Create task')}</button></div>
    </form>}
    {loading ? <p role="status" className="mt-4 rounded-lg bg-white p-4 text-sm text-slate-600">{tx('Loading project tasks…')}</p> : tasks.length === 0 ? <p role="status" className="mt-4 rounded-lg bg-white p-4 text-sm text-slate-600">{tx('No project tasks yet.')}</p> :
      <div className="mt-4 space-y-3">{tasks.map(task => <article key={task.id} className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h5 tabIndex={-1} className="break-words font-semibold text-slate-900">{task.title}</h5>{task.description && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{task.description}</p>}<p className="mt-1 text-xs text-slate-500">{tx('Due:')} {task.due_date || tx('Not set')} · {task.members.filter(member => !member.released_at).length} {locale === 'bn' ? 'জন বরাদ্দ' : 'assigned'}</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{tx(task.status === 'in_progress' ? 'In progress' : task.status === 'completed' ? 'Completed' : 'Open')}</span>{task.status !== 'completed' && <button type="button" disabled={saving} onClick={() => { setError(''); setNotice(''); setTaskEdit({ taskId: task.id, title: task.title, description: task.description || '', dueDate: task.due_date || '' }); }} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-medium disabled:opacity-50">{tx('Edit task')}</button>}</div></div>
        {taskEdit?.taskId === task.id && <form onSubmit={saveTaskEdit} aria-label={`${tx('Edit task')} ${task.title}`} className="mt-4 space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">{tx('Task title *')}<input required maxLength={160} value={taskEdit.title} onChange={event => setTaskEdit(current => current ? { ...current, title: event.target.value } : current)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></label>
            <label className="text-xs font-medium text-slate-600">{tx('Due date')}<input type="date" value={taskEdit.dueDate} onChange={event => setTaskEdit(current => current ? { ...current, dueDate: event.target.value } : current)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></label>
            <label className="text-xs font-medium text-slate-600 sm:col-span-2">{tx('Description')}<textarea rows={2} maxLength={4000} value={taskEdit.description} onChange={event => setTaskEdit(current => current ? { ...current, description: event.target.value } : current)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
          </div>
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={() => { setTaskEdit(null); setError(''); }} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">{tx('Cancel')}</button><button type="submit" disabled={saving || !taskEdit.title.trim()} className="min-h-10 rounded-lg bg-[#085587] px-4 text-sm font-medium text-white disabled:opacity-50">{saving ? tx('Saving…') : error ? tx('Retry save') : tx('Save task')}</button></div>
        </form>}
        <ul className="mt-3 flex flex-wrap gap-2" aria-label={`${task.title} ${tx('members')}`}>{task.members.map(member => <li key={member.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-xs text-slate-700">{member.employee_name}{member.released_at ? ` · ${tx('Released')}` : ''}{!member.released_at && task.status !== 'completed' && <button type="button" aria-label={locale === 'bn' ? `${member.employee_name}-কে ${task.title} কাজ থেকে অব্যাহতি দিন` : `Release ${member.employee_name} from ${task.title}`} disabled={saving} onClick={event => { confirmationOriginRef.current = event.currentTarget.closest('article')?.querySelector('h5') || event.currentTarget; setError(''); setPendingConfirmation({ kind: 'release', taskId: task.id, taskTitle: task.title, member }); }} className="grid h-7 w-7 place-items-center rounded-full hover:bg-rose-100"><X className="h-3.5 w-3.5" aria-hidden="true"/></button>}</li>)}</ul>
        {task.status !== 'completed' && <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1 text-xs font-medium text-slate-600">{tx('Add project member')}<select aria-label={locale === 'bn' ? `${task.title} কাজে সদস্য যোগ করুন` : `Add member to ${task.title}`} value={addMember[task.id] || ''} onChange={event => setAddMember(value => ({ ...value, [task.id]: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">{tx('Select member')}</option>{members.filter(member => member.status === 'active' && !task.members.some(existing => existing.project_allocation_id === member.id && !existing.released_at)).map(member => <option key={member.id} value={member.id}>{member.employee_name}</option>)}</select></label>
          <button type="button" disabled={saving || !addMember[task.id]} onClick={() => void callTaskAction('hris_assign_project_task_member', { p_tenant_id: tenantId, p_task_id: task.id, p_project_allocation_id: addMember[task.id] }, tx('Task member added.')) } className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50">{tx('Add member')}</button>
        </div>}
        {task.feedback_pending > 0 && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">{tx('Feedback Pending')} · {task.feedback_pending} {locale === 'bn' ? 'টি প্রয়োজনীয় পর্যালোচনা' : 'required reviews'}</p>}
        <div className="mt-3 flex flex-wrap justify-end gap-2">{task.status === 'open' && <button type="button" disabled={saving} onClick={() => void callTaskAction('hris_start_project_task', { p_tenant_id: tenantId, p_task_id: task.id }, tx('Task started.'))} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm">{tx('Start task')}</button>}{task.status !== 'completed' && <button type="button" disabled={saving} onClick={event => { confirmationOriginRef.current = event.currentTarget.closest('article')?.querySelector('h5') || event.currentTarget; setError(''); setPendingConfirmation({ kind: 'complete', taskId: task.id, taskTitle: task.title }); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#085587] px-3 text-sm font-medium text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" aria-hidden="true"/>{saving ? tx('Saving…') : tx('Mark complete')}</button>}</div>
      </article>)}</div>}
    {pendingConfirmation && <div role="alertdialog" aria-modal="true" aria-labelledby="project-task-confirm-title" aria-describedby="project-task-confirm-description" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" onMouseDown={event => { if (!saving && event.target === event.currentTarget) { setPendingConfirmation(null); setError(''); } }}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h5 id="project-task-confirm-title" className="text-lg font-semibold text-slate-900">{pendingConfirmation.kind === 'release' ? tx('Release task member?') : tx('Complete this task?')}</h5>
        <p id="project-task-confirm-description" className="mt-2 text-sm text-slate-600">{pendingConfirmation.kind === 'release'
          ? locale === 'bn' ? `${pendingConfirmation.member.employee_name}-কে “${pendingConfirmation.taskTitle}” কাজ থেকে অব্যাহতি দেওয়া হবে। যেসব সহকর্মীর নিয়োগের সময় পরস্পরের সঙ্গে মিলে, তারা বাধ্যতামূলক পর্যালোচনা পাবেন। ${tx('The release will not wait for feedback.')}` : `${pendingConfirmation.member.employee_name} will be released from “${pendingConfirmation.taskTitle}”. Collaborators whose assignments overlapped will receive required peer reviews. The release will not wait for feedback.`
          : locale === 'bn' ? `“${pendingConfirmation.taskTitle}” কাজটি সম্পন্ন হিসেবে চিহ্নিত হবে। ${tx('Outstanding reviews remain tracked separately as Feedback Pending.')}` : `“${pendingConfirmation.taskTitle}” will be marked complete. Outstanding reviews remain tracked separately as Feedback Pending.`}</p>
        {error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2"><button ref={cancelConfirmationRef} type="button" disabled={saving} onClick={() => { setPendingConfirmation(null); setError(''); }} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium disabled:opacity-50">{tx('Cancel')}</button><button type="button" disabled={saving} onClick={() => void confirmTaskAction()} className="min-h-11 rounded-lg bg-[#085587] px-4 text-sm font-medium text-white disabled:opacity-50">{saving ? tx('Saving…') : error ? tx('Retry') : pendingConfirmation.kind === 'release' ? tx('Confirm release') : tx('Confirm completion')}</button></div>
      </div>
    </div>}
  </section>;
}

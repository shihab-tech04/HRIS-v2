import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, Plus, RefreshCw, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

type MemberOption = { id: string; employee_name: string; employee_number: string; status: string };
type TaskMember = { id: string; project_allocation_id: string; employee_id: string; employee_name: string; released_at: string | null };
type ProjectTask = { id: string; title: string; description: string; due_date: string | null; status: 'open' | 'in_progress' | 'completed'; feedback_pending: number; members: TaskMember[] };

function errorMessage(cause: unknown, fallback: string) {
  if (cause instanceof Error && cause.message) return cause.message;
  if (cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string') return cause.message;
  return fallback;
}

export function ProjectTaskManager({ tenantId, projectId, members }: { tenantId: string; projectId: string; members: MemberOption[] }) {
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
  const requestSequence = useRef(0);

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
      setNotice('Task created and assigned.'); refresh();
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to create this task.'));
    } finally { setSaving(false); }
  }

  async function callTaskAction(rpc: string, args: Record<string, unknown>, message: string) {
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await supabase.rpc(rpc, args as never);
      if (result.error) throw result.error;
      setNotice(message); refresh();
    } catch (cause) {
      setError(errorMessage(cause, 'Unable to update this task.'));
    } finally { setSaving(false); }
  }

  return <section aria-label="Project task management" className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h4 className="font-semibold text-slate-900">Project tasks</h4><p className="mt-1 text-xs text-slate-600">Task assignments and feedback are tracked separately. Reviews never hold up completion.</p></div>
      <div className="flex gap-2">
        <button type="button" onClick={() => { setNotice(''); refresh(); }} disabled={loading || saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true"/>Refresh</button>
        <button type="button" onClick={() => { setShowCreate(open => !open); setError(''); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#085587] px-3 text-sm font-medium text-white"><Plus className="h-4 w-4" aria-hidden="true"/>{showCreate ? 'Close' : 'New task'}</button>
      </div>
    </div>
    {notice && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {error && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><p role="alert">{error}</p><button type="button" onClick={refresh} className="min-h-9 rounded-md border border-rose-300 bg-white px-3">Retry</button></div>}
    {showCreate && <form onSubmit={createTask} className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-4" aria-label="Create project task">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-600">Task title *<input required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"/></label>
        <label className="text-xs font-medium text-slate-600">Due date<input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"/></label>
        <label className="text-xs font-medium text-slate-600 sm:col-span-2">Description<textarea rows={2} maxLength={4000} value={description} onChange={event => setDescription(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></label>
      </div>
      <fieldset><legend className="text-xs font-medium text-slate-700">Assign project members *</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{members.filter(member => member.status === 'active').map(member => <label key={member.id} className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm"><input type="checkbox" checked={selectedMembers.includes(member.id)} onChange={event => setSelectedMembers(value => event.target.checked ? [...value, member.id] : value.filter(id => id !== member.id))}/><span>{member.employee_name} <span className="text-xs text-slate-500">{member.employee_number}</span></span></label>)}</div></fieldset>
      <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => { setShowCreate(false); setTitle(''); setDescription(''); setDueDate(''); setSelectedMembers([]); }} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm">Cancel</button><button type="submit" disabled={saving || !selectedMembers.length} className="min-h-10 rounded-lg bg-[#085587] px-4 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Saving…' : 'Create task'}</button></div>
    </form>}
    {loading ? <p role="status" className="mt-4 rounded-lg bg-white p-4 text-sm text-slate-600">Loading project tasks…</p> : tasks.length === 0 ? <p role="status" className="mt-4 rounded-lg bg-white p-4 text-sm text-slate-600">No project tasks yet.</p> :
      <div className="mt-4 space-y-3">{tasks.map(task => <article key={task.id} className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h5 className="break-words font-semibold text-slate-900">{task.title}</h5>{task.description && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{task.description}</p>}<p className="mt-1 text-xs text-slate-500">Due: {task.due_date || 'Not set'} · {task.members.filter(member => !member.released_at).length} assigned</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{task.status.replace('_', ' ')}</span></div>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label={`${task.title} members`}>{task.members.map(member => <li key={member.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-xs text-slate-700">{member.employee_name}{member.released_at ? ' · released' : ''}{!member.released_at && task.status !== 'completed' && <button type="button" aria-label={`Release ${member.employee_name} from ${task.title}`} disabled={saving} onClick={() => { if (window.confirm(`Release ${member.employee_name} from this task? Overlapping collaborators will receive a required peer review.`)) void callTaskAction('hris_release_project_task_member', { p_tenant_id: tenantId, p_task_assignment_id: member.id }, 'Member released. Peer-review obligations are tracked as Feedback Pending.'); }} className="grid h-7 w-7 place-items-center rounded-full hover:bg-rose-100"><X className="h-3.5 w-3.5" aria-hidden="true"/></button>}</li>)}</ul>
        {task.status !== 'completed' && <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1 text-xs font-medium text-slate-600">Add project member<select aria-label={`Add member to ${task.title}`} value={addMember[task.id] || ''} onChange={event => setAddMember(value => ({ ...value, [task.id]: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Select member</option>{members.filter(member => member.status === 'active' && !task.members.some(existing => existing.project_allocation_id === member.id && !existing.released_at)).map(member => <option key={member.id} value={member.id}>{member.employee_name}</option>)}</select></label>
          <button type="button" disabled={saving || !addMember[task.id]} onClick={() => void callTaskAction('hris_assign_project_task_member', { p_tenant_id: tenantId, p_task_id: task.id, p_project_allocation_id: addMember[task.id] }, 'Task member added.') } className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50">Add member</button>
        </div>}
        {task.feedback_pending > 0 && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">Feedback Pending · {task.feedback_pending} required reviews</p>}
        <div className="mt-3 flex flex-wrap justify-end gap-2">{task.status === 'open' && <button type="button" disabled={saving} onClick={() => void callTaskAction('hris_start_project_task', { p_tenant_id: tenantId, p_task_id: task.id }, 'Task started.')} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm">Start task</button>}{task.status !== 'completed' && <button type="button" disabled={saving} onClick={() => { if (window.confirm('Mark this operational task complete? Outstanding reviews remain tracked separately.')) void callTaskAction('hris_complete_project_task', { p_tenant_id: tenantId, p_task_id: task.id }, 'Task completed. Peer reviews remain separately tracked as Feedback Pending.'); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#085587] px-3 text-sm font-medium text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" aria-hidden="true"/>{saving ? 'Saving…' : 'Mark complete'}</button>}</div>
      </article>)}</div>}
  </section>;
}

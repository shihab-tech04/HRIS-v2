import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { BriefcaseBusiness, Plus, RefreshCw, Search, Users, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ProjectTaskManager } from './ProjectTaskManager';

type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed';
type AllocationStatus = 'active' | 'upcoming' | 'released';
type EmployeeOption = { id: string; employee_number: string; full_name: string };
type Allocation = {
  id: string; employee_id: string; employee_name: string; employee_number: string;
  role_on_project: string; allocation_percentage: number; assigned_date: string;
  release_date: string | null; status: AllocationStatus;
};
type Project = {
  id: string; code: string; name: string; client_name: string | null; description: string | null;
  project_lead_id: string; project_lead_name: string; start_date: string;
  target_end_date: string | null; status: ProjectStatus; can_manage: boolean; allocations: Allocation[];
};
type Workspace = { projects: Project[]; employees: EmployeeOption[]; can_create: boolean };
type ProjectForm = {
  code: string; name: string; clientName: string; description: string; leadId: string;
  startDate: string; endDate: string; status: ProjectStatus;
};
type AllocationForm = {
  employeeId: string; role: string; percentage: string; assignedDate: string; releaseDate: string;
};

function localToday() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

const emptyProjectForm = (): ProjectForm => ({
  code: '', name: '', clientName: '', description: '', leadId: '',
  startDate: localToday(), endDate: '', status: 'planning',
});

const emptyAllocationForm = (): AllocationForm => ({
  employeeId: '', role: 'Member', percentage: '100', assignedDate: localToday(), releaseDate: '',
});

const statusLabels: Record<ProjectStatus, string> = {
  planning: 'Planning', active: 'Active', on_hold: 'On hold', completed: 'Completed',
};

export function OrganizationProjects({ tenantId }: { tenantId: string }) {
  const [workspace, setWorkspace] = useState<Workspace>({ projects: [], employees: [], can_create: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [projectForm, setProjectForm] = useState<ProjectForm>(emptyProjectForm);
  const [allocationProject, setAllocationProject] = useState<string | null>(null);
  const [allocationForm, setAllocationForm] = useState<AllocationForm>(emptyAllocationForm);
  const [revision, setRevision] = useState(0);
  const requestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  activeTenantId.current = tenantId;

  useEffect(() => {
    setSearch('');
    setStatusFilter('all');
    setShowCreate(false);
    setProjectForm(emptyProjectForm());
    setAllocationProject(null);
    setAllocationForm(emptyAllocationForm());
    setNotice('');
  }, [tenantId]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    setWorkspace({ projects: [], employees: [], can_create: false });
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('hris_get_tenant_project_workspace', { p_tenant_id: tenantId });
        if (requestId !== requestSequence.current || activeTenantId.current !== tenantId) return;
        if (rpcError) throw rpcError;
        const value = data as Workspace | null;
        if (!value || !Array.isArray(value.projects) || !Array.isArray(value.employees)) {
          throw new Error('Project workspace returned an invalid response.');
        }
        setWorkspace(value);
      } catch (cause) {
        if (requestId === requestSequence.current && activeTenantId.current === tenantId) {
          setError(cause instanceof Error ? cause.message : 'Unable to load projects.');
        }
      } finally {
        if (requestId === requestSequence.current && activeTenantId.current === tenantId) setLoading(false);
      }
    })();
    return () => { requestSequence.current += 1; };
  }, [tenantId, revision]);

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return workspace.projects.filter(project => {
      if (statusFilter !== 'all' && project.status !== statusFilter) return false;
      return !query || [project.name, project.code, project.client_name || '', project.project_lead_name]
        .some(value => value.toLocaleLowerCase().includes(query));
    });
  }, [workspace.projects, search, statusFilter]);

  const activeProjectCount = workspace.projects.filter(project => project.status === 'active').length;
  const activeAllocationCount = workspace.projects.reduce((count, project) =>
    count + project.allocations.filter(allocation => allocation.status === 'active').length, 0);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await supabase.rpc('hris_create_tenant_project', {
        p_tenant_id: tenantId,
        p_code: projectForm.code.trim(),
        p_name: projectForm.name.trim(),
        p_client_name: projectForm.clientName.trim() || null,
        p_description: projectForm.description.trim() || null,
        p_project_lead_id: projectForm.leadId,
        p_start_date: projectForm.startDate,
        p_target_end_date: projectForm.endDate || null,
        p_status: projectForm.status,
      });
      if (result.error) throw result.error;
      setNotice('Project created.');
      setShowCreate(false);
      setProjectForm(emptyProjectForm());
      setRevision(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create the project.');
    } finally {
      setSaving(false);
    }
  }

  async function assignAllocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allocationProject) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await supabase.rpc('hris_assign_tenant_project_allocation', {
        p_tenant_id: tenantId,
        p_project_id: allocationProject,
        p_employee_id: allocationForm.employeeId,
        p_role_on_project: allocationForm.role.trim() || 'Member',
        p_allocation_percentage: Number(allocationForm.percentage),
        p_assigned_date: allocationForm.assignedDate,
        p_release_date: allocationForm.releaseDate || null,
      });
      if (result.error) throw result.error;
      setNotice('Project allocation saved. The 100% limit was checked by the organization service.');
      setAllocationProject(null);
      setAllocationForm(emptyAllocationForm());
      setRevision(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to assign this employee.');
    } finally {
      setSaving(false);
    }
  }

  async function releaseAllocation(allocation: Allocation) {
    if (!window.confirm(`Release ${allocation.employee_name} from this project? Their employment status will not change.`)) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await supabase.rpc('hris_release_tenant_project_allocation', {
        p_tenant_id: tenantId, p_allocation_id: allocation.id,
      });
      if (result.error) throw result.error;
      setNotice(`${allocation.employee_name} was released from the project. Employment status is unchanged.`);
      setRevision(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to release this allocation.');
    } finally {
      setSaving(false);
    }
  }

  return <section aria-labelledby="organization-projects-heading" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="organization-projects-heading" className="text-2xl font-medium text-[#49454F]">Projects &amp; Resource Allocation</h2>
        <p className="mt-1 text-sm text-slate-500">Project reporting and employee allocation are separate from employment status.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {workspace.can_create && <button type="button" onClick={() => { setShowCreate(open => !open); setError(''); }}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#085587] px-3 text-sm font-medium text-white hover:bg-[#074770] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#085587]">
          {showCreate ? <X className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          {showCreate ? 'Close form' : 'New project'}
        </button>}
        <button type="button" onClick={() => setRevision(value => value + 1)} disabled={loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#085587] disabled:opacity-50">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
        </button>
      </div>
    </div>

    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <p role="alert">{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">Retry</button>
    </div>}

    <div className="grid gap-3 sm:grid-cols-3">
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">Projects</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{workspace.projects.length.toLocaleString()}</p></article>
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">Active projects</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{activeProjectCount.toLocaleString()}</p></article>
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Users className="h-4 w-4 text-[#08558B]" aria-hidden="true" />Active allocations</div><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{activeAllocationCount.toLocaleString()}</p></article>
    </div>

    {showCreate && workspace.can_create && <form onSubmit={createProject} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="create-project-heading">
      <div className="border-b border-slate-100 pb-3"><h3 id="create-project-heading" className="font-semibold text-slate-900">Create project workspace</h3><p className="mt-1 text-xs text-slate-500">Project code and name are required. The Project Manager must be an active employee in this organization.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div><label htmlFor="project-code" className="mb-1 block text-xs font-medium text-slate-600">Project code <span aria-hidden="true">*</span></label><input id="project-code" required maxLength={32} value={projectForm.code} onChange={event => setProjectForm(form => ({ ...form, code: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
        <div><label htmlFor="project-name" className="mb-1 block text-xs font-medium text-slate-600">Project name <span aria-hidden="true">*</span></label><input id="project-name" required maxLength={128} value={projectForm.name} onChange={event => setProjectForm(form => ({ ...form, name: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
        <div><label htmlFor="project-client" className="mb-1 block text-xs font-medium text-slate-600">Client</label><input id="project-client" maxLength={128} value={projectForm.clientName} onChange={event => setProjectForm(form => ({ ...form, clientName: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
        <div><label htmlFor="project-lead" className="mb-1 block text-xs font-medium text-slate-600">Project Manager <span aria-hidden="true">*</span></label><select id="project-lead" required value={projectForm.leadId} onChange={event => setProjectForm(form => ({ ...form, leadId: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Select an employee</option>{workspace.employees.map(employee => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.employee_number}</option>)}</select></div>
        <div><label htmlFor="project-start-date" className="mb-1 block text-xs font-medium text-slate-600">Start date <span aria-hidden="true">*</span></label><input id="project-start-date" required type="date" value={projectForm.startDate} onChange={event => setProjectForm(form => ({ ...form, startDate: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
        <div><label htmlFor="project-end-date" className="mb-1 block text-xs font-medium text-slate-600">Target end date</label><input id="project-end-date" type="date" min={projectForm.startDate} value={projectForm.endDate} onChange={event => setProjectForm(form => ({ ...form, endDate: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
        <div><label htmlFor="project-status" className="mb-1 block text-xs font-medium text-slate-600">Status</label><select id="project-status" value={projectForm.status} onChange={event => setProjectForm(form => ({ ...form, status: event.target.value as ProjectStatus }))} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="sm:col-span-2"><label htmlFor="project-description" className="mb-1 block text-xs font-medium text-slate-600">Description</label><textarea id="project-description" rows={2} value={projectForm.description} onChange={event => setProjectForm(form => ({ ...form, description: event.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
      </div>
      <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => { setShowCreate(false); setProjectForm(emptyProjectForm()); }} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm">Cancel</button><button type="submit" disabled={saving || workspace.employees.length === 0} className="min-h-11 rounded-lg bg-[#085587] px-4 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Saving…' : 'Create project'}</button></div>
    </form>}

    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="min-w-[220px] flex-1"><label htmlFor="organization-project-search" className="mb-1 block text-xs font-medium text-slate-600">Search projects</label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" aria-hidden="true" /><input id="organization-project-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, code, client, or Project Manager" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-[#085587]" /></div></div>
      <div className="w-full sm:w-52"><label htmlFor="organization-project-status" className="mb-1 block text-xs font-medium text-slate-600">Project status</label><select id="organization-project-status" value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="all">All projects</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <p className="text-xs text-slate-500" aria-live="polite">{visibleProjects.length.toLocaleString()} shown</p>
    </div>

    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading authorized project data…</p> : visibleProjects.length === 0 ?
      <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{workspace.projects.length ? 'No projects match these filters.' : 'No project workspaces have been created for this organization yet.'}</p> :
      <div className="space-y-3">{visibleProjects.map(project => <article key={project.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
          <div className="flex min-w-0 items-start gap-3"><span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#EFF7F8] text-[#08558B]"><BriefcaseBusiness className="h-5 w-5" aria-hidden="true" /></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{project.code}{project.client_name ? ` · ${project.client_name}` : ''}</p><h3 className="mt-1 break-words text-lg font-semibold text-slate-900">{project.name}</h3><p className="mt-1 text-sm text-slate-600">Project Manager: {project.project_lead_name} · {project.start_date}{project.target_end_date ? ` – ${project.target_end_date}` : ''}</p>{project.description && <p className="mt-2 max-w-3xl text-sm text-slate-600">{project.description}</p>}</div></div>
          <div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">{statusLabels[project.status]}</span>{project.can_manage && project.status !== 'completed' && <button type="button" onClick={() => { setAllocationProject(current => current === project.id ? null : project.id); setAllocationForm(emptyAllocationForm()); setError(''); }} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium hover:border-[#085587]">Assign employee</button>}</div>
        </div>
        {allocationProject === project.id && project.can_manage && <form onSubmit={assignAllocation} className="grid gap-3 border-b border-slate-100 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-6" aria-label={`Assign employee to ${project.name}`}>
          <div className="sm:col-span-2"><label htmlFor={`allocation-employee-${project.id}`} className="mb-1 block text-xs font-medium text-slate-600">Employee</label><select id={`allocation-employee-${project.id}`} required value={allocationForm.employeeId} onChange={event => setAllocationForm(form => ({ ...form, employeeId: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Select an employee</option>{workspace.employees.map(employee => <option key={employee.id} value={employee.id}>{employee.full_name} · {employee.employee_number}</option>)}</select></div>
          <div><label htmlFor={`allocation-role-${project.id}`} className="mb-1 block text-xs font-medium text-slate-600">Project role</label><input id={`allocation-role-${project.id}`} maxLength={64} value={allocationForm.role} onChange={event => setAllocationForm(form => ({ ...form, role: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></div>
          <div><label htmlFor={`allocation-percentage-${project.id}`} className="mb-1 block text-xs font-medium text-slate-600">Allocation %</label><input id={`allocation-percentage-${project.id}`} required type="number" min="0.01" max="100" step="0.01" value={allocationForm.percentage} onChange={event => setAllocationForm(form => ({ ...form, percentage: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></div>
          <div><label htmlFor={`allocation-start-${project.id}`} className="mb-1 block text-xs font-medium text-slate-600">Assigned date</label><input id={`allocation-start-${project.id}`} required type="date" value={allocationForm.assignedDate} onChange={event => setAllocationForm(form => ({ ...form, assignedDate: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></div>
          <div><label htmlFor={`allocation-release-${project.id}`} className="mb-1 block text-xs font-medium text-slate-600">Planned release</label><input id={`allocation-release-${project.id}`} type="date" min={allocationForm.assignedDate} value={allocationForm.releaseDate} onChange={event => setAllocationForm(form => ({ ...form, releaseDate: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></div>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-6"><p className="mr-auto text-xs text-slate-600">Overlapping allocations are capped at 100% and checked when saved.</p><button type="button" onClick={() => setAllocationProject(null)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm">Cancel</button><button type="submit" disabled={saving || workspace.employees.length === 0} className="min-h-11 rounded-lg bg-[#085587] px-4 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save allocation'}</button></div>
        </form>}
        <div className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold text-slate-800">Resource allocation</h4><span className="text-xs text-slate-500">{project.allocations.length.toLocaleString()} records</span></div>
          {!project.allocations.length ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No employees are assigned to this project.</p> :
            <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th scope="col" className="px-3 py-3">Employee</th><th scope="col" className="px-3 py-3">Project role</th><th scope="col" className="px-3 py-3">Allocation</th><th scope="col" className="px-3 py-3">Assigned</th><th scope="col" className="px-3 py-3">Release</th><th scope="col" className="px-3 py-3">Status</th>{project.can_manage && <th scope="col" className="px-3 py-3">Action</th>}</tr></thead><tbody className="divide-y divide-slate-100">{project.allocations.map(allocation => <tr key={allocation.id}><td className="px-3 py-3"><span className="font-medium text-slate-900">{allocation.employee_name}</span><span className="ml-2 text-xs text-slate-500">{allocation.employee_number}</span></td><td className="px-3 py-3">{allocation.role_on_project}</td><td className="px-3 py-3 tabular-nums">{Number(allocation.allocation_percentage).toLocaleString()}%</td><td className="px-3 py-3">{allocation.assigned_date}</td><td className="px-3 py-3">{allocation.release_date || '—'}</td><td className="px-3 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">{allocation.status}</span></td>{project.can_manage && <td className="px-3 py-3">{allocation.status !== 'released' ? <button type="button" disabled={saving} onClick={() => void releaseAllocation(allocation)} className="min-h-9 rounded-md border border-slate-300 px-2.5 text-xs font-medium hover:border-rose-400 disabled:opacity-50">Release</button> : <span className="text-xs text-slate-500">Released</span>}</td>}</tr>)}</tbody></table></div>}
        </div>
        {project.can_manage && <ProjectTaskManager tenantId={tenantId} projectId={project.id}
          members={project.allocations.map(allocation => ({
            id: allocation.id, employee_name: allocation.employee_name,
            employee_number: allocation.employee_number, status: allocation.status,
          }))} />}
      </article>)}</div>}
  </section>;
}

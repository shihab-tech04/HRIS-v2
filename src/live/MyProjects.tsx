import { useEffect, useMemo, useRef, useState } from 'react';
import { BriefcaseBusiness, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';

type AllocationStatus = 'active' | 'upcoming' | 'released';
type ProjectAllocation = {
  allocation_id: string; project_id: string; project_code: string; project_name: string;
  client_name: string | null; project_lead_name: string; project_status: string;
  role_on_project: string; allocation_percentage: number; assigned_date: string;
  release_date: string | null; status: AllocationStatus;
};

export function MyProjects({ tenantId }: { tenantId: string }) {
  const [projects, setProjects] = useState<ProjectAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | AllocationStatus>('all');
  const [revision, setRevision] = useState(0);
  const requestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  activeTenantId.current = tenantId;

  useEffect(() => { setSearch(''); setStatus('all'); }, [tenantId]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    setProjects([]); setLoading(true); setError('');
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('hris_get_my_projects', { p_tenant_id: tenantId });
        if (requestId !== requestSequence.current || activeTenantId.current !== tenantId) return;
        if (rpcError) throw rpcError;
        const rows = (data as { projects?: ProjectAllocation[] } | null)?.projects;
        if (!Array.isArray(rows)) throw new Error('Your project data returned an invalid response.');
        setProjects(rows);
      } catch (cause) {
        if (requestId === requestSequence.current && activeTenantId.current === tenantId) {
          setError(cause instanceof Error ? cause.message : 'Unable to load your projects.');
        }
      } finally {
        if (requestId === requestSequence.current && activeTenantId.current === tenantId) setLoading(false);
      }
    })();
    return () => { requestSequence.current += 1; };
  }, [tenantId, revision]);

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return projects.filter(project => (status === 'all' || project.status === status)
      && (!query || [project.project_name, project.project_code, project.client_name || '', project.project_lead_name]
        .some(value => value.toLocaleLowerCase().includes(query))));
  }, [projects, search, status]);
  const activeProjects = projects.filter(project => project.status === 'active').length;
  const currentAllocation = projects.filter(project => project.status === 'active')
    .reduce((total, project) => total + Number(project.allocation_percentage), 0);

  return <section aria-labelledby="my-projects-heading" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="my-projects-heading" className="text-2xl font-medium text-[#49454F]">My Projects &amp; Allocations</h2><p className="mt-1 text-sm text-slate-500">Project reporting is separate from your organizational manager and employment status.</p></div>
      <button type="button" onClick={() => setRevision(value => value + 1)} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#085587] disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />Refresh</button>
    </div>
    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p role="alert">{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">Retry</button></div>}
    <div className="grid gap-3 sm:grid-cols-3"><article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">Allocation records</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{projects.length.toLocaleString()}</p></article><article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">Active project roles</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{activeProjects.toLocaleString()}</p></article><article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">Current allocated time</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{currentAllocation.toLocaleString()}%</p></article></div>
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="min-w-[220px] flex-1"><label htmlFor="my-project-search" className="mb-1 block text-xs font-medium text-slate-600">Search projects</label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" aria-hidden="true"/><input id="my-project-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Project, code, client, or lead" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-[#085587]"/></div></div><div className="w-full sm:w-52"><label htmlFor="my-project-status" className="mb-1 block text-xs font-medium text-slate-600">Allocation status</label><select id="my-project-status" value={status} onChange={event => setStatus(event.target.value as typeof status)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="all">All allocations</option><option value="active">Active</option><option value="upcoming">Upcoming</option><option value="released">Released</option></select></div><p className="text-xs text-slate-500" aria-live="polite">{visibleProjects.length.toLocaleString()} shown</p></div>
    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading your project allocations…</p> : visibleProjects.length === 0 ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{projects.length ? 'No allocations match these filters.' : 'You do not have any project allocations in this organization.'}</p> :
      <div className="grid gap-3 lg:grid-cols-2">{visibleProjects.map(project => <article key={project.allocation_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#EFF7F8] text-[#08558B]"><BriefcaseBusiness className="h-5 w-5" aria-hidden="true"/></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{project.project_code}{project.client_name ? ` · ${project.client_name}` : ''}</p><h3 className="mt-1 break-words text-lg font-semibold text-slate-900">{project.project_name}</h3><p className="mt-1 text-sm text-slate-600">Project lead: {project.project_lead_name}</p></div></div><span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{project.status}</span></div><dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm"><div><dt className="text-xs text-slate-500">Your role</dt><dd className="mt-1 font-medium text-slate-800">{project.role_on_project}</dd></div><div><dt className="text-xs text-slate-500">Allocation</dt><dd className="mt-1 font-medium tabular-nums text-slate-800">{Number(project.allocation_percentage).toLocaleString()}%</dd></div><div><dt className="text-xs text-slate-500">Assigned</dt><dd className="mt-1 text-slate-800">{project.assigned_date}</dd></div><div><dt className="text-xs text-slate-500">Release date</dt><dd className="mt-1 text-slate-800">{project.release_date || 'Not set'}</dd></div></dl></article>)}</div>}
    <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">A project allocation change affects project assignment only; it does not change your employment record.</p>
  </section>;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Download, RefreshCw, Search, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { downloadCsv } from './csv';
import { readAllOrganizationPages } from './organizationTeamsPages.mjs';

type TeamRow = {
  id: string;
  name: string;
  code: string;
  department_id: string | null;
  active: boolean;
};
type DepartmentRow = { id: string; name: string };

export function OrganizationTeams({ tenantId }: { tenantId: string }) {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [retryKey, setRetryKey] = useState(0);
  const requestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  activeTenantId.current = tenantId;

  useEffect(() => {
    setSearch('');
    setStatusFilter('active');
  }, [tenantId]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    setTeams([]);
    setDepartments([]);
    setLoading(true);
    setError('');

    async function load() {
      try {
        const isCurrent = () => requestId === requestSequence.current && activeTenantId.current === tenantId;
        const [loadedTeams, loadedDepartments] = await Promise.all([
          readAllOrganizationPages(async (start, end) => {
            const result = await supabase.from('teams')
              .select('id,name,code,department_id,active')
              .eq('tenant_id', tenantId)
              .order('name', { ascending: true })
              .order('id', { ascending: true })
              .range(start, end);
            return { data: result.data as TeamRow[] | null, error: result.error };
          }, isCurrent),
          readAllOrganizationPages(async (start, end) => {
            const result = await supabase.from('departments')
              .select('id,name')
              .eq('tenant_id', tenantId)
              .order('name', { ascending: true })
              .order('id', { ascending: true })
              .range(start, end);
            return { data: result.data as DepartmentRow[] | null, error: result.error };
          }, isCurrent),
        ]);
        if (!isCurrent()) return;
        setTeams(loadedTeams);
        setDepartments(loadedDepartments);
      } catch (cause) {
        if (requestId === requestSequence.current && activeTenantId.current === tenantId) {
          setError(cause instanceof Error ? cause.message : 'Unable to load organization teams.');
        }
      } finally {
        if (requestId === requestSequence.current && activeTenantId.current === tenantId) setLoading(false);
      }
    }

    void load();
    return () => { requestSequence.current += 1; };
  }, [tenantId, retryKey]);

  const departmentNames = useMemo(() => new Map(departments.map(department => [department.id, department.name])), [departments]);
  const visibleTeams = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return teams.filter(team => {
      if (statusFilter === 'active' && team.active !== true) return false;
      if (statusFilter === 'inactive' && team.active === true) return false;
      if (!query) return true;
      const departmentName = departmentNames.get(team.department_id || '') || '';
      return [team.name, team.code, departmentName].some(value => value.toLocaleLowerCase().includes(query));
    });
  }, [teams, statusFilter, search, departmentNames]);
  const activeCount = teams.filter(team => team.active === true).length;
  const departmentCount = new Set(teams.map(team => team.department_id).filter(Boolean)).size;

  function exportVisibleTeams() {
    downloadCsv(`organization-teams-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Team', 'Code', 'Department', 'Status'],
      visibleTeams.map(team => [team.name, team.code, departmentNames.get(team.department_id || '') || '', team.active ? 'Active' : 'Inactive']));
  }

  return <section aria-labelledby="organization-teams-heading" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="organization-teams-heading" className="text-2xl font-medium text-[#49454F]">Teams</h2>
        <p className="mt-1 text-sm text-slate-500">Teams and departments in your current organization</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={exportVisibleTeams} disabled={loading || Boolean(error) || visibleTeams.length === 0}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#085587] disabled:opacity-50">
          <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
        </button>
        <button type="button" onClick={() => setRetryKey(value => value + 1)} disabled={loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#085587] disabled:opacity-50">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
        </button>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Users className="h-4 w-4 text-[#08558B]" aria-hidden="true" />Total teams</div>
        <p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{teams.length.toLocaleString()}</p>
      </article>
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Building2 className="h-4 w-4 text-[#08558B]" aria-hidden="true" />Active teams</div>
        <p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{activeCount.toLocaleString()}</p>
      </article>
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Building2 className="h-4 w-4 text-[#08558B]" aria-hidden="true" />Departments represented</div>
        <p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{departmentCount.toLocaleString()}</p>
      </article>
    </div>

    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="min-w-[220px] flex-1">
        <label htmlFor="organization-teams-search" className="mb-1 block text-xs font-medium text-slate-600">Search teams</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          <input id="organization-teams-search" type="search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Name, code, or department" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-[#085587]" />
        </div>
      </div>
      <div className="w-full sm:w-52">
        <label htmlFor="organization-teams-status" className="mb-1 block text-xs font-medium text-slate-600">Team status</label>
        <select id="organization-teams-status" value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}
          className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#085587]">
          <option value="active">Active teams</option>
          <option value="inactive">Inactive teams</option>
          <option value="all">All teams</option>
        </select>
      </div>
      <p className="text-xs text-slate-500" aria-live="polite">{visibleTeams.length.toLocaleString()} shown</p>
    </div>

    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <p role="alert">Unable to load teams: {error}</p>
      <button type="button" onClick={() => setRetryKey(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium focus-visible:outline-2 focus-visible:outline-[#085587]">Retry</button>
    </div>}

    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {loading ? <p role="status" className="p-5 text-sm text-slate-600">Loading teams…</p>
        : error ? <p className="p-5 text-sm text-slate-600">Team data is unavailable until the connection recovers.</p>
          : visibleTeams.length === 0 ? <p className="p-5 text-sm text-slate-600">{teams.length === 0 ? 'No teams are configured for this organization.' : 'No teams match these filters.'}</p>
          : <div role="region" aria-label="Scrollable teams table" tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-[#08558B]">
            <table aria-label="Organization teams" className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-[#EFF7F8] text-xs text-slate-600"><tr>
                {['Team', 'Code', 'Department', 'Status'].map(label => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">{visibleTeams.map(team => <tr key={team.id}>
                <td className="px-4 py-3 font-medium text-[#08263D]">{team.name}</td>
                <td className="px-4 py-3 text-slate-600">{team.code || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{departmentNames.get(team.department_id || '') || '—'}</td>
                <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${team.active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                  {team.active ? 'Active' : 'Inactive'}
                </span></td>
              </tr>)}</tbody>
            </table>
          </div>}
    </div>
  </section>;
}

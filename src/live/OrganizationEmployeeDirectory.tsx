import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Download, RefreshCw, Search, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { downloadCsv } from './csv';

type EmployeeRow = {
  employee_id: string;
  employee_number: string;
  full_name: string;
  department_id: string | null;
  department_name: string | null;
  designation_title: string | null;
  team_name: string | null;
  employment_status: string;
};
type DirectoryPayload = {
  employees?: EmployeeRow[];
  departments?: { id: string; name: string }[];
  available_statuses?: string[];
  total_count?: number;
};

const PAGE_SIZE = 50;

function statusLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export function OrganizationEmployeeDirectory({ tenantId }: { tenantId: string }) {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedDepartmentId, setAppliedDepartmentId] = useState('');
  const [appliedStatus, setAppliedStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  activeTenantId.current = tenantId;

  useEffect(() => {
    setSearch('');
    setDepartmentId('');
    setStatus('');
    setAppliedSearch('');
    setAppliedDepartmentId('');
    setAppliedStatus('');
    setOffset(0);
  }, [tenantId]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    const requestTenant = tenantId;
    setEmployees([]);
    setDepartments([]);
    setStatuses([]);
    setTotalCount(0);
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const result = await supabase.rpc('hris_get_tenant_employee_directory', {
          p_tenant_id: requestTenant,
          p_search: appliedSearch || null,
          p_department_id: appliedDepartmentId || null,
          p_status: appliedStatus || null,
          p_limit: PAGE_SIZE,
          p_offset: offset,
        });
        if (requestId !== requestSequence.current || activeTenantId.current !== requestTenant) return;
        if (result.error) throw result.error;
        const payload = result.data as DirectoryPayload | null;
        if (!payload || !Array.isArray(payload.employees) || !Array.isArray(payload.departments)
          || !Array.isArray(payload.available_statuses) || typeof payload.total_count !== 'number') {
          throw new Error('Employee directory returned an invalid response.');
        }
        setEmployees(payload.employees);
        setDepartments(payload.departments);
        setStatuses(payload.available_statuses);
        setTotalCount(payload.total_count);
      } catch {
        if (requestId !== requestSequence.current || activeTenantId.current !== requestTenant) return;
        setEmployees([]);
        setDepartments([]);
        setStatuses([]);
        setTotalCount(0);
        setError('Unable to load employees for this organization. Check your employee-directory access and try again.');
      } finally {
        if (requestId === requestSequence.current && activeTenantId.current === requestTenant) setLoading(false);
      }
    })();
    return () => { requestSequence.current += 1; };
  }, [tenantId, appliedSearch, appliedDepartmentId, appliedStatus, offset, revision]);

  const first = totalCount === 0 ? 0 : offset + 1;
  const last = Math.min(offset + employees.length, totalCount);
  const visibleDepartmentName = useMemo(() => new Map(departments.map(item => [item.id, item.name])), [departments]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setAppliedSearch(search.trim());
    setAppliedDepartmentId(departmentId);
    setAppliedStatus(status);
  }

  function exportPage() {
    downloadCsv(`employee-directory-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Employee', 'Employee number', 'Department', 'Designation', 'Team', 'Employment status'],
      employees.map(employee => [employee.full_name, employee.employee_number,
        employee.department_name || '', employee.designation_title || '', employee.team_name || '',
        statusLabel(employee.employment_status)]));
  }

  return <section aria-labelledby="employee-directory-heading" className="space-y-4">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 id="employee-directory-heading" className="text-2xl font-medium text-[#49454F]">Employee directory</h2>
        <p className="mt-1 text-sm text-slate-500">Authorized employee records for your current organization.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={loading || employees.length === 0} onClick={exportPage}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
          <Download className="h-4 w-4" aria-hidden="true" /> Export current page
        </button>
        <button type="button" aria-label="Refresh employee directory" disabled={loading} onClick={() => setRevision(value => value + 1)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
        </button>
      </div>
    </header>

    <form onSubmit={applyFilters} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_220px_200px_auto]">
      <label className="relative block text-xs font-medium text-slate-600">
        Search employees
        <Search className="pointer-events-none absolute left-3 top-[2.35rem] h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input type="search" value={search} onChange={event => setSearch(event.target.value)}
          aria-label="Search employees" placeholder="Name, employee number, team or role"
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm" />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Department
        <select aria-label="Filter employees by department" value={departmentId} onChange={event => setDepartmentId(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
          <option value="">All departments</option>
          {departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Employment status
        <select aria-label="Filter employees by employment status" value={status} onChange={event => setStatus(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
          <option value="">All statuses</option>
          {statuses.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}
        </select>
      </label>
      <div className="flex items-end"><button type="submit" disabled={loading}
        className="min-h-11 w-full rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto">Apply filters</button></div>
    </form>

    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <p>{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">Retry</button>
    </div>}

    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-sm">
        <h3 className="inline-flex items-center gap-2 font-medium text-slate-800"><Users className="h-4 w-4 text-[#08558B]" aria-hidden="true" />Employees</h3>
        <p aria-live="polite" className="text-slate-500">{first}–{last} of {totalCount}</p>
      </div>
      {loading ? <p role="status" className="p-5 text-sm text-slate-600">Loading authorized employees…</p>
        : error ? <p className="p-5 text-sm text-slate-600">Employee data is unavailable until the connection recovers.</p>
          : employees.length === 0 ? <div className="p-6 text-center">
            <p className="font-medium text-slate-800">{totalCount ? 'No employees on this page' : 'No employees found'}</p>
            <p className="mt-1 text-sm text-slate-600">Adjust the filters or refresh to check the current organization again.</p>
          </div> : <>
            <ul className="divide-y divide-slate-100 md:hidden">{employees.map(employee => <li key={employee.employee_id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-semibold text-slate-900">{employee.full_name}</p><p className="mt-1 text-xs text-slate-500">{employee.employee_number}</p></div>
                <span className="w-fit shrink-0 rounded-full bg-[#EFF7F8] px-2.5 py-1 text-xs font-medium text-[#085587]">{statusLabel(employee.employment_status)}</span></div>
              <p className="break-words text-sm text-slate-700">{employee.designation_title || 'Designation unavailable'}</p>
              <p className="break-words text-xs text-slate-500">{employee.department_name || 'No department'} · {employee.team_name || 'No team'}</p>
            </li>)}</ul>
            <div role="region" aria-label="Scrollable employee directory table" tabIndex={0} className="hidden overflow-x-auto focus-visible:outline-2 focus-visible:outline-[#08558B] md:block">
              <table aria-label="Organization employee directory" className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-[#EFF7F8] text-xs text-slate-600"><tr>
                  {['Employee', 'Employee number', 'Department', 'Designation', 'Team', 'Employment status'].map(label => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">{employees.map(employee => <tr key={employee.employee_id}>
                  <td className="px-4 py-3 font-medium text-[#08263D]">{employee.full_name}</td>
                  <td className="px-4 py-3 text-slate-600">{employee.employee_number || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{visibleDepartmentName.get(employee.department_id || '') || employee.department_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{employee.designation_title || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{employee.team_name || '—'}</td>
                  <td className="px-4 py-3"><span className="inline-flex rounded-full bg-[#EFF7F8] px-2.5 py-1 text-xs font-medium text-[#085587]">{statusLabel(employee.employment_status)}</span></td>
                </tr>)}</tbody>
              </table>
            </div>
          </>}
      {!loading && !error && <footer className="flex items-center justify-between gap-3 border-t border-slate-100 p-3">
        <button type="button" disabled={loading || offset === 0} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}
          className="min-h-10 rounded-md border border-slate-300 px-3 text-sm disabled:opacity-50">Previous</button>
        <p className="text-xs text-slate-500">Page size {PAGE_SIZE}</p>
        <button type="button" disabled={loading || offset + PAGE_SIZE >= totalCount} onClick={() => setOffset(value => value + PAGE_SIZE)}
          className="min-h-10 rounded-md border border-slate-300 px-3 text-sm disabled:opacity-50">Next</button>
      </footer>}
    </div>
  </section>;
}

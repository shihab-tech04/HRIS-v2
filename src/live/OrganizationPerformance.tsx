import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw, Search, Target } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { downloadCsv } from './csv';

type Goal = {
  id: string;
  employee_id: string;
  cycle_id: string | null;
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
type PerformanceCycle = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  self_review_deadline: string | null;
  manager_review_deadline: string | null;
  status: string;
};
type Appraisal = {
  id: string;
  employee_id: string;
  reviewer_employee_id: string | null;
  cycle_id: string;
  status: string;
};
type Employee = { id: string; full_name: string; employee_number: string };
type GoalFilter = 'all' | 'not_started' | 'in_progress' | 'completed' | 'cancelled';

function statusLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function dueDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'No due date';
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function OrganizationPerformance({ tenantId }: { tenantId: string }) {
  const tenantRef = useRef(tenantId);
  tenantRef.current = tenantId;
  const [goals, setGoals] = useState<Goal[]>([]);
  const [appraisals, setAppraisals] = useState<Appraisal[]>([]);
  const [cycles, setCycles] = useState<PerformanceCycle[]>([]);
  const [employees, setEmployees] = useState<Record<string, Employee>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cycleLoadError, setCycleLoadError] = useState(false);
  const [appraisalLoadError, setAppraisalLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<GoalFilter>('all');
  const [cycleFilter, setCycleFilter] = useState('all');

  async function load(isCurrent: () => boolean = () => true) {
    const requestTenantId = tenantId;
    const current = () => tenantRef.current === requestTenantId && isCurrent();
    setLoading(true);
    setError('');
    setCycleLoadError(false);
    setAppraisalLoadError(false);
    try {
      const [cycleResult, goalResult, appraisalResult] = await Promise.all([
        supabase.from('performance_cycles')
          .select('id,name,start_date,end_date,self_review_deadline,manager_review_deadline,status')
          .eq('tenant_id', requestTenantId)
          .order('start_date', { ascending: false })
          .limit(100),
        supabase.from('performance_goals')
          .select('id,employee_id,cycle_id,title,description,category,target_metric,current_progress,due_date,status,weight,origin')
          .eq('tenant_id', requestTenantId)
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(250),
        supabase.from('performance_appraisals')
          .select('id,employee_id,reviewer_employee_id,cycle_id,status')
          .eq('tenant_id', requestTenantId)
          .order('created_at', { ascending: false })
          .limit(250),
      ]);
      if (goalResult.error) throw goalResult.error;
      if (!current()) return;
      const availableCycles = cycleResult.error ? []
        : (Array.isArray(cycleResult.data) ? cycleResult.data : []) as PerformanceCycle[];
      setCycles(availableCycles);
      if (cycleResult.error) setCycleFilter('all');
      else setCycleFilter(currentFilter => currentFilter === 'all' || availableCycles.some(cycle => cycle.id === currentFilter)
        ? currentFilter
        : 'all');
      setCycleLoadError(Boolean(cycleResult.error));
      const rows = (Array.isArray(goalResult.data) ? goalResult.data : []) as Goal[];
      setGoals(rows);
      const appraisalRows = appraisalResult.error ? []
        : (Array.isArray(appraisalResult.data) ? appraisalResult.data : []) as Appraisal[];
      setAppraisals(appraisalRows);
      setAppraisalLoadError(Boolean(appraisalResult.error));
      const employeeIds = Array.from(new Set([
        ...rows.map(goal => goal.employee_id),
        ...appraisalRows.map(appraisal => appraisal.employee_id),
      ].filter(Boolean)));
      if (!employeeIds.length) { setEmployees({}); return; }

      // Employee names are optional because employee RLS can be narrower than performance RLS.
      const { data: employeeRows, error: employeeError } = await supabase.from('employees')
        .select('id,full_name,employee_number')
        .eq('tenant_id', requestTenantId)
        .in('id', employeeIds);
      if (!current()) return;
      setEmployees(employeeError ? {} : Object.fromEntries(
        ((Array.isArray(employeeRows) ? employeeRows : []) as Employee[]).map(employee => [employee.id, employee]),
      ));
    } catch (cause) {
      if (!current()) return;
      setGoals([]);
      setAppraisals([]);
      setCycles([]);
      setCycleFilter('all');
      setEmployees({});
      setAppraisalLoadError(true);
      setError(cause instanceof Error ? cause.message : 'Unable to load performance goals for this organization.');
    } finally {
      if (current()) setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    setGoals([]);
    setAppraisals([]);
    setCycles([]);
    setEmployees({});
    setCycleFilter('all');
    void load(() => active);
    return () => { active = false; };
  }, [tenantId]);

  const visibleGoals = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return goals.filter(goal => {
      if (filter !== 'all' && goal.status !== filter) return false;
      if (cycleFilter !== 'all' && goal.cycle_id !== cycleFilter) return false;
      const employee = employees[goal.employee_id];
      return !query || [goal.title, goal.description, goal.category, goal.target_metric,
        employee?.full_name || '', employee?.employee_number || '']
        .some(value => value.toLocaleLowerCase().includes(query));
    });
  }, [cycleFilter, employees, filter, goals, search]);
  const visibleAppraisals = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return appraisals.filter(appraisal => {
      if (cycleFilter !== 'all' && appraisal.cycle_id !== cycleFilter) return false;
      const employee = employees[appraisal.employee_id];
      const cycle = cycles.find(item => item.id === appraisal.cycle_id);
      return !query || [
        employee?.full_name || '',
        employee?.employee_number || '',
        cycle?.name || '',
        statusLabel(appraisal.status),
      ].some(value => value.toLocaleLowerCase().includes(query));
    });
  }, [appraisals, cycleFilter, cycles, employees, search]);
  const cycleGoals = cycleFilter === 'all' ? goals : goals.filter(goal => goal.cycle_id === cycleFilter);
  const selectedCycle = cycles.find(cycle => cycle.id === cycleFilter);
  const average = cycleGoals.length
    ? Math.round(cycleGoals.reduce((total, goal) => total + Number(goal.current_progress || 0), 0) / cycleGoals.length)
    : 0;
  const completed = cycleGoals.filter(goal => goal.status === 'completed').length;

  function exportPerformance() {
    const rows: unknown[][] = [
      ...visibleGoals.map(goal => {
        const employee = employees[goal.employee_id];
        const cycle = cycles.find(item => item.id === goal.cycle_id);
        return [
          'Goal', employee?.full_name || '', employee?.employee_number || '', cycle?.name || '',
          goal.title, goal.category, goal.target_metric, Number(goal.current_progress),
          statusLabel(goal.status), goal.due_date || '',
        ];
      }),
      ...visibleAppraisals.map(appraisal => {
        const employee = employees[appraisal.employee_id];
        const cycle = cycles.find(item => item.id === appraisal.cycle_id);
        return [
          'Appraisal', employee?.full_name || '', employee?.employee_number || '', cycle?.name || '',
          '', '', '', '', statusLabel(appraisal.status), '',
        ];
      }),
    ];
    const cyclePart = selectedCycle?.name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      || (cycleFilter === 'all' ? 'all-cycles' : 'selected-cycle');
    downloadCsv(`organization-performance-${cyclePart}-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Record type', 'Employee name', 'Employee number', 'Review cycle', 'Goal', 'Category', 'Target', 'Progress', 'Status', 'Due date'],
      rows);
  }

  return <section aria-labelledby="organization-performance-heading" className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 id="organization-performance-heading" className="text-2xl font-semibold text-[#1E1B39]">Performance</h2>
        <p className="mt-1 text-sm text-[#86929E]">Review goal progress visible to your organization role.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={loading} onClick={() => void load()} aria-label="Refresh organization performance"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#DEE0E3] bg-white px-3 text-sm font-medium text-[#1E1B39] disabled:opacity-50">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
        <button type="button" disabled={loading || (!visibleGoals.length && !visibleAppraisals.length)} onClick={exportPerformance}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#085587] bg-white px-3 text-sm font-medium text-[#085587] disabled:opacity-50">
          <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
        </button>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-[#DEE0E3] bg-white p-4"><p className="text-sm text-slate-600">Goals</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#1E1B39]">{cycleGoals.length}</p></div>
      <div className="rounded-xl border border-[#DEE0E3] bg-white p-4"><p className="text-sm text-slate-600">Average recorded progress</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#1E1B39]">{cycleGoals.length ? `${average}%` : '—'}</p></div>
      <div className="rounded-xl border border-[#DEE0E3] bg-white p-4"><p className="text-sm text-slate-600">Completed goals</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#1E1B39]">{completed}</p></div>
    </div>

    <section aria-label="Organization performance filters" className="grid gap-3 rounded-xl border border-[#DEE0E3] bg-white p-4 sm:grid-cols-[minmax(0,1fr)_190px_220px]">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input type="search" value={search} onChange={event => setSearch(event.target.value)}
          aria-label="Search organization performance" placeholder="Search employee, goal or appraisal"
          className="min-h-11 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-2 focus:outline-[#08558B]" />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Review cycle
        <select value={cycleFilter} onChange={event => setCycleFilter(event.target.value)}
          aria-label="Filter organization performance by review cycle"
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900">
          <option value="all">All review cycles</option>
          {cycles.map(cycle => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}
        </select>
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Status
        <select value={filter} onChange={event => setFilter(event.target.value as GoalFilter)}
          aria-label="Filter organization performance by status"
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900">
          <option value="all">All statuses</option>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>
    </section>

    {cycleLoadError && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      Review cycle details are temporarily unavailable. Goal progress is still shown; refresh to try again.
    </p>}
    {selectedCycle && <section aria-label={`${selectedCycle.name} review cycle details`} className="flex flex-col gap-3 rounded-xl border border-[#B9DCE2] bg-[#F4FAFB] p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h3 className="break-words font-semibold text-[#1E1B39]">{selectedCycle.name}</h3>
        <p className="mt-1 text-sm text-slate-600">{dueDate(selectedCycle.start_date)} – {dueDate(selectedCycle.end_date)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="rounded-full bg-white px-3 py-1 font-medium text-[#08558B]">{statusLabel(selectedCycle.status)}</span>
        {selectedCycle.self_review_deadline && <span className="text-slate-600">Self review due {dueDate(selectedCycle.self_review_deadline)}</span>}
        {selectedCycle.manager_review_deadline && <span className="text-slate-600">Manager review due {dueDate(selectedCycle.manager_review_deadline)}</span>}
      </div>
    </section>}

    <section aria-labelledby="organization-appraisals-heading" className="space-y-3">
      <div>
        <h3 id="organization-appraisals-heading" className="text-lg font-semibold text-[#1E1B39]">Appraisal reviews</h3>
        <p className="mt-1 text-sm text-slate-600">Review status available to your performance role.</p>
      </div>
      {appraisalLoadError
        ? <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Appraisal status is temporarily unavailable. Goal progress is still shown.</p>
        : loading
          ? <p role="status" className="rounded-xl border border-[#DEE0E3] bg-white p-5 text-sm text-slate-600">Loading appraisal reviews…</p>
          : appraisals.length === 0
            ? <p className="rounded-xl border border-dashed border-[#B9DCE2] bg-white p-5 text-sm text-slate-600">No appraisal reviews are available to this role.</p>
            : visibleAppraisals.length === 0
              ? <p role="status" className="rounded-xl border border-[#DEE0E3] bg-white p-5 text-sm text-slate-600">No appraisals match the current search and cycle.</p>
              : <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                {visibleAppraisals.map(appraisal => {
                  const employee = employees[appraisal.employee_id];
                  const cycle = cycles.find(item => item.id === appraisal.cycle_id);
                  return <article key={appraisal.id} className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[#615E83]">{employee?.employee_number || 'Employee details unavailable'}</p>
                        <h4 className="mt-1 break-words font-semibold text-[#1E1B39]">{employee?.full_name || 'Appraisal review'}</h4>
                        <p className="mt-1 text-sm text-slate-600">{cycle?.name || 'Review cycle details unavailable'}</p>
                        {cycle && <p className="mt-1 text-xs text-slate-500">{dueDate(cycle.start_date)} – {dueDate(cycle.end_date)}</p>}
                      </div>
                      <span className="shrink-0 rounded-full bg-[#EFF7F8] px-3 py-1 text-xs font-medium text-[#08558B]">{statusLabel(appraisal.status)}</span>
                    </div>
                  </article>;
                })}
              </div>}
    </section>

    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p role="alert">{error}</p>
      <button type="button" onClick={() => void load()} className="mt-2 min-h-11 font-semibold underline">Retry</button>
    </div>}
    {loading ? <p role="status" className="rounded-xl border border-[#DEE0E3] bg-white p-5 text-sm text-slate-600">Loading performance goals…</p>
      : !error && goals.length === 0 ? <div className="rounded-xl border border-dashed border-[#B9DCE2] bg-white p-8 text-center">
        <Target className="mx-auto h-8 w-8 text-[#08558B]" /><h3 className="mt-3 font-semibold text-slate-900">No organization goals available</h3>
        <p className="mt-1 text-sm text-slate-600">Goals will appear here when they are available to your performance role.</p>
      </div>
        : !error && visibleGoals.length === 0 ? <p className="rounded-xl border border-[#DEE0E3] bg-white p-5 text-center text-sm text-slate-600">No goals match these filters.</p>
          : !error && <div className="grid gap-3 xl:grid-cols-2">
            {visibleGoals.map(goal => {
              const numericProgress = Number(goal.current_progress);
              const progress = Number.isFinite(numericProgress) ? Math.min(100, Math.max(0, numericProgress)) : 0;
              const employee = employees[goal.employee_id];
              return <article key={goal.id} className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#615E83]">{employee?.employee_number || 'Employee name unavailable'} · {goal.category}</p>
                    <h3 className="mt-1 break-words text-base font-semibold text-[#1E1B39]">{goal.title}</h3>
                    {employee?.full_name && <p className="mt-1 text-sm text-slate-600">{employee.full_name}</p>}
                  </div>
                  <span className="shrink-0 rounded-full bg-[#EFF7F8] px-3 py-1 text-xs font-medium text-[#08558B]">{statusLabel(goal.status)}</span>
                </div>
                {goal.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-600">{goal.description}</p>}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0 rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Target</p><p className="mt-1 break-words text-sm font-medium text-slate-800">{goal.target_metric || 'No target metric recorded'}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Due date</p><p className="mt-1 text-sm font-medium text-slate-800">{dueDate(goal.due_date)}</p></div>
                </div>
                <div className="mt-4" role="group" aria-label={`${goal.title} recorded progress`}>
                  <div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium text-slate-700">Recorded progress</span><span className="tabular-nums text-slate-600">{progress}%</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${goal.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                    <div className="h-full rounded-full bg-[#08558B]" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </article>;
            })}
          </div>}
  </section>;
}

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type RowData = Record<string, unknown>;
type Module = {
  id: string;
  group: string;
  title: string;
  description: string;
  table?: string;
  fields?: string;
  primary?: string;
  secondary?: string[];
  status?: string;
};
const modules: Module[] = [
  { id: 'overview', group: 'Workspace', title: 'System overview', description: 'Live, permission-filtered HRIS operational snapshot.' },
  { id: 'employees', group: 'People & Organization', title: 'Employee directory', description: 'Authorized employee records.', table: 'employees', fields: 'id,full_name,employee_number,employment_status', primary: 'full_name', secondary: ['employee_number'], status: 'employment_status' },
  { id: 'departments', group: 'People & Organization', title: 'Departments', description: 'Organization departments.', table: 'departments', fields: 'id,name,code,active', primary: 'name', secondary: ['code'], status: 'active' },
  { id: 'teams', group: 'People & Organization', title: 'Teams', description: 'Department teams.', table: 'teams', fields: 'id,name,code,active', primary: 'name', secondary: ['code'], status: 'active' },
  { id: 'designations', group: 'People & Organization', title: 'Designations', description: 'Organization job designations.', table: 'designations', fields: 'id,title,code,active', primary: 'title', secondary: ['code'], status: 'active' },
  { id: 'attendance', group: 'Time & Leave', title: 'Attendance records', description: 'Recorded attendance; correction and approval workflows are not connected here.', table: 'attendance_records', fields: 'id,attendance_date,status,check_in,check_out', primary: 'attendance_date', secondary: ['check_in', 'check_out'], status: 'status' },
  { id: 'shifts', group: 'Time & Leave', title: 'Shifts & rosters', description: 'Defined shifts; employee roster management is not connected here.', table: 'shifts', fields: 'id,name,code,start_time,end_time', primary: 'name', secondary: ['code', 'start_time', 'end_time'] },
  { id: 'leave', group: 'Time & Leave', title: 'Leave requests', description: 'RLS-authorized leave requests; approvals are not enabled on this screen.', table: 'leave_requests', fields: 'id,from_date,to_date,requested_days,status', primary: 'from_date', secondary: ['to_date', 'requested_days'], status: 'status' },
  { id: 'leaveTypes', group: 'Time & Leave', title: 'Leave policies', description: 'Published leave types and entitlements.', table: 'leave_types', fields: 'id,name,code,annual_entitlement,active', primary: 'name', secondary: ['code', 'annual_entitlement'], status: 'active' },
  { id: 'holidays', group: 'Time & Leave', title: 'Holidays', description: 'Organization holidays.', table: 'holidays', fields: 'id,name,start_date,end_date,active', primary: 'name', secondary: ['start_date', 'end_date'], status: 'active' },
  { id: 'goals', group: 'Performance & Learning', title: 'Performance goals', description: 'Goals visible to the authorized session.', table: 'performance_goals', fields: 'id,title,category,due_date,status', primary: 'title', secondary: ['category', 'due_date'], status: 'status' },
  { id: 'cycles', group: 'Performance & Learning', title: 'Performance cycles', description: 'Review periods and their current statuses.', table: 'performance_cycles', fields: 'id,name,start_date,end_date,status', primary: 'name', secondary: ['start_date', 'end_date'], status: 'status' },
  { id: 'learning', group: 'Performance & Learning', title: 'Learning programs', description: 'Learning program catalog.', table: 'learning_programs', fields: 'id,title,category,delivery_mode,active', primary: 'title', secondary: ['category', 'delivery_mode'], status: 'active' },
  { id: 'requisitions', group: 'Recruitment & Onboarding', title: 'Manpower requisitions', description: 'Hiring requests and approvals.', table: 'manpower_requisitions', fields: 'id,title,reference_number,required_positions,status', primary: 'title', secondary: ['reference_number', 'required_positions'], status: 'status' },
  { id: 'jobs', group: 'Recruitment & Onboarding', title: 'Job postings', description: 'Jobs created in the HRIS database.', table: 'jobs', fields: 'id,title,reference_number,department_name,status', primary: 'title', secondary: ['reference_number', 'department_name'], status: 'status' },
  { id: 'candidate', group: 'Recruitment & Onboarding', title: 'Candidate pipeline', description: 'Candidate and ATS workflow integration is not yet released in this Admin application.' },
  { id: 'onboarding', group: 'Recruitment & Onboarding', title: 'Employee onboarding', description: 'Onboarding handoff and approval workflows are not yet connected here.' },
  { id: 'payPeriods', group: 'Compensation & Services', title: 'Payroll periods', description: 'Pay-period schedule only. Confidential employee payslips are not exposed by this view.', table: 'pay_periods', fields: 'id,name,start_date,end_date,status', primary: 'name', secondary: ['start_date', 'end_date'], status: 'status' },
  { id: 'compensation', group: 'Compensation & Services', title: 'Compensation management', description: 'Salary calculations, payroll actions and sensitive employee compensation are not connected here.' },
  { id: 'expenses', group: 'Compensation & Services', title: 'Expense claims', description: 'Existing expense claims, where RLS permits access.', table: 'expense_claims', fields: 'id,description,category,claim_date,status', primary: 'description', secondary: ['category', 'claim_date'], status: 'status' },
  { id: 'travel', group: 'Compensation & Services', title: 'Travel requests', description: 'Existing employee travel requests.', table: 'travel_requests', fields: 'id,destination,from_date,to_date,status', primary: 'destination', secondary: ['from_date', 'to_date'], status: 'status' },
  { id: 'services', group: 'Compensation & Services', title: 'Employee service requests', description: 'Employee service request status.', table: 'service_requests', fields: 'id,request_type,status,submitted_at', primary: 'request_type', secondary: ['submitted_at'], status: 'status' },
  { id: 'policies', group: 'Governance', title: 'HR policies', description: 'Existing organization policy records.', table: 'hr_policies', fields: 'id,title,category,version,active', primary: 'title', secondary: ['category', 'version'], status: 'active' },
  { id: 'notices', group: 'Governance', title: 'Notices', description: 'Existing organization notices.', table: 'notices', fields: 'id,title,category,published_at,active', primary: 'title', secondary: ['category', 'published_at'], status: 'active' },
  { id: 'roles', group: 'Governance', title: 'Roles & permissions', description: 'Super Admin identity is enforced by Supabase; the role-editing workflow is not connected here.' },
  { id: 'audits', group: 'Governance', title: 'Audit & compliance', description: 'Audit review workflow is not yet integrated into this authenticated workspace.' },
  { id: 'settings', group: 'Governance', title: 'Tenant configuration', description: 'Tenant configuration write actions are not yet integrated into this workspace.' }
];
const groups = Array.from(new Set(modules.map(module => module.group)));
const summaryModules = ['employees', 'departments', 'attendance', 'leave', 'goals', 'jobs', 'services', 'policies'];
function label(key: string) {
  return key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}
function readable(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Active' : 'Inactive';
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  return '—';
}

export function LiveSystemWorkspace({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [selectedId, setSelectedId] = useState('overview');
  const [rows, setRows] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [summary, setSummary] = useState<Record<string, number | null>>({});
  const selected = useMemo(() => modules.find(module => module.id === selectedId) || modules[0], [selectedId]);

  useEffect(() => {
    let active = true;
    setRows([]);
    setError('');
    if (!selected.table || !selected.fields) return () => { active = false; };
    setLoading(true);
    void Promise.resolve(supabase.from(selected.table).select(selected.fields).eq('tenant_id', tenantId).limit(50))
      .then(({ data, error: requestError }) => {
        if (!active) return;
        if (requestError) setError('These records are not accessible in your current authorized session.');
        else setRows((data || []) as unknown as RowData[]);
      })
      .catch(() => { if (active) setError('Unable to load records. Try refreshing this module.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tenantId, selected.id, revision]);

  useEffect(() => {
    if (selectedId !== 'overview') return;
    let active = true;
    void Promise.all(summaryModules.map(async id => {
      const module = modules.find(item => item.id === id)!;
      const response = await supabase.from(module.table!).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
      return [id, response.error ? null : response.count] as const;
    })).then(entries => { if (active) setSummary(Object.fromEntries(entries)); })
      .catch(() => { if (active) setSummary({}); });
    return () => { active = false; };
  }, [tenantId, selectedId, revision]);

  return (
    <section aria-label="Authenticated HRIS system workspace" className="flex flex-col lg:flex-row gap-5 min-h-[65vh]">
      <aside className="w-full lg:w-72 lg:shrink-0 border border-slate-200 bg-white rounded-xl overflow-hidden">
        <div className="p-4 bg-[#07304C] text-white">
          <p className="text-xs tracking-wide font-semibold">HRIS 360° · System navigation</p>
          <p className="text-sm text-slate-200 mt-1">{tenantName}</p>
        </div>
        <nav aria-label="HRIS modules" className="max-h-none lg:max-h-[72vh] lg:overflow-y-auto p-3 space-y-4">
          {groups.map(group => <div key={group}>
            <p className="text-[11px] font-semibold text-slate-500 px-2 pb-1">{group}</p>
            <div className="space-y-0.5">{modules.filter(module => module.group === group).map(module =>
              <button key={module.id} type="button" onClick={() => setSelectedId(module.id)}
                aria-current={selected.id === module.id ? 'page' : undefined}
                className={'min-h-10 rounded-md px-3 py-2 w-full flex items-center justify-between text-left gap-2 text-sm ' +
                  (selected.id === module.id ? 'bg-[#085587] text-white font-semibold' : 'text-slate-700 hover:bg-slate-100')}>
                <span>{module.title}</span>
                <span aria-label={module.table ? 'Database records' : 'Workflow pending'} className="text-xs opacity-70">{module.table ? '●' : '○'}</span>
              </button>
            )}</div>
          </div>)}
        </nav>
      </aside>
      <div className="flex-1 min-w-0 space-y-4">
        <header className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs text-[#085587] font-semibold">Authenticated system workspace</p>
              <h2 className="text-2xl font-bold mt-1 text-slate-900">{selected.title}</h2>
              <p className="text-sm text-slate-600 mt-2 max-w-2xl">{selected.description}</p>
            </div>
            <button type="button" onClick={() => setRevision(n => n + 1)}
              className="min-h-10 px-3 border border-slate-300 rounded-md text-sm hover:bg-slate-50">Refresh data</button>
          </div>
        </header>
        {selected.id === 'overview' ? <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {summaryModules.map(id => {
              const module = modules.find(item => item.id === id)!;
              return <button key={id} type="button" onClick={() => setSelectedId(id)}
                className="bg-white text-left rounded-xl border border-slate-200 p-4 hover:border-[#085587] focus-visible:outline-2 focus-visible:outline-[#085587]">
                <p className="text-sm text-slate-600">{module.title}</p>
                <p className="text-2xl font-bold mt-2 tabular-nums">{summary[id] === undefined ? '…' : summary[id] === null ? 'Restricted' : summary[id]}</p>
                <p className="text-xs text-slate-500 mt-2">Authorized database records</p>
              </button>;
            })}
          </div>
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="font-semibold">Available system areas</h3>
            <p className="text-sm text-slate-600 mt-2">All HRIS areas are listed in the navigation. A filled marker indicates an RLS-filtered live record view. An empty marker indicates a workflow that is not yet integrated. No sample data or simulated saves are displayed.</p>
            <p className="text-sm text-slate-600 mt-2">Employee, Manager, HOD, HR, Admin, Super Admin and CEO workflows require their own verified role-based journeys. Viewing this system index does not impersonate those roles.</p>
          </section>
        </> : selected.table ? <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
            <h3 className="font-semibold">Authorized records</h3>
            <p className="text-xs text-slate-500">RLS protected · up to 50 records · read only</p>
          </div>
          {loading ? <p className="p-5 text-sm" role="status">Loading authorized records…</p> :
           error ? <p className="p-5 text-sm text-red-700" role="alert">{error}</p> :
           rows.length === 0 ? <p className="p-5 text-sm text-slate-600">No records visible for this organization in the current authorized session.</p> :
           <ul className="divide-y divide-slate-100">
             {rows.map((row, index) => <li key={String(row.id ?? index)} className="p-4 flex flex-wrap items-start justify-between gap-3">
               <div className="min-w-0">
                 <p className="font-medium text-sm text-slate-900 break-words">{readable(row[selected.primary || 'id'])}</p>
                 <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                   {(selected.secondary || []).map(field => <p key={field} className="text-xs text-slate-500">{label(field)}: {readable(row[field])}</p>)}
                 </div>
               </div>
               {selected.status && <p className="text-xs rounded-md bg-slate-100 text-slate-700 px-2.5 py-1">{readable(row[selected.status])}</p>}
             </li>)}
           </ul>}
        </section> : <section className="border border-slate-200 rounded-xl bg-white p-6">
          <h3 className="font-semibold text-slate-900">Workflow integration pending</h3>
          <p className="text-sm text-slate-600 mt-2">This module is part of the HRIS system structure but has no verified production workflow in this release. No simulated actions or records are presented as live.</p>
        </section>}
      </div>
    </section>
  );
}

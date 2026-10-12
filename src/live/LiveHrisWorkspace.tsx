import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  Activity, CalendarDays, ClipboardList, Download, LayoutDashboard, LogOut,
  Menu, RefreshCw, ShieldCheck, Users, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type TenantOption = { id: string; name: string; slug: string };
type PermissionSet = {
  dashboard: boolean;
  attendance: boolean;
  attendanceReport: boolean;
  leave: boolean;
  leaveManage: boolean;
};
type PageId = 'dashboard' | 'attendance' | 'leave' | 'my-dashboard';
type DashboardPoint = { date: string; records: number };
type DashboardSummary = {
  employees?: number;
  probation_employees?: number;
  attendance_today?: number;
  attendance_corrections_pending?: number;
  leave_pending?: number;
  service_requests_pending?: number;
  requisitions_pending?: number;
  published_jobs?: number;
  applications_active?: number;
  pay_periods_open?: number;
  policies_active?: number;
  notices_active?: number;
  approvals_pending?: number;
  attendance_last_7_days?: DashboardPoint[];
};
type AttendanceRecord = Record<string, unknown>;
type LeaveRequest = Record<string, unknown>;
type LeaveData = {
  requests: LeaveRequest[];
  leave_types: Record<string, unknown>[];
  holidays: Record<string, unknown>[];
};

const emptyPermissions: PermissionSet = {
  dashboard: false, attendance: false, attendanceReport: false, leave: false, leaveManage: false,
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(asObject) as Record<string, unknown>[] : [];
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString() : '—';
  return String(value);
}

function displayTime(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function localIsoDate(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function startOfRecentWeek(): string {
  const date = new Date();
  date.setDate(date.getDate() - 6);
  return localIsoDate(date);
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const content = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function StatusMessage({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">
    <p>{error}</p>
    <button type="button" className="mt-3 min-h-11 rounded-md border border-rose-400 px-3 font-medium" onClick={onRetry}>
      Retry
    </button>
  </div>;
}

function Metric({ label, value, icon, onOpen }: { label: string; value: unknown; icon: ReactNode; onOpen?: () => void }) {
  return <button type="button" onClick={onOpen} disabled={!onOpen}
    className={`min-h-28 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm ${onOpen ? 'hover:border-[#08558B] focus-visible:outline-2 focus-visible:outline-[#08558B]' : 'cursor-default'}`}>
    <span className="flex items-center justify-between gap-3 text-sm text-slate-600"><span>{label}</span><span className="text-[#08558B]">{icon}</span></span>
    <span className="mt-3 block text-2xl font-semibold tabular-nums text-slate-900">{display(value)}</span>
  </button>;
}

function AttendanceTrend({ points }: { points: DashboardPoint[] }) {
  const safePoints = points.filter(point => typeof point.date === 'string' && Number.isFinite(Number(point.records)));
  if (!safePoints.length) return <p className="p-5 text-sm text-slate-600">No attendance summary is available for the recent date range.</p>;
  const max = Math.max(1, ...safePoints.map(point => Number(point.records)));
  const coords = safePoints.map((point, index) => ({
    x: safePoints.length === 1 ? 300 : 36 + index * (528 / (safePoints.length - 1)),
    y: 176 - (Number(point.records) / max) * 132,
    point,
  }));
  const path = coords.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  return <div className="overflow-x-auto p-3">
    <svg viewBox="0 0 600 220" role="img" aria-labelledby="attendance-trend-title attendance-trend-description" className="min-w-[540px] w-full">
      <title id="attendance-trend-title">Attendance records over the last seven days</title>
      <desc id="attendance-trend-description">Daily counts returned by the tenant-scoped HRIS dashboard service.</desc>
      {[0, 1, 2, 3].map(i => <line key={i} x1="32" x2="570" y1={44 + i * 44} y2={44 + i * 44} stroke="#e7eef0" />)}
      <path d={path} fill="none" stroke="#08558B" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((point, index) => <g key={`${point.point.date}-${index}`}>
        <circle cx={point.x} cy={point.y} r="5" fill="#fff" stroke="#08558B" strokeWidth="2" />
        <text x={point.x} y="202" textAnchor="middle" fontSize="10" fill="#615E83">
          {new Date(`${point.point.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </text>
      </g>)}
    </svg>
  </div>;
}

function LiveDashboard({ onOpen }: { onOpen: (page: PageId) => void }) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_get_dashboard_summary');
      if (rpcError) throw rpcError;
      const value = asObject(data);
      if (!value) throw new Error('Dashboard service returned an invalid response.');
      setSummary(value as DashboardSummary);
      setRefreshedAt(new Date().toLocaleString());
    } catch (cause) {
      setSummary(null);
      setError(cause instanceof Error ? cause.message : 'Unable to load the authorized dashboard.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  return <section aria-labelledby="live-dashboard-heading" className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="live-dashboard-heading" className="text-2xl font-medium text-[#49454F]">HRIS Dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">Tenant-scoped workforce and service activity</p></div>
      <button type="button" disabled={loading} onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
        <RefreshCw className="h-4 w-4" /> Refresh
      </button>
    </div>
    {refreshedAt && <p className="text-xs text-slate-500">Last refreshed {refreshedAt}</p>}
    {error && <StatusMessage error={error} onRetry={() => void load()} />}
    {loading && !summary ? <p role="status" className="rounded-lg border bg-white p-5 text-sm">Loading authorized dashboard data…</p> : summary && <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Team members" value={summary.employees} icon={<Users className="h-4 w-4" />} />
        <Metric label="Attendance records today" value={summary.attendance_today} icon={<Activity className="h-4 w-4" />} onOpen={() => onOpen('attendance')} />
        <Metric label="Pending approvals" value={summary.approvals_pending} icon={<ClipboardList className="h-4 w-4" />} onOpen={() => onOpen('leave')} />
        <Metric label="Pending attendance corrections" value={summary.attendance_corrections_pending} icon={<CalendarDays className="h-4 w-4" />} onOpen={() => onOpen('attendance')} />
        <Metric label="Pending leave requests" value={summary.leave_pending} icon={<CalendarDays className="h-4 w-4" />} onOpen={() => onOpen('leave')} />
        <Metric label="Pending requisitions" value={summary.requisitions_pending} icon={<Users className="h-4 w-4" />} />
        <Metric label="Active published jobs" value={summary.published_jobs} icon={<LayoutDashboard className="h-4 w-4" />} />
        <Metric label="Active applications" value={summary.applications_active} icon={<ClipboardList className="h-4 w-4" />} />
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="attendance-trend-heading">
        <div className="border-b border-slate-100 pb-3"><h3 id="attendance-trend-heading" className="text-base font-medium text-[#49454F]">Daily attendance records</h3>
          <p className="mt-1 text-xs text-slate-500">Counts returned by the authorized dashboard RPC</p></div>
        <AttendanceTrend points={summary.attendance_last_7_days || []} />
      </section>
      <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        Counts are shown only when returned by the current tenant’s authorized HRIS service. No sample metrics are substituted.
      </p>
    </>}
  </section>;
}

function AttendanceReport({ canReport }: { canReport: boolean }) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [corrections, setCorrections] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [from, setFrom] = useState(startOfRecentWeek);
  const [to, setTo] = useState(localIsoDate(new Date()));
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [status, setStatus] = useState('all');

  async function load() {
    setLoading(true); setError('');
    try {
      if (from > to) throw new Error('Choose a valid date range.');
      if (canReport) {
        const { data, error: rpcError } = await supabase.rpc('admin_get_attendance_report', {
          p_mode: 'weekly', p_start: from, p_end: to, p_search: submittedSearch,
        });
        if (rpcError) throw rpcError;
        if (data !== null && !Array.isArray(data)) throw new Error('Attendance report returned an invalid response.');
        setRecords(asRows(data));
        setCorrections([]);
      } else {
        const { data, error: rpcError } = await supabase.rpc('admin_get_attendance', {
          p_start: from, p_end: to, p_search: submittedSearch || null, p_status: status === 'all' ? null : status,
        });
        if (rpcError) throw rpcError;
        const value = asObject(data);
        if (!value) throw new Error('Attendance service returned an invalid response.');
        setRecords(asRows(value.records));
        setCorrections(asRows(value.corrections));
      }
    } catch (cause) {
      setRecords([]); setCorrections([]);
      setError(cause instanceof Error ? cause.message : 'Unable to load attendance records.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [from, to, submittedSearch, status, canReport]);

  function exportReport() {
    if (!records.length) return;
    const fields = canReport
      ? ['employee_name', 'employee_number', 'designation_title', 'department_name', 'attendance_days', 'office_hours', 'working_hours', 'deviation']
      : ['full_name', 'employee_number', 'designation_title', 'department_name', 'attendance_date', 'check_in', 'check_out', 'work_mode', 'status', 'work_hours'];
    const labels = canReport
      ? ['Employee', 'Employee number', 'Designation', 'Department', 'Attendance days', 'Office hours', 'Working hours', 'Deviation']
      : ['Employee', 'Employee number', 'Designation', 'Department', 'Date', 'Check in', 'Check out', 'Work location', 'Status', 'Working hours'];
    downloadCsv(`attendance-report-${from}-${to}.csv`, labels, records.map(row => fields.map(field => row[field])));
  }

  const statuses = Array.from(new Set(records.map(row => String(row.status || '')).filter(Boolean))).sort();
  const rows = canReport ? records : records;

  return <section aria-labelledby="attendance-report-heading" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="attendance-report-heading" className="text-2xl font-medium text-[#49454F]">Attendance Report</h2>
        <p className="mt-1 text-sm text-slate-500">Records visible to your current HRIS permission</p></div>
      <button type="button" disabled={!records.length} onClick={exportReport} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
        <Download className="h-4 w-4" /> Download report
      </button>
    </div>
    <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSubmittedSearch(search.trim()); }} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-5">
      <div><label htmlFor="attendance-search" className="mb-1 block text-xs font-medium text-slate-600">Search employees</label>
        <input id="attendance-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or employee number" className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
      <div><label htmlFor="attendance-from" className="mb-1 block text-xs font-medium text-slate-600">From date</label>
        <input id="attendance-from" type="date" value={from} onChange={event => setFrom(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
      <div><label htmlFor="attendance-to" className="mb-1 block text-xs font-medium text-slate-600">To date</label>
        <input id="attendance-to" type="date" value={to} onChange={event => setTo(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
      {!canReport && <div><label htmlFor="attendance-status" className="mb-1 block text-xs font-medium text-slate-600">Status</label>
        <select id="attendance-status" value={status} onChange={event => setStatus(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm">
          <option value="all">All visible statuses</option>{statuses.map(value => <option key={value} value={value}>{value}</option>)}
        </select></div>}
      <div className="flex items-end"><button type="submit" className="min-h-11 w-full rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white">Apply</button></div>
    </form>
    {error && <StatusMessage error={error} onRetry={() => void load()} />}
    {corrections.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="font-medium">Attendance correction requests</h3>
      <p className="mt-1 text-sm text-slate-600">{corrections.filter(item => item.status === 'pending').length} pending in this date range. Decision controls are disabled until the tenant-scoped approval contract is verified.</p>
    </section>}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {loading ? <p role="status" className="p-5 text-sm">Loading attendance data…</p> : !rows.length ? <p className="p-5 text-sm text-slate-600">No attendance records were returned for this date range.</p> : <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="bg-[#eff7f8] text-xs text-slate-600"><tr>
            {(canReport ? ['Name', 'Employee no.', 'Designation', 'Department', 'Days', 'Office hours', 'Work hours', 'Deviation'] : ['Name', 'Employee no.', 'Designation', 'Department', 'Date', 'Check in', 'Check out', 'Work location', 'Status', 'Work hours']).map(label => <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100">{records.map((row, index) => <tr key={String(row.employee_id || row.id || index)} className="hover:bg-slate-50">
            <td className="px-3 py-3 font-medium">{display(row.employee_name || row.full_name)}</td>
            <td className="px-3 py-3">{display(row.employee_number)}</td>
            <td className="px-3 py-3">{display(row.designation_title)}</td>
            <td className="px-3 py-3">{display(row.department_name)}</td>
            {canReport ? <>
              <td className="px-3 py-3">{display(row.attendance_days)}</td><td className="px-3 py-3">{display(row.office_hours)}</td>
              <td className="px-3 py-3">{display(row.working_hours)}</td><td className="px-3 py-3">{display(row.deviation)}</td>
            </> : <>
              <td className="px-3 py-3">{display(row.attendance_date)}</td><td className="px-3 py-3">{displayTime(row.check_in)}</td>
              <td className="px-3 py-3">{displayTime(row.check_out)}</td><td className="px-3 py-3">{display(row.work_mode)}</td>
              <td className="px-3 py-3">{display(row.status)}</td><td className="px-3 py-3">{display(row.work_hours)}</td>
            </>}
          </tr>)}</tbody>
        </table>
      </div>}
    </div>
  </section>;
}

function LeaveWorkspace({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<LeaveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const { data: response, error: rpcError } = await supabase.rpc('admin_get_leave_data', { p_start: null, p_end: null });
      if (rpcError) throw rpcError;
      const value = asObject(response);
      if (!value) throw new Error('Leave service returned an invalid response.');
      setData({ requests: asRows(value.requests), leave_types: asRows(value.leave_types), holidays: asRows(value.holidays) });
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : 'Unable to load leave data.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  const pending = useMemo(() => (data?.requests || []).filter(item => item.status === 'pending'), [data]);

  return <section aria-labelledby="leave-workspace-heading" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="leave-workspace-heading" className="text-2xl font-medium text-[#49454F]">Leave Requests</h2>
        <p className="mt-1 text-sm text-slate-500">Tenant leave records returned by the authorized HRIS service</p></div>
      <button type="button" disabled={loading} onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
        <RefreshCw className="h-4 w-4" /> Refresh
      </button>
    </div>
    {error && <StatusMessage error={error} onRetry={() => void load()} />}
    {canManage && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Approval actions are unavailable until tenant-scoped SQL and isolated authorization tests are accepted.</p>}
    {loading ? <p role="status" className="rounded-lg border bg-white p-5 text-sm">Loading authorized leave records…</p> : data && <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-600">Pending requests</p><p className="mt-2 text-2xl font-semibold">{pending.length}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-600">Leave types</p><p className="mt-2 text-2xl font-semibold">{data.leave_types.length}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-600">Holidays</p><p className="mt-2 text-2xl font-semibold">{data.holidays.length}</p></div>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {!data.requests.length ? <p className="p-5 text-sm text-slate-600">No leave requests were returned for this tenant.</p> : <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#eff7f8] text-xs text-slate-600"><tr>
              {['Employee', 'Leave type', 'From', 'To', 'Days', 'Status'].map(label => <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{data.requests.map((row, index) => <tr key={String(row.id || index)}>
              <td className="px-3 py-3 font-medium">{display(row.full_name)}</td><td className="px-3 py-3">{display(row.leave_type_name)}</td>
              <td className="px-3 py-3">{display(row.from_date)}</td><td className="px-3 py-3">{display(row.to_date)}</td>
              <td className="px-3 py-3">{display(row.requested_days)}</td><td className="px-3 py-3">{display(row.status)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>
    </>}
  </section>;
}

function EmployeeOverview() {
  const [attendance, setAttendance] = useState<Record<string, unknown> | null>(null);
  const [leave, setLeave] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    const today = localIsoDate(new Date());
    const start = startOfRecentWeek();
    try {
      const [attendanceResult, leaveResult] = await Promise.all([
        supabase.rpc('employee_get_my_attendance_v3', { p_start: start, p_end: today }),
        supabase.rpc('employee_get_leave_context'),
      ]);
      if (attendanceResult.error) throw attendanceResult.error;
      if (leaveResult.error) throw leaveResult.error;
      const attendanceData = asObject(attendanceResult.data);
      const leaveData = asObject(leaveResult.data);
      if (!attendanceData || !leaveData) throw new Error('Employee services returned an invalid response.');
      setAttendance(attendanceData);
      setLeave(leaveData);
    } catch (cause) {
      setAttendance(null); setLeave(null);
      setError(cause instanceof Error ? cause.message : 'Unable to load your HRIS summary.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  const today = localIsoDate(new Date());
  const record = asRows(attendance?.records).find(item => item.attendance_date === today);
  const balances = asRows(leave?.balances);

  return <section aria-labelledby="employee-summary-heading" className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="employee-summary-heading" className="text-2xl font-medium text-[#49454F]">My Dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">Your own attendance and leave information from HRIS</p></div>
      <button type="button" disabled={loading} onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50"><RefreshCw className="h-4 w-4" /> Refresh</button>
    </div>
    {error && <StatusMessage error={error} onRetry={() => void load()} />}
    {loading ? <p role="status" className="rounded-lg border bg-white p-5 text-sm">Loading your HRIS summary…</p> : attendance && leave && <>
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="font-medium">Today’s attendance</h3>
        {record ? <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <p><span className="text-slate-500">Status </span><strong>{display(record.status)}</strong></p>
          <p><span className="text-slate-500">Check in </span><strong>{displayTime(record.check_in)}</strong></p>
          <p><span className="text-slate-500">Check out </span><strong>{displayTime(record.check_out)}</strong></p>
        </div> : <p className="mt-2 text-sm text-slate-600">No attendance record is available for today.</p>}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="font-medium">Leave balances · {display(leave.balance_year)}</h3>
        {balances.length ? <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{balances.map((row, index) => <div key={String(row.leave_type_id || index)} className="rounded-lg border p-3">
          <p className="text-sm font-medium">{display(row.leave_type_name)}</p><p className="mt-2 text-xl font-semibold">{display(row.available_days)} days available</p>
          <p className="mt-1 text-xs text-slate-600">Used {display(row.used_days)} · Pending {display(row.pending_days)}</p>
        </div>)}</div> : <p className="mt-2 text-sm text-slate-600">No leave balance records are available.</p>}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="font-medium">Recent attendance</h3>
        {asRows(attendance.records).length ? <ul className="mt-2 divide-y">{asRows(attendance.records).slice(0, 7).map((row, index) => <li key={String(row.id || index)} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
          <span>{display(row.attendance_date)} · {display(row.status)}</span><span>{displayTime(row.check_in)} – {displayTime(row.check_out)}</span>
        </li>)}</ul> : <p className="mt-2 text-sm text-slate-600">No attendance records in the recent date range.</p>}
      </section>
    </>}
  </section>;
}

export function LiveHrisWorkspace({
  userEmail, tenantId, tenantName, tenants, onTenantChange, onSignOut, isSuperAdmin, isEmployee,
  permissions = emptyPermissions,
}: {
  userEmail: string;
  tenantId: string;
  tenantName: string;
  tenants: TenantOption[];
  onTenantChange: (tenantId: string) => void;
  onSignOut: () => void;
  isSuperAdmin: boolean;
  isEmployee: boolean;
  permissions?: PermissionSet;
}) {
  const [page, setPage] = useState<PageId>(() => {
    if (permissions.dashboard) return 'dashboard';
    if (permissions.attendance) return 'attendance';
    if (permissions.leave) return 'leave';
    return isEmployee ? 'my-dashboard' : 'dashboard';
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = useMemo(() => {
    const items: { id: PageId; label: string; icon: ReactNode; group: 'HRIS' | 'Personal' }[] = [];
    if (permissions.dashboard) items.push({ id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.attendance) items.push({ id: 'attendance', label: 'Attendance', icon: <CalendarDays className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.leave) items.push({ id: 'leave', label: 'Leave', icon: <ClipboardList className="h-5 w-5" />, group: 'HRIS' });
    if (isEmployee) items.push({ id: 'my-dashboard', label: 'My Overview', icon: <Users className="h-5 w-5" />, group: 'Personal' });
    return items;
  }, [permissions, isEmployee]);

  useEffect(() => {
    if (nav.some(item => item.id === page)) return;
    setPage(nav[0]?.id || 'dashboard');
  }, [nav, page]);

  const roleLabel = isSuperAdmin ? 'Super Administrator' : permissions.dashboard || permissions.attendance || permissions.leave ? 'HRIS Administrator' : 'Employee';
  const navigate = (next: PageId) => { setPage(next); setMobileOpen(false); };
  const current = nav.find(item => item.id === page);

  const navigation = <nav aria-label="HRIS modules" className="space-y-1">
    {(['HRIS', 'Personal'] as const).map(group => {
      const items = nav.filter(item => item.group === group);
      return items.length ? <div key={group} className="space-y-1">
        <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-300">{group === 'HRIS' ? 'Workforce' : 'Self service'}</p>
        {items.map(item => <button key={item.id} type="button" title={item.label} onClick={() => navigate(item.id)} aria-current={page === item.id ? 'page' : undefined}
          className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-lg px-2 text-center text-[11px] focus-visible:outline-2 focus-visible:outline-white ${page === item.id ? 'bg-[#085587] text-white font-semibold shadow-xs' : 'text-slate-200 hover:bg-[#0A3D61]/60 hover:text-white'}`}>
          {item.icon}<span className="leading-tight">{item.label}</span>
        </button>)}
      </div> : null;
    })}
  </nav>;

  return <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
    <header className="sticky top-0 z-30 flex min-h-[72px] flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 sm:px-4 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={() => setMobileOpen(true)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border text-slate-700 lg:hidden" aria-label="Open navigation menu"><Menu className="h-5 w-5" /></button>
        <div className="flex min-w-0 items-center gap-2"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#08558B] text-sm font-bold text-white" aria-hidden="true">S</span>
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">Synesis HRIS</p><p className="truncate text-xs text-slate-500">{tenantName}</p></div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {tenants.length > 1 && <div><label className="sr-only" htmlFor="workspace-tenant">Organization</label><select id="workspace-tenant" value={tenantId} onChange={event => onTenantChange(event.target.value)} className="min-h-11 max-w-[210px] rounded-lg border border-slate-300 bg-white px-2 text-sm">
          {tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
        </select></div>}
        <span className="hidden max-w-56 truncate text-xs text-slate-500 md:block" title={userEmail}>{userEmail}</span>
        <span className="hidden rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 sm:inline-flex items-center gap-1"><ShieldCheck className="h-4 w-4" />{roleLabel}</span>
        <button type="button" onClick={onSignOut} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span></button>
      </div>
    </header>
    <div className="flex min-h-[calc(100vh-4.5rem)]">
      <aside className="sticky top-[72px] hidden h-[calc(100vh-4.5rem)] w-[111px] shrink-0 overflow-y-auto border-r border-[#05263D] bg-[#07304C] p-2 lg:block">{navigation}</aside>
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1600px]">
          {current && <div className="mb-4 flex items-center gap-2 text-xs text-slate-500"><span>{tenantName}</span><span aria-hidden="true">/</span><span className="text-slate-700">{current.label}</span></div>}
          {page === 'dashboard' && permissions.dashboard && <LiveDashboard onOpen={navigate} />}
          {page === 'attendance' && permissions.attendance && <AttendanceReport canReport={permissions.attendanceReport} />}
          {page === 'leave' && permissions.leave && <LeaveWorkspace canManage={permissions.leaveManage} />}
          {page === 'my-dashboard' && isEmployee && <EmployeeOverview />}
          {!nav.length && <section className="mx-auto mt-12 max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-[#08558B]" /><h2 className="mt-3 text-lg font-semibold">No HRIS modules are available for this account</h2>
            <p className="mt-2 text-sm text-slate-600">Your sign-in succeeded, but no active employee link or supported module permission was returned. No sample records are shown.</p>
          </section>}
        </div>
      </main>
    </div>
    {mobileOpen && <div className="fixed inset-0 z-50 bg-slate-950/40 lg:hidden" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setMobileOpen(false); }}>
      <aside aria-label="HRIS navigation" className="h-full w-72 max-w-[85vw] overflow-y-auto bg-[#07304C] p-4 text-white shadow-xl">
        <div className="mb-3 flex items-center justify-between"><span className="font-semibold">Navigation</span><button type="button" onClick={() => setMobileOpen(false)} className="min-h-11 min-w-11 rounded-lg border" aria-label="Close navigation menu"><X className="mx-auto h-4 w-4" /></button></div>
        {navigation}
      </aside>
    </div>}
  </div>;
}

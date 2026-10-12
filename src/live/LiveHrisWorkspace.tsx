import { useEffect, useMemo, useRef, useState } from 'react';
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
  attendanceManage: boolean;
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
  dashboard: false, attendance: false, attendanceManage: false,
  attendanceReport: false, leave: false, leaveManage: false,
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

function LiveDashboard({ tenantId, onOpen }: { tenantId: string; onOpen: (page: PageId) => void }) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('hris_get_tenant_dashboard_summary', {
        p_tenant_id: tenantId,
      });
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

  useEffect(() => { void load(); }, [tenantId]);

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

function AttendanceReport({ tenantId, canReport, canManage }: { tenantId: string; canReport: boolean; canManage: boolean }) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [corrections, setCorrections] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [from, setFrom] = useState(startOfRecentWeek);
  const [to, setTo] = useState(localIsoDate(new Date()));
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [resolvingCorrectionId, setResolvingCorrectionId] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      if (from > to) throw new Error('Choose a valid date range.');
      const parameters = {
        p_tenant_id: tenantId, p_start: from, p_end: to,
        p_search: submittedSearch || null,
      };
      const needsDetails = !canReport || canManage;
      const [detailResult, reportResult] = await Promise.all([
        needsDetails
          ? supabase.rpc('hris_get_tenant_attendance_data', {
            ...parameters, p_status: status === 'all' ? null : status, p_report: false,
          })
          : Promise.resolve({ data: null, error: null }),
        canReport
          ? supabase.rpc('hris_get_tenant_attendance_data', {
            ...parameters, p_status: null, p_report: true,
          })
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (detailResult.error) throw detailResult.error;
      if (reportResult.error) throw reportResult.error;
      const detailData = asObject(detailResult.data);
      if (needsDetails && !detailData) throw new Error('Attendance service returned an invalid response.');
      if (canReport && reportResult.data !== null && !Array.isArray(reportResult.data)) {
        throw new Error('Attendance report returned an invalid response.');
      }
      setRecords(canReport ? asRows(reportResult.data) : asRows(detailData?.records));
      setCorrections(asRows(detailData?.corrections));
    } catch (cause) {
      setRecords([]); setCorrections([]);
      setError(cause instanceof Error ? cause.message : 'Unable to load attendance records.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [tenantId, from, to, submittedSearch, status, canReport]);

  async function resolveCorrection(id: string, decision: 'approved' | 'rejected') {
    if (resolvingCorrectionId) return;
    if (decision === 'rejected' && !window.confirm('Reject this attendance correction?')) return;
    setResolvingCorrectionId(id); setActionMessage(''); setError('');
    try {
      const { error: rpcError } = await supabase.rpc('admin_resolve_attendance_correction', {
        p_id: id, p_decision: decision, p_note: null,
      });
      if (rpcError) throw rpcError;
      setActionMessage(`Attendance correction ${decision}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to resolve this correction.');
    } finally { setResolvingCorrectionId(''); }
  }

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
    {actionMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{actionMessage}</p>}
    {corrections.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="font-medium">Attendance correction requests</h3>
      <p className="mt-1 text-sm text-slate-600">{corrections.filter(item => item.status === 'pending').length} pending in this date range.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[#eff7f8] text-xs text-slate-600"><tr>
            {['Employee', 'Date', 'Requested change', 'Reason', 'Status', ...(canManage ? ['Actions'] : [])].map(label =>
              <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100">{corrections.map((item, index) => <tr key={String(item.id || index)}>
            <td className="px-3 py-3">{display(item.full_name)}</td>
            <td className="px-3 py-3">{display(item.attendance_date)}</td>
            <td className="px-3 py-3">{[
              item.requested_check_in ? `In ${displayTime(item.requested_check_in)}` : '',
              item.requested_check_out ? `Out ${displayTime(item.requested_check_out)}` : '',
              item.requested_work_mode ? `Mode ${String(item.requested_work_mode)}` : '',
            ].filter(Boolean).join(' · ') || '—'}</td>
            <td className="px-3 py-3">{display(item.reason)}</td>
            <td className="px-3 py-3 capitalize">{display(item.status)}</td>
            {canManage && <td className="px-3 py-3">
              {item.status === 'pending' ? <div className="flex gap-2">
                <button type="button" disabled={Boolean(resolvingCorrectionId)} onClick={() => void resolveCorrection(String(item.id), 'approved')}
                  className="min-h-10 rounded-md bg-[#08558B] px-3 text-xs font-medium text-white disabled:opacity-50">
                  {resolvingCorrectionId === item.id ? 'Saving…' : 'Approve'}
                </button>
                <button type="button" disabled={Boolean(resolvingCorrectionId)} onClick={() => void resolveCorrection(String(item.id), 'rejected')}
                  className="min-h-10 rounded-md border border-slate-300 px-3 text-xs font-medium disabled:opacity-50">Reject</button>
              </div> : '—'}
            </td>}
          </tr>)}</tbody>
        </table>
      </div>
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

function LeaveWorkspace({ tenantId, canManage }: { tenantId: string; canManage: boolean }) {
  const [data, setData] = useState<LeaveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resolvingRequestId, setResolvingRequestId] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const { data: response, error: rpcError } = await supabase.rpc('hris_get_tenant_leave_data', {
        p_tenant_id: tenantId, p_start: null, p_end: null,
      });
      if (rpcError) throw rpcError;
      const value = asObject(response);
      if (!value) throw new Error('Leave service returned an invalid response.');
      setData({ requests: asRows(value.requests), leave_types: asRows(value.leave_types), holidays: asRows(value.holidays) });
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : 'Unable to load leave data.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [tenantId]);
  const pending = useMemo(() => (data?.requests || []).filter(item => item.status === 'pending'), [data]);

  async function resolveRequest(id: string, decision: 'approved' | 'rejected') {
    if (resolvingRequestId) return;
    if (decision === 'rejected' && !window.confirm('Reject this leave request?')) return;
    setResolvingRequestId(id); setActionMessage(''); setError('');
    try {
      const { error: rpcError } = await supabase.rpc('admin_resolve_leave_request', {
        p_id: id, p_decision: decision, p_note: null,
      });
      if (rpcError) throw rpcError;
      setActionMessage(`Leave request ${decision}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to resolve this leave request.');
    } finally { setResolvingRequestId(''); }
  }

  return <section aria-labelledby="leave-workspace-heading" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="leave-workspace-heading" className="text-2xl font-medium text-[#49454F]">Leave Requests</h2>
        <p className="mt-1 text-sm text-slate-500">Tenant leave records returned by the authorized HRIS service</p></div>
      <button type="button" disabled={loading} onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
        <RefreshCw className="h-4 w-4" /> Refresh
      </button>
    </div>
    {error && <StatusMessage error={error} onRetry={() => void load()} />}
    {actionMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{actionMessage}</p>}
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
              {['Employee', 'Leave type', 'From', 'To', 'Days', 'Status', ...(canManage ? ['Actions'] : [])].map(label => <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{data.requests.map((row, index) => <tr key={String(row.id || index)}>
              <td className="px-3 py-3 font-medium">{display(row.full_name)}</td><td className="px-3 py-3">{display(row.leave_type_name)}</td>
              <td className="px-3 py-3">{display(row.from_date)}</td><td className="px-3 py-3">{display(row.to_date)}</td>
              <td className="px-3 py-3">{display(row.requested_days)}</td><td className="px-3 py-3">{display(row.status)}</td>
              {canManage && <td className="px-3 py-3">
                {row.status === 'pending' ? <div className="flex gap-2">
                  <button type="button" disabled={Boolean(resolvingRequestId)} onClick={() => void resolveRequest(String(row.id), 'approved')}
                    className="min-h-10 rounded-md bg-[#08558B] px-3 text-xs font-medium text-white disabled:opacity-50">
                    {resolvingRequestId === row.id ? 'Saving…' : 'Approve'}
                  </button>
                  <button type="button" disabled={Boolean(resolvingRequestId)} onClick={() => void resolveRequest(String(row.id), 'rejected')}
                    className="min-h-10 rounded-md border border-slate-300 px-3 text-xs font-medium disabled:opacity-50">Reject</button>
                </div> : '—'}
              </td>}
            </tr>)}</tbody>
          </table>
        </div>}
      </div>
    </>}
  </section>;
}

function PersonalLeaveRequests({
  tenantId, userId, leave, onRefresh,
}: {
  tenantId: string;
  userId: string;
  leave: Record<string, unknown>;
  onRefresh: () => Promise<void>;
}) {
  const [requestOpen, setRequestOpen] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [dayPortion, setDayPortion] = useState('full');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const requestButtonRef = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);
  const leaveTypes = asRows(leave.leave_types);
  const balances = asRows(leave.balances);
  const requests = asRows(leave.requests);
  const selectedLeaveType = leaveTypes.find(item => item.id === leaveTypeId);

  useEffect(() => {
    if (!requestOpen) return;
    const dialog = dialogRef.current;
    const focusable = (): HTMLElement[] => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) || []);
    focusable()[0]?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submittingRef.current) {
        setRequestOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      requestButtonRef.current?.focus();
    };
  }, [requestOpen]);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    const selected = leaveTypes.find(item => item.id === leaveTypeId);
    if (!selected) { setFormError('Choose a leave type.'); return; }
    if (fromDate > toDate) { setFormError('The end date must be on or after the start date.'); return; }
    if (dayPortion !== 'full' && fromDate !== toDate) {
      setFormError('A half-day request must use one date.'); return;
    }
    if (selected.requires_document_proof === true && !evidence) {
      setFormError('Upload supporting evidence for this leave type.'); return;
    }
    const allowedMimeTypes = new Set([
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg', 'image/png',
    ]);
    if (evidence && (!allowedMimeTypes.has(evidence.type) || evidence.size > 10 * 1024 * 1024)) {
      setFormError('Use a PDF, Word document, JPG, or PNG up to 10 MB.'); return;
    }

    submittingRef.current = true;
    setSubmitting(true); setFormError(''); setSuccess('');
    let uploadedPath = '';
    try {
      if (evidence) {
        const extensionByMime: Record<string, string> = {
          'application/pdf': 'pdf',
          'application/msword': 'doc',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
          'image/jpeg': 'jpg',
          'image/png': 'png',
        };
        uploadedPath = `${userId}/${tenantId}/${crypto.randomUUID()}.${extensionByMime[evidence.type]}`;
        const upload = await supabase.storage.from('leave-evidence').upload(uploadedPath, evidence, {
          contentType: evidence.type, upsert: false,
        });
        if (upload.error) throw upload.error;
      }
      const { data, error: rpcError } = await supabase.rpc('hris_employee_submit_leave_request', {
        p_tenant_id: tenantId,
        p_payload: {
          leave_type_id: leaveTypeId,
          from_date: fromDate,
          to_date: toDate,
          day_portion: dayPortion,
          reason: reason.trim(),
          attachment_url: uploadedPath || null,
        },
      });
      if (rpcError) throw rpcError;
      if (!data) throw new Error('The leave request was not confirmed. Refresh and check your request history.');
      setSuccess('Leave request submitted. You can follow its status in your history.');
      setRequestOpen(false);
      setLeaveTypeId(''); setFromDate(''); setToDate(''); setDayPortion('full');
      setReason(''); setEvidence(null);
      await onRefresh();
    } catch (cause) {
      let cleanupFailed = false;
      if (uploadedPath) {
        try {
          const cleanup = await supabase.storage.from('leave-evidence').remove([uploadedPath]);
          cleanupFailed = Boolean(cleanup.error);
        } catch {
          cleanupFailed = true;
        }
      }
      const message = cause instanceof Error ? cause.message : 'Unable to submit this leave request.';
      setFormError(cleanupFailed
        ? `${message} The private evidence upload could not be removed; please contact HRIS support.`
        : message);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return <>
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="personal-leave-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 id="personal-leave-heading" className="text-lg font-semibold text-[#49454F]">My leave</h3>
          <p className="mt-1 text-sm text-slate-600">Current-year balances and your request history</p></div>
        <button ref={requestButtonRef} type="button" disabled={!leaveTypes.length} onClick={() => { setFormError(''); setRequestOpen(true); }}
          className="min-h-11 rounded-lg bg-[#08558B] px-5 text-sm font-medium text-white shadow-[0_3px_0_#02395c] disabled:cursor-not-allowed disabled:opacity-50">
          Request for leave
        </button>
      </div>
      {success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
      {balances.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
        {balances.map((item, index) => <div key={String(item.leave_type_id || index)} className="rounded-md border border-slate-200 p-3">
          <p className="truncate text-sm font-semibold text-[#49454F]">{display(item.leave_type_name)}</p>
          <p className="mt-1 text-sm text-slate-700">{display(item.available_days)} available</p>
        </div>)}
      </div>}
      <div>
        <h4 className="mb-2 font-medium text-slate-800">Leave request history</h4>
        {!requests.length ? <p className="rounded-lg bg-[#EFF7F8] p-4 text-sm text-slate-600">No leave requests yet.</p> :
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-[#EFF7F8] text-xs text-slate-600"><tr>
                {['Leave type', 'From', 'To', 'Days', 'Reason', 'Status'].map(label => <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">{requests.map((item, index) => <tr key={String(item.id || index)}>
                <td className="px-3 py-3">{display(item.leave_type_name)}</td>
                <td className="px-3 py-3">{display(item.from_date)}</td>
                <td className="px-3 py-3">{display(item.to_date)}</td>
                <td className="px-3 py-3">{display(item.requested_days)}</td>
                <td className="max-w-48 px-3 py-3" title={String(item.reason || '')}>
                  <span className="block truncate">{display(item.reason)}</span>
                  {Boolean(item.resolution_note) && <span className="block truncate text-xs text-slate-500">{display(item.resolution_note)}</span>}
                </td>
                <td className="px-3 py-3 font-medium">{display(item.status)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
      </div>
    </section>

    {requestOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-3 py-4" role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget && !submitting) setRequestOpen(false); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="request-leave-title"
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-[667px] flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 id="request-leave-title" className="text-lg font-semibold text-slate-950">Request for leave</h2>
          <button type="button" onClick={() => setRequestOpen(false)} disabled={submitting} className="min-h-11 min-w-11 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-50" aria-label="Close leave request">
            <X className="mx-auto h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submitRequest} className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-4 overflow-y-auto px-6 py-5">
            {balances.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {balances.slice(0, 4).map((item, index) => <div key={String(item.leave_type_id || index)} className="rounded-md border border-slate-200 p-2">
                <p className="truncate text-sm font-semibold text-[#49454F]">{display(item.leave_type_name)}</p>
                <p className="mt-1 text-sm text-slate-700">{display(item.available_days)}</p>
              </div>)}
            </div>}
            <div><label htmlFor="personal-leave-type" className="mb-1 block text-sm font-medium text-slate-700">Leave type <span aria-hidden="true">*</span></label>
              <select id="personal-leave-type" required value={leaveTypeId} onChange={event => setLeaveTypeId(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                <option value="">Choose a leave type</option>{leaveTypes.map(item => <option key={String(item.id)} value={String(item.id)}>{display(item.name)}</option>)}
              </select>
              {selectedLeaveType?.min_days_notice != null && Number(selectedLeaveType.min_days_notice) > 0 &&
                <p className="mt-1 text-xs text-slate-600">This leave type requires {display(selectedLeaveType.min_days_notice)} days’ advance notice.</p>}
              {selectedLeaveType?.requires_document_proof === true && <p className="mt-1 text-xs text-slate-600">Supporting evidence is required for this leave type.</p>}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label htmlFor="personal-leave-from" className="mb-1 block text-sm font-medium text-slate-700">From date <span aria-hidden="true">*</span></label>
                <input id="personal-leave-from" type="date" required value={fromDate} onChange={event => setFromDate(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
              <div><label htmlFor="personal-leave-to" className="mb-1 block text-sm font-medium text-slate-700">To date <span aria-hidden="true">*</span></label>
                <input id="personal-leave-to" type="date" required min={fromDate || undefined} value={toDate} onChange={event => setToDate(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
            </div>
            <div><label htmlFor="personal-leave-portion" className="mb-1 block text-sm font-medium text-slate-700">Day portion</label>
              <select id="personal-leave-portion" value={dayPortion} onChange={event => setDayPortion(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                <option value="full">Full day</option><option value="first_half">First half</option><option value="second_half">Second half</option>
              </select>
              {dayPortion !== 'full' && <p className="mt-1 text-xs text-slate-600">Half-day leave can be requested for one date only.</p>}
            </div>
            <div><label htmlFor="personal-leave-reason" className="mb-1 block text-sm font-medium text-slate-700">Reason <span aria-hidden="true">*</span></label>
              <textarea id="personal-leave-reason" required rows={3} value={reason} onChange={event => setReason(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
            <div><label htmlFor="personal-leave-evidence" className="mb-1 block text-sm font-medium text-slate-700">Supporting evidence {selectedLeaveType?.requires_document_proof === true ? <span aria-hidden="true">*</span> : <span className="text-slate-500">(optional)</span>}</label>
              <input id="personal-leave-evidence" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" required={selectedLeaveType?.requires_document_proof === true}
                onChange={event => setEvidence(event.target.files?.[0] || null)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <p className="mt-1 text-xs text-slate-600">PDF, Word, JPG, or PNG up to 10 MB. Evidence is private to you and authorized leave managers in this organization.</p>
            </div>
            {formError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{formError}</p>}
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
            <button type="button" disabled={submitting} onClick={() => setRequestOpen(false)} className="min-h-11 rounded-lg px-4 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={submitting || !leaveTypes.length} className="min-h-11 rounded-lg bg-[#08558B] px-5 text-sm font-medium text-white disabled:opacity-50">
              {submitting ? 'Sending…' : 'Send request'}
            </button>
          </div>
        </form>
      </div>
    </div>}
  </>;
}

function EmployeeOverview({ tenantId, userId }: { tenantId: string; userId: string }) {
  const [attendance, setAttendance] = useState<Record<string, unknown> | null>(null);
  const [leave, setLeave] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('hris_get_my_dashboard_data', {
        p_tenant_id: tenantId,
      });
      if (rpcError) throw rpcError;
      const leaveData = asObject(data);
      const attendanceData = asObject(leaveData?.attendance);
      if (!attendanceData || !leaveData) throw new Error('Employee services returned an invalid response.');
      setAttendance(attendanceData);
      setLeave(leaveData);
    } catch (cause) {
      setAttendance(null); setLeave(null);
      setError(cause instanceof Error ? cause.message : 'Unable to load your HRIS summary.');
    } finally { if (showLoading) setLoading(false); }
  }

  useEffect(() => { void load(); }, [tenantId]);
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
      <PersonalLeaveRequests tenantId={tenantId} userId={userId} leave={leave} onRefresh={() => load(false)} />
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
  userId, userEmail, tenantId, tenantName, tenants, onTenantChange, onSignOut, isSuperAdmin, isEmployee,
  permissions = emptyPermissions,
}: {
  userId: string;
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
        <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{group === 'HRIS' ? 'Workforce' : 'Self service'}</p>
        {items.map(item => <button key={item.id} type="button" title={item.label} onClick={() => navigate(item.id)} aria-current={page === item.id ? 'page' : undefined}
          className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-lg px-2 text-center text-[11px] focus-visible:outline-2 focus-visible:outline-[#085587] ${page === item.id ? 'bg-[#DCEFF4] text-[#085587] font-semibold' : 'text-slate-700 hover:bg-white hover:text-[#085587]'}`}>
          {item.icon}<span className="leading-tight">{item.label}</span>
        </button>)}
      </div> : null;
    })}
  </nav>;

  return <div className="min-h-screen bg-[#EFF7F8] text-slate-900">
    <header className="sticky top-0 z-30 flex min-h-[72px] flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 sm:px-4 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={() => setMobileOpen(true)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border text-slate-700 lg:hidden" aria-label="Open navigation menu"><Menu className="h-5 w-5" /></button>
        <div className="flex min-w-0 items-center gap-2">
          <div className="shrink-0 leading-none"><p className="text-sm font-bold tracking-[0.12em] text-[#085587]">SYNESIS</p><p className="mt-1 text-[9px] font-medium tracking-[0.16em] text-slate-500">HRIS 360°</p></div>
          <span className="hidden h-8 border-l border-slate-200 sm:block" aria-hidden="true" />
          <p className="hidden truncate text-xs text-slate-500 sm:block">{tenantName}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {tenants.length > 1 && <div><label className="sr-only" htmlFor="workspace-tenant">Organization</label><select id="workspace-tenant" value={tenantId} onChange={event => onTenantChange(event.target.value)} className="min-h-11 max-w-[210px] rounded-lg border border-slate-300 bg-white px-2 text-sm">
          {tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
        </select></div>}
        <span className="hidden max-w-56 truncate text-xs text-slate-500 md:block" title={userEmail}>{userEmail}</span>
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#DCEFF4] text-sm font-semibold text-[#085587]">{userEmail.slice(0, 1).toUpperCase()}</span>
        <span className="hidden rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 sm:inline-flex items-center gap-1"><ShieldCheck className="h-4 w-4" />{roleLabel}</span>
        <button type="button" onClick={onSignOut} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span></button>
      </div>
    </header>
    <div className="flex min-h-[calc(100vh-4.5rem)]">
      <aside className="sticky top-[72px] hidden h-[calc(100vh-4.5rem)] w-[111px] shrink-0 overflow-y-auto border-r border-slate-200 bg-[#E7F1F3] p-2 lg:block">{navigation}</aside>
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1600px]">
          {current && <div className="mb-4 flex items-center gap-2 text-xs text-slate-500"><span>{tenantName}</span><span aria-hidden="true">/</span><span className="text-slate-700">{current.label}</span></div>}
          {page === 'dashboard' && permissions.dashboard && <LiveDashboard tenantId={tenantId} onOpen={navigate} />}
          {page === 'attendance' && permissions.attendance && <AttendanceReport
            tenantId={tenantId} canReport={permissions.attendanceReport} canManage={permissions.attendanceManage}
          />}
          {page === 'leave' && permissions.leave && <LeaveWorkspace tenantId={tenantId} canManage={permissions.leaveManage} />}
          {page === 'my-dashboard' && isEmployee && <EmployeeOverview tenantId={tenantId} userId={userId} />}
          {!nav.length && <section className="mx-auto mt-12 max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-[#08558B]" /><h2 className="mt-3 text-lg font-semibold">No HRIS modules are available for this account</h2>
            <p className="mt-2 text-sm text-slate-600">Your sign-in succeeded, but no active employee link or supported module permission was returned. No sample records are shown.</p>
          </section>}
        </div>
      </main>
    </div>
    {mobileOpen && <div className="fixed inset-0 z-50 bg-slate-950/40 lg:hidden" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setMobileOpen(false); }}>
      <aside aria-label="HRIS navigation" className="h-full w-72 max-w-[85vw] overflow-y-auto bg-[#E7F1F3] p-4 text-slate-900 shadow-xl">
        <div className="mb-3 flex items-center justify-between"><span className="font-semibold">Navigation</span><button type="button" onClick={() => setMobileOpen(false)} className="min-h-11 min-w-11 rounded-lg border" aria-label="Close navigation menu"><X className="mx-auto h-4 w-4" /></button></div>
        {navigation}
      </aside>
    </div>}
  </div>;
}

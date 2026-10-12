import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import attendanceDownloadIcon from '../assets/attendance-download.png';
import attendanceFilterIcon from '../assets/attendance-filter.svg';
import attendanceSearchIcon from '../assets/attendance-search.svg';
import attendanceTeamSortIcon from '../assets/attendance-team-sort.svg';
import {
  Activity, BriefcaseBusiness, Building2, CalendarDays, CheckCircle2,
  ClipboardList, Clock3, Download, House, LayoutDashboard, LogOut, Mail, MapPin, Menu,
  RefreshCw, Search, ShieldCheck, SlidersHorizontal, Users, X, XCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type TenantOption = { id: string; name: string; slug: string };
type PermissionSet = {
  dashboard: boolean;
  attendance: boolean;
  attendanceView: boolean;
  attendanceManage: boolean;
  attendanceReport: boolean;
  leave: boolean;
  leaveManage: boolean;
};
type PageId = 'dashboard' | 'attendance' | 'shift-roster' | 'leave' | 'my-dashboard' | 'my-leave';
type DashboardPoint = { date: string; records: number };
type DashboardSummary = {
  dashboard_date?: string;
  employees?: number;
  team_members?: number;
  probation_employees?: number;
  attendance_today?: number;
  present_today?: number;
  absent_today?: number;
  wfo_today?: number;
  wfh_today?: number;
  client_meeting_today?: number;
  on_leave_today?: number;
  late_today?: number;
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
  attendance_last_30_days?: DashboardPoint[];
};
type AttendanceRecord = Record<string, unknown>;
type LeaveRequest = Record<string, unknown>;
type LeaveData = {
  requests: LeaveRequest[];
  leave_types: Record<string, unknown>[];
  holidays: Record<string, unknown>[];
};

const emptyPermissions: PermissionSet = {
  dashboard: false, attendance: false, attendanceView: false, attendanceManage: false,
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

function displayShortDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return display(value);
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function displayWorkMode(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'Not recorded';
  return value.trim().replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function displayAttendanceDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return display(value);
  const [, year, month, day] = value.match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
  return `${day}-${month}-${year}`;
}

function nameInitials(value: unknown): string {
  const initials = display(value).split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('');
  return initials.toUpperCase() || '—';
}

function localIsoDate(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function startOfRecentWeek(): string {
  const date = new Date();
  date.setDate(date.getDate() - 6);
  return localIsoDate(date);
}

function endOfUpcomingWeek(): string {
  const date = new Date();
  date.setDate(date.getDate() + 6);
  return localIsoDate(date);
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  // CSV quoting does not stop spreadsheet formula evaluation after import.
  const startsWithFormula = /^\s*[=+\-@]/.test(text);
  const isNumericLiteral = (typeof value === 'number' && Number.isFinite(value))
    || (typeof value === 'string' && /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*$/i.test(value));
  const safeText = startsWithFormula && !isNumericLiteral ? "'" + text : text;
  return '"' + safeText.replaceAll('"', '""') + '"';
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
  const content = <>
    <span className="flex items-center justify-between gap-3 text-sm text-slate-600"><span>{label}</span><span className="text-[#08558B]">{icon}</span></span>
    <span className="mt-3 block text-2xl font-semibold tabular-nums text-slate-900">{display(value)}</span>
  </>;
  const className = `min-h-[108px] rounded-lg border border-[#DEE0E3] bg-white p-4 text-left shadow-sm ${onOpen ? 'hover:border-[#08558B] focus-visible:outline-2 focus-visible:outline-[#08558B]' : ''}`;
  return onOpen
    ? <button type="button" onClick={onOpen} className={className}>{content}</button>
    : <div className={className}>{content}</div>;
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
        {(safePoints.length <= 7 || index % 5 === 0 || index === safePoints.length - 1) &&
          <text x={point.x} y="202" textAnchor="middle" fontSize="10" fill="#615E83">
            {new Date(`${point.point.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </text>}
      </g>)}
    </svg>
  </div>;
}

function LiveDashboard({ tenantId, onOpen }: { tenantId: string; onOpen: (page: PageId) => void }) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState('');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [chartRange, setChartRange] = useState<'7' | '30'>('7');

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
  useEffect(() => {
    if (summary && (!Array.isArray(summary.attendance_last_30_days) || summary.attendance_last_30_days.length < 30)) {
      setChartRange('7');
    }
  }, [summary]);

  const metrics = [
    { label: 'Team Members', value: summary?.team_members ?? summary?.employees, icon: <Users className="h-5 w-5" /> },
    { label: 'Present', value: summary?.present_today, icon: <CheckCircle2 className="h-5 w-5" />, page: 'attendance' as PageId },
    { label: 'Absent', value: summary?.absent_today, icon: <XCircle className="h-5 w-5" />, page: 'attendance' as PageId },
    { label: 'WFO', value: summary?.wfo_today, icon: <Building2 className="h-5 w-5" />, page: 'attendance' as PageId },
    { label: 'WFH', value: summary?.wfh_today, icon: <House className="h-5 w-5" />, page: 'attendance' as PageId },
    { label: 'Client Meeting', value: summary?.client_meeting_today, icon: <BriefcaseBusiness className="h-5 w-5" />, page: 'attendance' as PageId },
    { label: 'On Leave', value: summary?.on_leave_today, icon: <CalendarDays className="h-5 w-5" />, page: 'leave' as PageId },
    { label: 'Late', value: summary?.late_today, icon: <Clock3 className="h-5 w-5" />, page: 'attendance' as PageId },
  ];
  const visibleMetrics = metrics.filter(metric => metric.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const has30DayTrend = Array.isArray(summary?.attendance_last_30_days) && summary.attendance_last_30_days.length >= 30;
  const activeChartRange = chartRange === '30' && has30DayTrend ? '30' : '7';
  const trendSource = has30DayTrend ? summary?.attendance_last_30_days || [] : summary?.attendance_last_7_days || [];
  const trendPoints = trendSource.slice(-Number(activeChartRange));

  function downloadReport() {
    if (!summary) return;
    const rows: unknown[][] = [
      ['Today', 'Team Members', summary.team_members ?? summary.employees],
      ...metrics.slice(1).map(metric => ['Today', metric.label, metric.value]),
      ...trendPoints.map(point => ['Attendance trend', point.date, point.records]),
    ];
    downloadCsv(`managerial-dashboard-${summary.dashboard_date || localIsoDate(new Date())}.csv`, ['Section', 'Metric', 'Value'], rows);
  }

  return <section aria-labelledby="live-dashboard-heading" className="space-y-5">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div><h2 id="live-dashboard-heading" className="text-2xl font-semibold text-[#1E1B39]">Managerial Dashboard</h2>
        <p className="mt-1 text-sm text-[#86929E]">Today’s workforce attendance for this organization</p></div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(220px,1fr)_auto_auto] xl:min-w-[540px]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86929E]" />
          <input type="search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Search metrics" aria-label="Search dashboard metrics"
            className="min-h-11 w-full rounded-lg border border-[#DEE0E3] bg-white py-2 pl-9 pr-3 text-sm text-[#1E1B39] placeholder:text-[#86929E] focus:outline-2 focus:outline-[#08558B]" />
        </label>
        <button type="button" disabled={loading || !summary} onClick={downloadReport}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#DEE0E3] bg-white px-3 text-sm font-medium text-[#1E1B39] hover:border-[#08558B] disabled:opacity-50">
          <Download className="h-4 w-4" /> Download Report
        </button>
        <button type="button" onClick={() => setFiltersOpen(open => !open)} aria-expanded={filtersOpen}
          aria-controls="dashboard-filters" aria-label="Filter attendance chart"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[#DEE0E3] bg-white text-[#49454F] hover:border-[#08558B] focus-visible:outline-2 focus-visible:outline-[#08558B]">
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
    {filtersOpen && <div id="dashboard-filters" className="flex flex-wrap items-end gap-3 rounded-lg border border-[#DEE0E3] bg-white p-4">
      <div><label htmlFor="dashboard-chart-range" className="mb-1 block text-xs font-medium text-slate-600">Attendance chart range</label>
        <select id="dashboard-chart-range" value={chartRange} onChange={event => setChartRange(event.target.value as '7' | '30')}
          className="min-h-11 min-w-44 rounded-lg border border-slate-300 bg-white px-3 text-sm">
          <option value="7">Last 7 days</option><option value="30" disabled={!has30DayTrend}>Last 30 days</option>
        </select></div>
      <p className="pb-2 text-xs text-slate-500">Attendance tiles above always summarize today.</p>
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      {refreshedAt ? <p className="text-xs text-slate-500">Last refreshed {refreshedAt}</p> : <span />}
      <button type="button" disabled={loading} onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm text-[#49454F] hover:bg-white disabled:opacity-50">
        <RefreshCw className="h-4 w-4" /> Refresh
      </button>
    </div>
    {error && <StatusMessage error={error} onRetry={() => void load()} />}
    {loading && !summary ? <p role="status" className="rounded-lg border bg-white p-5 text-sm">Loading authorized dashboard data…</p> : summary && <>
      <section className="rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5" aria-labelledby="today-attendance-heading">
        <div className="mb-4 border-b border-[#E5E5EF] pb-3"><h3 id="today-attendance-heading" className="text-base font-semibold text-[#1E1B39]">Today’s Attendance Summary</h3>
          <p className="mt-1 text-xs text-[#86929E]">Live counts from this organization’s authorized records</p></div>
        {visibleMetrics.length ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {visibleMetrics.map(metric => <Metric key={metric.label} label={metric.label} value={metric.value} icon={metric.icon}
            onOpen={metric.page ? () => onOpen(metric.page!) : undefined} />)}
        </div> : <p role="status" className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No dashboard metrics match “{search}”.</p>}
      </section>
      <section className="rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5" aria-labelledby="attendance-trend-heading">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#E5E5EF] pb-3"><div><h3 id="attendance-trend-heading" className="text-base font-semibold text-[#1E1B39]">Daily Attendance</h3>
          <p className="mt-1 text-xs text-[#86929E]">Recorded attendance by day · last {activeChartRange} days</p></div>
          <span className="rounded-md bg-[#EFF7F8] px-2 py-1 text-xs text-[#615E83]">{trendPoints.reduce((sum, point) => sum + Number(point.records || 0), 0).toLocaleString()} records</span></div>
        <AttendanceTrend points={trendPoints} />
      </section>
      <section aria-labelledby="dashboard-actions-heading" className="rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3"><h3 id="dashboard-actions-heading" className="text-base font-semibold text-[#1E1B39]">Needs attention</h3>
          <p className="mt-1 text-xs text-[#86929E]">Open a work queue to review pending items.</p></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Metric label="Pending attendance corrections" value={summary.attendance_corrections_pending} icon={<Activity className="h-5 w-5" />} onOpen={() => onOpen('attendance')} />
          <Metric label="Pending leave requests" value={summary.leave_pending} icon={<ClipboardList className="h-5 w-5" />} onOpen={() => onOpen('leave')} />
        </div>
      </section>
      <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        Present, absent, and late counts use explicit attendance statuses. Work location uses stored attendance modes; “On Leave” counts approved leave covering today. No schedule-based late marks or sample counts are substituted.
      </p>
    </>}
  </section>;
}

function AttendanceReport({ tenantId, canView, canReport, canManage }: { tenantId: string; canView: boolean; canReport: boolean; canManage: boolean }) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [corrections, setCorrections] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dataTenantId, setDataTenantId] = useState('');
  const [from, setFrom] = useState(startOfRecentWeek);
  const [to, setTo] = useState(localIsoDate(new Date()));
  const [draftFrom, setDraftFrom] = useState(startOfRecentWeek);
  const [draftTo, setDraftTo] = useState(localIsoDate(new Date()));
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState('');
  const [appliedTeamFilter, setAppliedTeamFilter] = useState('');
  const [teamSortDirection, setTeamSortDirection] = useState<'asc' | 'desc' | null>(null);
  const [status, setStatus] = useState('all');
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [resolvingCorrectionId, setResolvingCorrectionId] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const requestSequence = useRef(0);
  const showDetails = canView || canManage;
  const aggregateOnly = canReport && !showDetails;

  async function load() {
    const requestId = ++requestSequence.current;
    setLoading(true); setError('');
    if (dataTenantId !== tenantId) setActionMessage('');
    try {
      if (from > to) throw new Error('Choose a valid date range.');
      const parameters = {
        p_tenant_id: tenantId, p_start: from, p_end: to,
        p_search: submittedSearch || null,
      };
      const needsDetails = showDetails;
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
      if (requestId !== requestSequence.current) return;
      const detailRows = asRows(detailData?.records);
      setRecords(showDetails ? detailRows : asRows(reportResult.data));
      setCorrections(asRows(detailData?.corrections));
      if (showDetails) {
        const availableStatuses = Array.from(new Set(detailRows.map(row => String(row.status || '')).filter(Boolean))).sort();
        setStatusOptions(status === 'all' ? availableStatuses
          : previous => Array.from(new Set([...previous, ...availableStatuses, status])).sort());
      } else setStatusOptions([]);
      setDataTenantId(tenantId);
    } catch (cause) {
      if (requestId !== requestSequence.current) return;
      setRecords([]); setCorrections([]);
      setDataTenantId(tenantId);
      setError(cause instanceof Error ? cause.message : 'Unable to load attendance records.');
    } finally { if (requestId === requestSequence.current) setLoading(false); }
  }

  useEffect(() => {
    void load();
    return () => { requestSequence.current += 1; };
  }, [tenantId, from, to, submittedSearch, status, canReport, canView, canManage]);

  useEffect(() => {
    setSelectedTeamFilter('');
    setAppliedTeamFilter('');
  }, [tenantId, submittedSearch]);

  function applyReportFilters() {
    if (draftFrom > draftTo) {
      setError('Choose a valid date range.');
      return;
    }
    setError('');
    setFrom(draftFrom);
    setTo(draftTo);
    setAppliedTeamFilter(selectedTeamFilter);
  }

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
    const exportRows = filteredRows;
    if (!exportRows.length) return;
    const fields = aggregateOnly
      ? ['employee_name', 'employee_number', 'designation_title', 'team_name', 'department_name', 'attendance_days', 'office_hours', 'working_hours', 'deviation']
      : ['full_name', 'employee_number', 'designation_title', 'department_name', 'attendance_date', 'check_in', 'check_out', 'work_mode', 'status', 'work_hours'];
    const labels = aggregateOnly
      ? ['Employee', 'Employee number', 'Designation', 'Team Name', 'Department', 'Attendance days', 'Office hours', 'Working hours', 'Deviation']
      : ['Employee', 'Employee number', 'Designation', 'Department', 'Date', 'Check in', 'Check out', 'Work location', 'Status', 'Working hours'];
    downloadCsv(`attendance-report-${from}-${to}.csv`, labels, exportRows.map(row => fields.map(field => row[field])));
  }

  const currentTenantReady = dataTenantId === tenantId;
  const currentRecords = currentTenantReady ? records : [];
  const currentCorrections = currentTenantReady ? corrections : [];
  const teamOptions = useMemo(() => {
    if (!aggregateOnly) return [];
    const names = new Set(currentRecords.map(row => String(row.team_name ?? '').trim()).filter(Boolean));
    const options = Array.from(names).sort((left, right) => left.localeCompare(right))
      .map(name => ({ value: name, label: name }));
    if (currentRecords.some(row => !String(row.team_name ?? '').trim())) {
      options.push({ value: '__NO_TEAM__', label: 'Unassigned' });
    }
    if (selectedTeamFilter && !options.some(option => option.value === selectedTeamFilter)) {
      options.push({ value: selectedTeamFilter, label: selectedTeamFilter === '__NO_TEAM__' ? 'Unassigned' : selectedTeamFilter });
    }
    return options;
  }, [aggregateOnly, currentRecords, selectedTeamFilter]);
  const filteredRows = useMemo(() => {
    const matchingRows = !aggregateOnly || !appliedTeamFilter ? currentRecords : currentRecords.filter(row => appliedTeamFilter === '__NO_TEAM__'
      ? !String(row.team_name ?? '').trim()
      : String(row.team_name ?? '').trim() === appliedTeamFilter);
    if (!aggregateOnly || !teamSortDirection) return matchingRows;
    const direction = teamSortDirection === 'asc' ? 1 : -1;
    return matchingRows.map((row, index) => ({ row, index })).sort((left, right) => {
      const leftTeam = String(left.row.team_name ?? '').trim();
      const rightTeam = String(right.row.team_name ?? '').trim();
      if (!leftTeam && rightTeam) return 1;
      if (leftTeam && !rightTeam) return -1;
      return leftTeam.localeCompare(rightTeam, undefined, { sensitivity: 'base' }) * direction || left.index - right.index;
    }).map(item => item.row);
  }, [aggregateOnly, appliedTeamFilter, currentRecords, teamSortDirection]);
  const rows = filteredRows;

  return <section aria-labelledby="attendance-report-heading" className="space-y-4">
    <div className={`flex flex-wrap justify-between gap-3 ${aggregateOnly ? 'items-center' : 'items-end'}`}>
      <div><h2 id="attendance-report-heading" className="text-2xl font-medium text-[#49454F]">Attendance Report</h2>
        {!aggregateOnly && <p className="mt-1 text-sm text-slate-500">Attendance for your current organization and date range</p>}</div>
      {aggregateOnly && <form aria-label="Attendance report controls" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSubmittedSearch(search.trim()); }} className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">
        <div className="relative min-w-[220px] flex-1 lg:w-[334px] lg:flex-none"><label htmlFor="attendance-search" className="sr-only">Search employees</label>
          <img src={attendanceSearchIcon} alt="" className="pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2" />
          <input id="attendance-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search...." className="min-h-12 w-full rounded-lg border border-[#DEE0E3] bg-white pl-[33px] pr-3 text-sm placeholder:text-[#86929E]" />
          <button type="submit" className="sr-only">Search employees</button>
        </div>
        <button type="button" disabled={!filteredRows.length} onClick={exportReport} className="inline-flex min-h-12 items-center gap-1.5 rounded-lg border border-[#DEE0E3] bg-white px-[14px] text-sm text-[#86929E] disabled:opacity-50 lg:w-[184px]">
          <img src={attendanceDownloadIcon} alt="" className="h-3 w-2.5 shrink-0 object-contain" /> Download Report
        </button>
        <button type="button" aria-expanded={filtersOpen} aria-controls="attendance-filters" onClick={() => setFiltersOpen(value => !value)} className="inline-flex min-h-12 w-16 items-center justify-center rounded-lg border border-[#DEE0E3] bg-white text-sm hover:bg-slate-50" aria-label="Filters">
          <img src={attendanceFilterIcon} alt="" /><span className="sr-only">Filters</span>
        </button>
      </form>}
    </div>
    {!aggregateOnly && <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setSubmittedSearch(search.trim()); }} className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="min-w-[190px] flex-1"><label htmlFor="attendance-search" className="sr-only">Search employees</label>
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input id="attendance-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search employees…" className="min-h-11 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm" />
        </div></div>
      <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white"><Search className="h-4 w-4" /> Search</button>
      <button type="button" aria-expanded={filtersOpen} aria-controls="attendance-filters" onClick={() => setFiltersOpen(value => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50">
        <SlidersHorizontal className="h-4 w-4" /> Filters
      </button>
      <button type="button" disabled={!filteredRows.length} onClick={exportReport} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
        <Download className="h-4 w-4" /> Download report
      </button>
    </form>}
    <div id="attendance-filters" hidden={!filtersOpen} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
      <div><label htmlFor="attendance-from" className="mb-1 block text-xs font-medium text-slate-600">From date</label>
        <input id="attendance-from" type="date" value={aggregateOnly ? draftFrom : from} onChange={event => aggregateOnly ? setDraftFrom(event.target.value) : setFrom(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
      <div><label htmlFor="attendance-to" className="mb-1 block text-xs font-medium text-slate-600">To date</label>
        <input id="attendance-to" type="date" value={aggregateOnly ? draftTo : to} onChange={event => aggregateOnly ? setDraftTo(event.target.value) : setTo(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
      {aggregateOnly && <div><label htmlFor="attendance-team" className="mb-1 block text-xs font-medium text-slate-600">Select Team</label>
        <select id="attendance-team" value={selectedTeamFilter} onChange={event => setSelectedTeamFilter(event.target.value)}
          className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
          <option value="">All teams</option>
          {teamOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></div>}
      {showDetails && <div><label htmlFor="attendance-status" className="mb-1 block text-xs font-medium text-slate-600">Status</label>
        <select id="attendance-status" value={status} onChange={event => setStatus(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm">
          <option value="all">All visible statuses</option>{statusOptions.map(value => <option key={value} value={value}>{value}</option>)}
        </select></div>}
      {aggregateOnly
        ? <button type="button" onClick={applyReportFilters}
          className="min-h-11 self-end rounded-lg border border-[#08558B] bg-white px-4 text-sm font-medium text-[#08558B] hover:bg-[#EFF7F8]">Apply Filter</button>
        : <p className="self-end pb-2 text-xs text-slate-500">Date and status filters apply automatically.</p>}
    </div>
    {error && currentTenantReady && <StatusMessage error={error} onRetry={() => void load()} />}
    {actionMessage && currentTenantReady && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{actionMessage}</p>}
    {currentCorrections.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="font-medium">Attendance correction requests</h3>
      <p className="mt-1 text-sm text-slate-600">{currentCorrections.filter(item => item.status === 'pending').length} pending in this date range.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[#eff7f8] text-xs text-slate-600"><tr>
            {['Employee', 'Date', 'Requested change', 'Reason', 'Status', ...(canManage ? ['Actions'] : [])].map(label =>
              <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100">{currentCorrections.map((item, index) => <tr key={String(item.id || index)}>
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
      {loading || !currentTenantReady ? <p role="status" className="p-5 text-sm">Loading attendance data…</p> : !rows.length ? <p className="p-5 text-sm text-slate-600">{aggregateOnly && appliedTeamFilter ? 'No attendance report rows match the selected team.' : 'No attendance records were returned for this date range.'}</p> : <div role="region" aria-label="Scrollable attendance report table" tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-[#08558B]">
        <table aria-label={aggregateOnly ? 'Attendance summary by employee' : 'Attendance information'} className={`w-full border-separate text-left text-sm ${aggregateOnly ? 'min-w-[1383px] border-spacing-x-0 border-spacing-y-2' : 'min-w-[1160px] border-spacing-0'}`}>
          <thead className="bg-white text-xs text-slate-500"><tr>
            {(aggregateOnly ? ['Name', 'Designation', 'Team Name', 'Department', 'From date', 'To date', 'Office Hour', 'Work Hour', 'Deviation'] : ['Name', 'Designation', 'Department', 'Date', 'Work location', 'In time', 'Out time', 'Work hours', 'Status']).map(label => <th key={label} scope="col" aria-sort={aggregateOnly && label === 'Team Name' ? teamSortDirection === 'asc' ? 'ascending' : teamSortDirection === 'desc' ? 'descending' : 'none' : undefined} className="border-b border-slate-200 px-4 py-4 font-medium">
              {aggregateOnly && label === 'Team Name' ? <div className="flex items-center gap-1">
                <span>{label}</span>
                <button type="button" onClick={() => setTeamSortDirection(value => value === 'asc' ? 'desc' : 'asc')}
                  aria-label={`Sort by Team Name ${teamSortDirection === 'asc' ? 'descending' : 'ascending'}`}
                  className="inline-flex min-h-9 min-w-9 items-center justify-center rounded text-[#9E9E9E] hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-[#08558B]">
                  <img src={attendanceTeamSortIcon} alt="" />
                </button>
              </div> : label}
            </th>)}
          </tr></thead>
          <tbody>{rows.map((row, index) => {
            const employeeName = row.employee_name || row.full_name;
            const cellClass = aggregateOnly ? 'border-y border-slate-100 bg-white px-4 py-3' : 'border-b border-slate-100 px-4 py-3';
            const normalizedStatus = String(row.status || '').trim().toLowerCase().replaceAll('_', ' ');
            const statusTone = normalizedStatus === 'late' ? 'bg-amber-50 text-amber-800'
              : normalizedStatus === 'absent' ? 'bg-rose-50 text-rose-800'
                : normalizedStatus === 'present' || normalizedStatus === 'on time' ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-slate-100 text-slate-600';
            const deviationValue = row.deviation === null || row.deviation === undefined || row.deviation === '' ? Number.NaN : Number(row.deviation);
            const deviationText = Number.isFinite(deviationValue) ? `${deviationValue > 0 ? '+' : ''}${deviationValue.toFixed(2)}` : display(row.deviation);
            const deviationTone = deviationValue > 0 ? 'text-emerald-700' : deviationValue < 0 ? 'text-rose-700' : 'text-slate-700';
            const reportHours = (value: unknown) => {
              if (value === null || value === undefined || value === '') return display(value);
              const numeric = Number(value);
              return Number.isFinite(numeric) ? numeric.toFixed(2) : display(value);
            };
            return <tr key={String(row.employee_id || row.id || `${row.attendance_date || ''}-${index}`)} className={aggregateOnly ? 'h-20' : 'hover:bg-slate-50'}>
              <td className={`${cellClass} font-medium ${aggregateOnly ? 'rounded-l-lg border-l' : ''}`}>
                <div className="flex min-w-44 items-center gap-3">
                  <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-xl bg-[#DCEFF4] font-semibold text-[#085587] ${aggregateOnly ? 'h-12 w-12 text-base' : 'h-10 w-10 text-sm'}`}>{nameInitials(employeeName)}</span>
                  <span className="min-w-0"><span className="block break-words text-slate-800">{display(employeeName)}</span>
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">{display(row.employee_number)}</span></span>
                </div>
              </td>
              <td className={cellClass}>{display(row.designation_title)}</td>
              {aggregateOnly && <td className={cellClass}>{display(row.team_name)}</td>}
              <td className={cellClass}>{display(row.department_name)}</td>
              {aggregateOnly ? <>
                <td className={cellClass}>{displayAttendanceDate(from)}</td><td className={cellClass}>{displayAttendanceDate(to)}</td>
                <td className={`${cellClass} tabular-nums`}>{reportHours(row.office_hours)}</td><td className={`${cellClass} tabular-nums`}>{reportHours(row.working_hours)}</td>
                <td className={`${cellClass} rounded-r-lg border-r tabular-nums`}><span className={`font-semibold ${deviationTone}`}>{deviationText}</span></td>
              </> : <>
                <td className="border-b border-slate-100 px-4 py-3 tabular-nums">{displayAttendanceDate(row.attendance_date)}</td>
                <td className="border-b border-slate-100 px-4 py-3">{displayWorkMode(row.work_mode)}</td>
                <td className="border-b border-slate-100 px-4 py-3 tabular-nums">{displayTime(row.check_in)}</td>
                <td className="border-b border-slate-100 px-4 py-3 tabular-nums">{displayTime(row.check_out)}</td>
                <td className="border-b border-slate-100 px-4 py-3 tabular-nums">{display(row.work_hours)}</td>
                <td className="border-b border-slate-100 px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusTone}`}>{display(row.status)}</span></td>
              </>}
            </tr>;
          })}</tbody>
        </table>
      </div>}
    </div>
  </section>;
}

function ShiftRoster({ tenantId, canManage }: { tenantId: string; canManage: boolean }) {
  const [assignments, setAssignments] = useState<Record<string, unknown>[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<Record<string, unknown>[]>([]);
  const [shiftOptions, setShiftOptions] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [error, setError] = useState('');
  const [optionsError, setOptionsError] = useState('');
  const [assignmentError, setAssignmentError] = useState('');
  const [assignmentMessage, setAssignmentMessage] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [assignmentDate, setAssignmentDate] = useState(() => localIsoDate(new Date()));
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [from, setFrom] = useState(() => localIsoDate(new Date()));
  const [to, setTo] = useState(endOfUpcomingWeek);
  const [draftFrom, setDraftFrom] = useState(() => localIsoDate(new Date()));
  const [draftTo, setDraftTo] = useState(endOfUpcomingWeek);
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const requestSequence = useRef(0);

  async function loadOptions() {
    if (!canManage) {
      setEmployeeOptions([]);
      setShiftOptions([]);
      return;
    }
    setOptionsLoading(true);
    setOptionsError('');
    try {
      const result = await supabase.rpc('hris_get_tenant_shift_roster_options', { p_tenant_id: tenantId });
      if (result.error) throw result.error;
      const value = asObject(result.data);
      if (!value) throw new Error('Roster assignment options returned an invalid response.');
      const employees = asRows(value.employees);
      const shifts = asRows(value.shifts);
      setEmployeeOptions(employees);
      setShiftOptions(shifts);
      setSelectedEmployeeId(previous => employees.some(row => row.id === previous)
        ? previous : String(employees[0]?.id || ''));
      setSelectedShiftId(previous => shifts.some(row => row.id === previous)
        ? previous : String(shifts[0]?.id || ''));
    } catch (cause) {
      setEmployeeOptions([]);
      setShiftOptions([]);
      setOptionsError(cause instanceof Error ? cause.message : 'Unable to load assignable employees and shifts.');
    } finally { setOptionsLoading(false); }
  }

  async function load() {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError('');
    setAssignments([]);
    try {
      if (!from || !to || from > to) throw new Error('Choose a valid roster date range.');
      const result = await supabase.rpc('hris_get_tenant_shift_roster_data', {
        p_tenant_id: tenantId,
        p_start: from,
        p_end: to,
        p_search: submittedSearch || null,
      });
      if (result.error) throw result.error;
      if (!Array.isArray(result.data)) throw new Error('Roster service returned an invalid response.');
      if (requestId !== requestSequence.current) return;
      setAssignments(asRows(result.data));
    } catch (cause) {
      if (requestId !== requestSequence.current) return;
      setAssignments([]);
      setError(cause instanceof Error ? cause.message : 'Unable to load the authorized shift roster.');
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return () => { requestSequence.current += 1; };
  }, [tenantId, from, to, submittedSearch]);

  useEffect(() => { void loadOptions(); }, [tenantId, canManage]);

  function applyRosterFilters() {
    if (!draftFrom || !draftTo || draftFrom > draftTo) {
      setError('Choose a valid roster date range.');
      return;
    }
    setError('');
    setFrom(draftFrom);
    setTo(draftTo);
    setSubmittedSearch(search.trim());
  }

  async function assignShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingAssignment) return;
    setAssignmentError('');
    setAssignmentMessage('');
    if (!selectedEmployeeId || !selectedShiftId || !assignmentDate) {
      setAssignmentError('Choose an employee, shift and date.');
      return;
    }
    setSavingAssignment(true);
    try {
      const result = await supabase.rpc('hris_assign_tenant_employee_shift', {
        p_tenant_id: tenantId,
        p_employee_id: selectedEmployeeId,
        p_shift_id: selectedShiftId,
        p_assignment_date: assignmentDate,
      });
      if (result.error) {
        if (result.error.code === '23505') {
          throw new Error('This employee already has a shift assignment for that date. The existing assignment was not changed.');
        }
        throw result.error;
      }
      const selectedEmployee = employeeOptions.find(row => row.id === selectedEmployeeId);
      setAssignmentMessage(`Shift assigned to ${display(selectedEmployee?.full_name)}.`);
      await load();
    } catch (cause) {
      setAssignmentError(cause instanceof Error ? cause.message : 'Unable to assign this shift.');
    } finally { setSavingAssignment(false); }
  }

  function downloadRoster() {
    downloadCsv(`shift-roster-${from}-to-${to}.csv`,
      ['Date', 'Employee number', 'Employee', 'Department', 'Shift', 'Code', 'Start', 'End', 'Break minutes', 'Grace minutes', 'Status'],
      assignments.map(row => [row.assignment_date, row.employee_number, row.full_name, row.department_name,
        row.shift_name, row.shift_code, row.start_time, row.end_time, row.break_minutes,
        row.grace_minutes, row.assignment_status]));
  }

  return <section aria-labelledby="shift-roster-heading" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="shift-roster-heading" className="text-2xl font-semibold text-[#1E1B39]">Shift roster</h2>
        <p className="mt-1 text-sm text-[#86929E]">Scheduled employee shifts for this organization</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={loading || !assignments.length} onClick={downloadRoster}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
          <Download className="h-4 w-4" /> Export CSV
        </button>
        <button type="button" disabled={loading} onClick={() => void load()}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>
    </div>

    {canManage && <section aria-labelledby="assign-shift-heading" className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 id="assign-shift-heading" className="font-semibold text-slate-900">Assign a shift</h3>
      <p className="mt-1 text-sm text-slate-600">Assignments are saved per employee and date. An existing assignment is never replaced by this form.</p>
      {optionsError && <StatusMessage error={optionsError} onRetry={() => void loadOptions()} />}
      {assignmentError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{assignmentError}</p>}
      {assignmentMessage && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{assignmentMessage}</p>}
      <form className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={assignShift}>
        <div><label htmlFor="roster-assignment-employee" className="mb-1 block text-xs font-medium text-slate-600">Employee</label>
          <select id="roster-assignment-employee" value={selectedEmployeeId} onChange={event => setSelectedEmployeeId(event.target.value)}
            disabled={optionsLoading || !employeeOptions.length} required className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50">
            {employeeOptions.map(row => <option key={String(row.id)} value={String(row.id)}>{display(row.employee_number)} · {display(row.full_name)}</option>)}
          </select></div>
        <div><label htmlFor="roster-assignment-shift" className="mb-1 block text-xs font-medium text-slate-600">Shift</label>
          <select id="roster-assignment-shift" value={selectedShiftId} onChange={event => setSelectedShiftId(event.target.value)}
            disabled={optionsLoading || !shiftOptions.length} required className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50">
            {shiftOptions.map(row => <option key={String(row.id)} value={String(row.id)}>{display(row.name)} · {String(row.start_time || '').slice(0, 5)}–{String(row.end_time || '').slice(0, 5)}</option>)}
          </select></div>
        <div><label htmlFor="roster-assignment-date" className="mb-1 block text-xs font-medium text-slate-600">Assignment date</label>
          <input id="roster-assignment-date" type="date" value={assignmentDate} onChange={event => setAssignmentDate(event.target.value)} required
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
        <div className="flex items-end"><button type="submit" disabled={optionsLoading || savingAssignment || !employeeOptions.length || !shiftOptions.length}
          className="min-h-11 w-full rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white hover:bg-[#074770] disabled:opacity-50">
          {savingAssignment ? 'Saving…' : 'Assign shift'}
        </button></div>
      </form>
      {!optionsLoading && !optionsError && (!employeeOptions.length || !shiftOptions.length) &&
        <p className="mt-3 text-sm text-slate-600">Active employees and shifts are required before an assignment can be made.</p>}
    </section>}

    <form className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4"
      onSubmit={event => { event.preventDefault(); applyRosterFilters(); }}>
      <div><label htmlFor="roster-start" className="mb-1 block text-xs font-medium text-slate-600">From</label>
        <input id="roster-start" type="date" value={draftFrom} onChange={event => setDraftFrom(event.target.value)}
          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
      <div><label htmlFor="roster-end" className="mb-1 block text-xs font-medium text-slate-600">To</label>
        <input id="roster-end" type="date" value={draftTo} onChange={event => setDraftTo(event.target.value)}
          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
      <div><label htmlFor="roster-search" className="mb-1 block text-xs font-medium text-slate-600">Employee or shift</label>
        <input id="roster-search" type="search" value={search} onChange={event => setSearch(event.target.value)}
          placeholder="Search name, ID, or shift" className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
      <div className="flex items-end"><button type="submit" className="min-h-11 w-full rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white hover:bg-[#074770]">Apply filters</button></div>
    </form>

    {error && <StatusMessage error={error} onRetry={() => void load()} />}
    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm">Loading authorized shift assignments…</p>
      : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-sm">
          <p className="font-medium text-slate-800">Roster assignments</p>
          <p className="text-slate-500">{assignments.length} {assignments.length === 1 ? 'shift' : 'shifts'} · {displayShortDate(from)} – {displayShortDate(to)}</p>
        </div>
        {!assignments.length ? <div className="p-6 text-center">
          <CalendarDays className="mx-auto h-7 w-7 text-[#085587]" />
          <p className="mt-2 font-medium text-slate-800">No shift assignments found</p>
          <p className="mt-1 text-sm text-slate-600">Try another date range or search term. No schedule data is substituted.</p>
        </div> : <div className="overflow-x-auto" role="region" aria-label="Shift roster assignments" tabIndex={0}>
          <table className="w-full min-w-[920px] text-left text-sm" aria-label="Shift roster assignments">
            <thead className="bg-[#eff7f8] text-xs text-slate-600"><tr>
              {['Date', 'Employee', 'Department', 'Shift', 'Hours', 'Break', 'Grace', 'Status'].map(label =>
                <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{assignments.map((row, index) => <tr key={String(row.assignment_id || index)}>
              <td className="whitespace-nowrap px-3 py-3">{displayAttendanceDate(row.assignment_date)}</td>
              <td className="px-3 py-3"><span className="block font-medium text-slate-900">{display(row.full_name)}</span><span className="text-xs text-slate-500">{display(row.employee_number)}</span></td>
              <td className="px-3 py-3">{display(row.department_name)}</td>
              <td className="px-3 py-3"><span className="block font-medium">{display(row.shift_name)}</span><span className="text-xs text-slate-500">{display(row.shift_code)}</span></td>
              <td className="whitespace-nowrap px-3 py-3">{String(row.start_time || '—').slice(0, 5)} – {String(row.end_time || '—').slice(0, 5)}</td>
              <td className="px-3 py-3">{display(row.break_minutes)} min</td><td className="px-3 py-3">{display(row.grace_minutes)} min</td>
              <td className="px-3 py-3"><span className="inline-flex rounded-full bg-[#EFF7F8] px-2.5 py-1 text-xs font-medium capitalize text-[#085587]">{display(row.assignment_status)}</span></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>}
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
  tenantId, userId, leave, onRefresh, compact = false, showBalances = true, showHistory = true,
}: {
  tenantId: string;
  userId: string;
  leave: Record<string, unknown>;
  onRefresh: () => Promise<void>;
  compact?: boolean;
  showBalances?: boolean;
  showHistory?: boolean;
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
    <section className={`space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${compact ? 'xl:p-4' : 'sm:p-5'}`} aria-labelledby="personal-leave-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 id="personal-leave-heading" className="text-lg font-semibold text-[#49454F]">{compact ? 'Request time off' : 'My leave'}</h3>
          <p className="mt-1 text-sm text-slate-600">{compact ? 'Submit a request for an authorized leave type' : 'Current-year balances and your request history'}</p></div>
        <button ref={requestButtonRef} type="button" disabled={!leaveTypes.length} onClick={() => { setFormError(''); setRequestOpen(true); }}
          className="min-h-11 rounded-lg bg-[#08558B] px-5 text-sm font-medium text-white shadow-[0_3px_0_#02395c] disabled:cursor-not-allowed disabled:opacity-50">
          Request for leave
        </button>
      </div>
      {success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
      {showBalances && balances.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
        {balances.map((item, index) => <div key={String(item.leave_type_id || index)} className="rounded-md border border-slate-200 p-3">
          <p className="truncate text-sm font-semibold text-[#49454F]">{display(item.leave_type_name)}</p>
          <p className="mt-1 text-sm text-slate-700">{display(item.available_days)} available</p>
        </div>)}
      </div>}
      {showHistory && <div>
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
      </div>}
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

function EmployeePersonalLeave({ tenantId, userId, tenantName }: { tenantId: string; userId: string; tenantName: string }) {
  const [leave, setLeave] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [historyYear, setHistoryYear] = useState('');
  const requestSequence = useRef(0);

  async function load(showLoading = true) {
    const requestId = ++requestSequence.current;
    if (showLoading) setLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('hris_get_my_dashboard_data', { p_tenant_id: tenantId });
      if (rpcError) throw rpcError;
      const value = asObject(data);
      if (!value || !asObject(value.employee)) throw new Error('Personal leave service returned an invalid response.');
      if (requestId === requestSequence.current) setLeave(value);
    } catch (cause) {
      if (requestId !== requestSequence.current) return;
      setLeave(null);
      setError(cause instanceof Error ? cause.message : 'Unable to load your leave information.');
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    setLeave(null);
    setHistoryYear('');
    void load();
    return () => { requestSequence.current += 1; };
  }, [tenantId]);

  const balances = asRows(leave?.balances);
  const requests = asRows(leave?.requests);
  const defaultYear = String(leave?.balance_year || String(leave?.dashboard_date || '').slice(0, 4) || new Date().getFullYear());
  const requestYears = requests.flatMap(row => {
    const first = Number(String(row.from_date || '').slice(0, 4));
    const last = Number(String(row.to_date || '').slice(0, 4));
    if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1900 || last < first) return [];
    return Array.from({ length: Math.min(last - first + 1, 20) }, (_, index) => String(first + index));
  });
  const years = Array.from(new Set([defaultYear, ...requestYears])).sort((left, right) => Number(right) - Number(left));
  const selectedYear = years.includes(historyYear) ? historyYear : defaultYear;
  const yearNumber = Number(selectedYear);
  const history = requests.filter(row => {
    const first = Number(String(row.from_date || '').slice(0, 4));
    const last = Number(String(row.to_date || '').slice(0, 4));
    return Number.isInteger(first) && Number.isInteger(last) && first <= yearNumber && last >= yearNumber;
  });

  function downloadHistory() {
    downloadCsv(`personal-leave-history-${selectedYear}.csv`,
      ['Applicable From', 'Applicable To', 'No. of Days', 'Leave Type', 'Remarks', 'Status'],
      history.map(row => [row.from_date, row.to_date, row.requested_days, row.leave_type_name,
        [row.reason, row.resolution_note].filter(Boolean).join(' · '), row.status]));
  }

  const currentTenantDataReady = Boolean(leave?.employee);
  return <section aria-labelledby="personal-leave-page-heading" className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="personal-leave-page-heading" className="text-2xl font-medium text-[#49454F]">Personal leave</h2>
        <p className="mt-1 text-sm text-slate-500">Your leave balances and request history for {tenantName}</p></div>
      <button type="button" disabled={loading} onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
        <RefreshCw className="h-4 w-4" /> Refresh
      </button>
    </div>
    {error && <StatusMessage error={error} onRetry={() => void load()} />}
    {(loading || (!currentTenantDataReady && !error)) && <p role="status" className="rounded-lg border bg-white p-5 text-sm">Loading your leave information…</p>}
    {currentTenantDataReady && leave && <>
      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(210px,0.7fr)_minmax(0,2fr)]">
        <PersonalLeaveRequests tenantId={tenantId} userId={userId} leave={leave} onRefresh={() => load(false)} compact showBalances={false} showHistory={false} />
        <section aria-labelledby="personal-leave-balance-heading" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 id="personal-leave-balance-heading" className="font-semibold text-[#08263D]">Available leave breakdown</h3>
              <p className="mt-1 text-xs text-slate-500">Current year · {String(leave.balance_year || defaultYear)}</p></div>
            <CalendarDays className="h-5 w-5 text-[#08558B]" aria-hidden="true" />
          </div>
          {balances.length ? <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {balances.map((row, index) => <div key={String(row.leave_type_id || index)} className="min-w-0 rounded-md border border-slate-200 p-3">
              <p className="truncate text-sm font-semibold text-[#49454F]" title={String(row.leave_type_name || '')}>{display(row.leave_type_name)}</p>
              <p className="mt-1 text-sm tabular-nums text-slate-700">{display(row.available_days)} days available</p>
            </div>)}
          </div> : <p className="mt-3 rounded-lg bg-[#EFF7F8] p-4 text-sm text-slate-600">No leave balance records are available.</p>}
        </section>
      </div>

      <section aria-labelledby="personal-leave-history-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div><h3 id="personal-leave-history-heading" className="font-semibold text-[#08263D]">Leave history</h3>
            <p className="mt-1 text-xs text-slate-500">Requests overlapping the selected calendar year</p></div>
          <div className="flex flex-wrap items-end gap-2">
            <div><label htmlFor="personal-leave-history-year" className="mb-1 block text-xs font-medium text-slate-600">Leave history of</label>
              <select id="personal-leave-history-year" value={selectedYear} onChange={event => setHistoryYear(event.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm">
                {years.map(year => <option key={year} value={year}>{year}</option>)}
              </select></div>
            <button type="button" disabled={!history.length} onClick={downloadHistory} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
        </div>
        {history.length ? <div role="region" aria-label="Personal leave history" tabIndex={0} className="overflow-x-auto rounded-lg border border-slate-200 focus-visible:outline-2 focus-visible:outline-[#085587]">
          <table aria-label={`Personal leave history for ${selectedYear}`} className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[#EFF7F8] text-xs text-slate-600"><tr>
              {['Applicable from', 'Applicable to', 'No. of days', 'Leave type', 'Remarks', 'Status'].map(label => <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{history.map((row, index) => {
              const status = String(row.status || '').toLowerCase();
              const statusClass = status === 'approved' ? 'text-emerald-700'
                : status === 'rejected' ? 'text-rose-700' : 'text-slate-600';
              return <tr key={String(row.id || index)}>
                <td className="whitespace-nowrap px-3 py-3">{displayShortDate(row.from_date)}</td>
                <td className="whitespace-nowrap px-3 py-3">{displayShortDate(row.to_date)}</td>
                <td className="px-3 py-3 tabular-nums">{display(row.requested_days)}</td>
                <td className="px-3 py-3">{display(row.leave_type_name)}</td>
                <td className="max-w-56 px-3 py-3"><span className="block truncate" title={String(row.reason || '')}>{display(row.reason)}</span>
                  {Boolean(row.resolution_note) && <span className="block truncate text-xs text-slate-500">{display(row.resolution_note)}</span>}</td>
                <td className={`whitespace-nowrap px-3 py-3 font-semibold capitalize ${statusClass}`}>{display(row.status)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div> : <p className="rounded-lg bg-[#EFF7F8] p-4 text-sm text-slate-600">No leave requests overlap {selectedYear}.</p>}
      </section>
    </>}
  </section>;
}

type EmployeePanelId = 'working-hours' | 'work-location' | 'leave-type' | 'check-in-times';

function PersonalAttendanceCorrections({
  tenantId, today, corrections, onRefresh,
}: {
  tenantId: string;
  today: string;
  corrections: AttendanceRecord[];
  onRefresh: () => Promise<void>;
}) {
  const [requestOpen, setRequestOpen] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [workMode, setWorkMode] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const requestButtonRef = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!requestOpen) return;
    const dialog = dialogRef.current;
    const focusable = (): HTMLElement[] => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) || []);
    focusable()[0]?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submittingRef.current) { setRequestOpen(false); return; }
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
    if (!checkIn && !checkOut && !workMode) {
      setFormError('Enter at least one attendance field to correct.'); return;
    }
    if (checkIn && checkOut && checkOut < checkIn) {
      setFormError('Check-out must be after check-in.'); return;
    }
    submittingRef.current = true;
    setSubmitting(true); setFormError(''); setSuccess('');
    try {
      const { data, error: rpcError } = await supabase.rpc('hris_employee_submit_attendance_correction', {
        p_tenant_id: tenantId,
        p_payload: {
          attendance_date: attendanceDate || today,
          check_in_time: checkIn || null,
          check_out_time: checkOut || null,
          work_mode: workMode || null,
          reason: reason.trim(),
        },
      });
      if (rpcError) throw rpcError;
      if (!data) throw new Error('The correction request was not confirmed. Refresh and check your request history.');
      setSuccess('Attendance correction submitted for review.');
      setRequestOpen(false); setAttendanceDate(''); setCheckIn(''); setCheckOut(''); setWorkMode(''); setReason('');
      await onRefresh();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Unable to submit this attendance correction.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return <>
    <section aria-labelledby="employee-attendance-corrections-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div><h3 id="employee-attendance-corrections-heading" className="font-semibold text-[#08263D]">My attendance correction requests</h3>
          <p className="mt-1 text-xs text-slate-500">Requests are reviewed by an authorized attendance manager before records change.</p></div>
        <button ref={requestButtonRef} type="button" onClick={() => { setFormError(''); setRequestOpen(true); }}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white">
          <Clock3 className="h-4 w-4" /> Request a correction
        </button>
      </div>
      {success && <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
      {corrections.length ? <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-[#EFF7F8] text-xs text-slate-600"><tr>
          {['Date', 'Requested change', 'Reason', 'Status', 'Resolution'].map(label => <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{corrections.map((item, index) => <tr key={String(item.id || index)}>
          <td className="px-3 py-3">{displayShortDate(item.attendance_date)}</td>
          <td className="px-3 py-3">{[
            item.requested_check_in ? `In ${displayTime(item.requested_check_in)}` : '',
            item.requested_check_out ? `Out ${displayTime(item.requested_check_out)}` : '',
            item.requested_work_mode ? `Mode ${displayWorkMode(item.requested_work_mode)}` : '',
          ].filter(Boolean).join(' · ') || '—'}</td>
          <td className="max-w-64 px-3 py-3"><span className="block truncate" title={String(item.reason || '')}>{display(item.reason)}</span></td>
          <td className="px-3 py-3 capitalize">{display(item.status)}</td>
          <td className="max-w-56 px-3 py-3"><span className="block truncate" title={String(item.resolution_note || '')}>{display(item.resolution_note)}</span></td>
        </tr>)}</tbody>
      </table></div> : <p className="rounded-lg bg-[#EFF7F8] p-4 text-sm text-slate-600">No attendance correction requests yet.</p>}
    </section>
    {requestOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-3 sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget && !submitting) setRequestOpen(false); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="attendance-correction-dialog-heading" className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div><h3 id="attendance-correction-dialog-heading" className="text-lg font-semibold text-[#08263D]">Request attendance correction</h3>
            <p className="mt-1 text-xs text-slate-500">Times use the organization’s local time.</p></div>
          <button type="button" aria-label="Close attendance correction request" disabled={submitting} onClick={() => setRequestOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={event => void submitRequest(event)} className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
            <div><label htmlFor="attendance-correction-date" className="mb-1 block text-sm font-medium text-slate-700">Attendance date <span aria-hidden="true">*</span></label>
              <input id="attendance-correction-date" autoFocus type="date" required value={attendanceDate || today} onChange={event => setAttendanceDate(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label htmlFor="attendance-correction-check-in" className="mb-1 block text-sm font-medium text-slate-700">Requested check-in</label>
                <input id="attendance-correction-check-in" type="time" value={checkIn} onChange={event => setCheckIn(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
              <div><label htmlFor="attendance-correction-check-out" className="mb-1 block text-sm font-medium text-slate-700">Requested check-out</label>
                <input id="attendance-correction-check-out" type="time" value={checkOut} onChange={event => setCheckOut(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
            </div>
            <div><label htmlFor="attendance-correction-work-mode" className="mb-1 block text-sm font-medium text-slate-700">Requested work location</label>
              <select id="attendance-correction-work-mode" value={workMode} onChange={event => setWorkMode(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                <option value="">No change</option><option value="office">Office</option><option value="home">Home</option><option value="client_meeting">Client Meeting</option>
              </select></div>
            <div><label htmlFor="attendance-correction-reason" className="mb-1 block text-sm font-medium text-slate-700">Reason <span aria-hidden="true">*</span></label>
              <textarea id="attendance-correction-reason" required maxLength={2000} rows={3} value={reason} onChange={event => setReason(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
            {formError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{formError}</p>}
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
            <button type="button" disabled={submitting} onClick={() => setRequestOpen(false)} className="min-h-11 rounded-lg px-4 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={submitting} className="min-h-11 rounded-lg bg-[#08558B] px-5 text-sm font-medium text-white disabled:opacity-50">{submitting ? 'Sending…' : 'Send request'}</button>
          </div>
        </form>
      </div>
    </div>}
  </>;
}

function EmployeeOverview({ tenantId, tenantName, userId }: { tenantId: string; tenantName: string; userId: string }) {
  const [attendance, setAttendance] = useState<Record<string, unknown> | null>(null);
  const [leave, setLeave] = useState<Record<string, unknown> | null>(null);
  const [loadedTenantId, setLoadedTenantId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attendanceAction, setAttendanceAction] = useState<'check_in' | 'check_out' | null>(null);
  const [attendanceActionError, setAttendanceActionError] = useState('');
  const [attendanceActionSuccess, setAttendanceActionSuccess] = useState('');
  const [activePanel, setActivePanel] = useState<EmployeePanelId>('working-hours');
  const requestSequence = useRef(0);

  async function load(showLoading = true) {
    const requestId = ++requestSequence.current;
    if (showLoading) setLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('hris_get_my_dashboard_data', {
        p_tenant_id: tenantId,
      });
      if (rpcError) throw rpcError;
      const dashboardData = asObject(data);
      const attendanceData = asObject(dashboardData?.attendance);
      if (!attendanceData || !dashboardData) throw new Error('Employee services returned an invalid response.');
      if (requestId !== requestSequence.current) return;
      setAttendance(attendanceData);
      setLeave(dashboardData);
      setLoadedTenantId(tenantId);
    } catch (cause) {
      if (requestId !== requestSequence.current) return;
      setAttendance(null); setLeave(null); setLoadedTenantId('');
      setError(cause instanceof Error ? cause.message : 'Unable to load your HRIS summary.');
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }

  async function recordAttendanceEvent(event: 'check_in' | 'check_out') {
    if (attendanceAction) return;
    setAttendanceAction(event);
    setAttendanceActionError('');
    setAttendanceActionSuccess('');
    try {
      const { error: rpcError } = await supabase.rpc('hris_employee_record_attendance_event', {
        p_tenant_id: tenantId,
        p_event: event,
      });
      if (rpcError) throw rpcError;
      setAttendanceActionSuccess(event === 'check_in' ? 'You are checked in for today.' : 'You are checked out for today.');
      await load(false);
    } catch (cause) {
      setAttendanceActionError(cause instanceof Error ? cause.message : 'Unable to update your attendance. Please retry.');
    } finally {
      setAttendanceAction(null);
    }
  }

  useEffect(() => {
    setAttendance(null); setLeave(null); setLoadedTenantId('');
    void load();
    return () => { requestSequence.current += 1; };
  }, [tenantId]);

  const currentTenantDataReady = loadedTenantId === tenantId && Boolean(attendance && leave);
  const employee = asObject(leave?.employee);
  const fullName = typeof employee?.full_name === 'string' ? employee.full_name : '';
  const initials = fullName.trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => part.slice(0, 1).toLocaleUpperCase()).join('') || '—';
  const today = typeof leave?.dashboard_date === 'string' ? leave.dashboard_date : '';
  const attendanceRecords = asRows(attendance?.records);
  const todayRecord = attendanceRecords.find(item => item.attendance_date === today);
  const balances = asRows(leave?.balances);
  const holidays = asRows(leave?.holidays);
  const requests = asRows(leave?.requests);
  const workHours = attendanceRecords.map(row => ({
    row,
    hours: row.work_hours === null || row.work_hours === undefined ? null : Number(row.work_hours),
  })).filter(item => item.hours === null || Number.isFinite(item.hours)).reverse();
  const recordedHours = workHours.reduce((sum, item) => sum + (item.hours ?? 0), 0);
  const maxHours = Math.max(0, ...workHours.map(item => item.hours ?? 0));
  const workModes = attendanceRecords.reduce<Record<string, number>>((counts, row) => {
    const mode = displayWorkMode(row.work_mode);
    if (mode !== 'Not recorded') counts[mode] = (counts[mode] || 0) + 1;
    return counts;
  }, {});
  const tabs: { id: EmployeePanelId; label: string }[] = [
    { id: 'working-hours', label: 'Working hours' },
    { id: 'work-location', label: 'Work location' },
    { id: 'leave-type', label: 'Leave type' },
    { id: 'check-in-times', label: 'Check-in times' },
  ];

  return <section aria-labelledby="employee-summary-heading" className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="employee-summary-heading" className="text-2xl font-medium text-[#49454F]">Personal Dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">Your attendance and leave information for {tenantName}</p></div>
      <button type="button" disabled={loading} onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50"><RefreshCw className="h-4 w-4" /> Refresh</button>
    </div>
    {error && <StatusMessage error={error} onRetry={() => void load()} />}
    {(loading || (!currentTenantDataReady && !error)) && <p role="status" className="rounded-lg border bg-white p-5 text-sm">Loading your HRIS summary…</p>}
    {currentTenantDataReady && attendance && leave && <>
      <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(160px,0.8fr)_minmax(0,2fr)] xl:grid-cols-[180px_minmax(0,1fr)_288px]">
        <section aria-labelledby="employee-profile-heading" className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
          <div className="mx-auto grid h-24 w-24 place-items-center rounded-xl bg-[#E7F1F3] text-2xl font-semibold text-[#08558B]" aria-hidden="true">{initials}</div>
          <h3 id="employee-profile-heading" className="mt-3 break-words text-base font-semibold text-[#08263D]">{fullName || 'Employee profile'}</h3>
          <p className="mt-1 text-xs text-slate-500">{display(employee?.employee_number)}</p>
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-left text-sm">
            <p className="flex items-start gap-2"><BriefcaseBusiness className="mt-0.5 h-4 w-4 shrink-0 text-[#08558B]" /><span>{display(employee?.designation_title)}</span></p>
            <p className="flex items-start gap-2"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[#08558B]" /><span>{display(employee?.department_name)}</span></p>
            <p className="flex items-start gap-2 break-all text-xs text-slate-600"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#08558B]" /><span>{display(employee?.official_email)}</span></p>
          </div>
        </section>

        <div className="min-w-0 space-y-4">
          <section aria-labelledby="employee-today-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 id="employee-today-heading" className="font-semibold text-[#08263D]">Today’s attendance</h3>
                <p className="mt-1 text-xs text-slate-500">{displayShortDate(today)} · organization local date</p></div>
              {todayRecord && <span className="rounded-full bg-[#E7F1F3] px-3 py-1 text-xs font-medium text-[#08558B]">{display(todayRecord.status)}</span>}
            </div>
            {todayRecord ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div><p className="text-xs text-slate-500">Check in</p><p className="mt-1 text-sm font-medium">{displayTime(todayRecord.check_in)}</p></div>
              <div><p className="text-xs text-slate-500">Check out</p><p className="mt-1 text-sm font-medium">{displayTime(todayRecord.check_out)}</p></div>
              <div><p className="text-xs text-slate-500">Work location</p><p className="mt-1 text-sm font-medium">{displayWorkMode(todayRecord.work_mode)}</p></div>
            </div> : <p className="mt-3 text-sm text-slate-600">No attendance record is available for this date. Your work schedule is not included in this summary.</p>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <p className="text-sm text-slate-600">{todayRecord?.check_out
                ? `Attendance recorded through ${displayTime(todayRecord.check_out)}`
                : todayRecord?.check_in ? `Checked in at ${displayTime(todayRecord.check_in)}` : 'You have not checked in today.'}</p>
              {!todayRecord?.check_out && <button type="button" disabled={loading || attendanceAction !== null}
                onClick={() => void recordAttendanceEvent(todayRecord?.check_in ? 'check_out' : 'check_in')}
                className="min-h-11 rounded-lg bg-[#08558B] px-5 text-sm font-medium text-white shadow-[0_3px_0_#02395c] disabled:cursor-wait disabled:opacity-60">
                {attendanceAction ? (attendanceAction === 'check_in' ? 'Checking in…' : 'Checking out…')
                  : todayRecord?.check_in ? 'Check out' : 'Check in'}
              </button>}
            </div>
            {attendanceActionError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{attendanceActionError}</p>}
            {attendanceActionSuccess && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{attendanceActionSuccess}</p>}
          </section>

          <section aria-labelledby="employee-insights-heading" className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 pt-3 sm:px-5">
              <h3 id="employee-insights-heading" className="mb-2 font-semibold text-[#08263D]">Attendance and leave</h3>
              <div role="group" aria-label="Personal dashboard views" className="-mb-px grid grid-cols-2 gap-x-2 sm:flex sm:min-w-0 sm:overflow-x-auto">
                {tabs.map(tab => <button key={tab.id} type="button" aria-pressed={activePanel === tab.id}
                  onClick={() => setActivePanel(tab.id)} className={`min-h-12 w-full border-b-2 px-2 text-xs sm:w-auto sm:shrink-0 sm:flex-1 sm:px-2 sm:text-sm ${activePanel === tab.id ? 'border-[#08558B] text-[#08558B]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                  {tab.label}
                </button>)}
              </div>
            </div>
            <div className="min-h-56 p-4 sm:p-5" aria-live="polite">
              {activePanel === 'working-hours' && <div>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div><h4 className="font-medium text-slate-800">Recorded working hours</h4><p className="mt-1 text-xs text-slate-500">Last 7 days</p></div>
                  <p className="text-right"><span className="block text-xl font-semibold tabular-nums text-[#08558B]">{recordedHours.toFixed(1)} hr</span><span className="text-xs text-slate-500">from complete check-in pairs</span></p>
                </div>
                {workHours.some(item => item.hours !== null) ? <div role="img" aria-label={`Recorded work hours for ${workHours.length} recent dates`} className="mt-5 grid grid-cols-7 items-end gap-2 border-b border-slate-200 pb-2">
                  {workHours.map(({ row, hours }, index) => <div key={String(row.id || row.attendance_date || index)} className="min-w-0 text-center">
                    <div className="flex h-28 items-end justify-center"><div title={`${hours?.toFixed(1) || '0.0'} recorded hours`} className="w-full max-w-8 rounded-t bg-[#08558B]" style={{ height: `${maxHours > 0 && hours ? Math.max(6, (hours / maxHours) * 100) : 0}%` }} /></div>
                    <span className="mt-2 block truncate text-[10px] text-slate-500">{displayShortDate(row.attendance_date)}</span>
                    <span className="mt-1 block text-[10px] tabular-nums text-slate-700">{hours === null ? '—' : `${hours.toFixed(1)}h`}</span>
                  </div>)}
                </div> : <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No complete check-in and check-out pairs are available for this date range.</p>}
                <p className="mt-3 text-xs text-slate-500">Scheduled hours are not returned in this personal summary, so no required-hours target is shown.</p>
              </div>}
              {activePanel === 'work-location' && <div>
                <h4 className="font-medium text-slate-800">Recorded work locations</h4><p className="mt-1 text-xs text-slate-500">Based on your recent attendance entries</p>
                {Object.keys(workModes).length ? <div className="mt-4 grid grid-cols-2 gap-3">{Object.entries(workModes).map(([mode, count]) => <div key={mode} className="rounded-lg border border-slate-200 p-3">
                  <p className="flex items-center gap-2 text-sm text-slate-600"><MapPin className="h-4 w-4 text-[#08558B]" />{mode}</p><p className="mt-2 text-xl font-semibold tabular-nums">{count}</p><p className="text-xs text-slate-500">attendance entries</p>
                </div>)}</div> : <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No work location is recorded in the recent attendance entries.</p>}
              </div>}
              {activePanel === 'leave-type' && <div>
                <h4 className="font-medium text-slate-800">Leave balances · {display(leave.balance_year)}</h4>
                {balances.length ? <div className="mt-3 divide-y divide-slate-100">{balances.map((row, index) => <div key={String(row.leave_type_id || index)} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <span className="text-sm font-medium">{display(row.leave_type_name)}</span><span className="text-sm tabular-nums text-slate-700">{display(row.available_days)} days available</span>
                </div>)}</div> : <p className="mt-3 text-sm text-slate-600">No leave balance records are available.</p>}
              </div>}
              {activePanel === 'check-in-times' && <div>
                <h4 className="font-medium text-slate-800">Recent check-in times</h4>
                {attendanceRecords.length ? <ul className="mt-2 divide-y divide-slate-100">{attendanceRecords.map((row, index) => <li key={String(row.id || index)} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span><strong>{displayShortDate(row.attendance_date)}</strong><span className="ml-2 text-slate-500">{display(row.status)}</span></span>
                  <span className="tabular-nums">{displayTime(row.check_in)} – {displayTime(row.check_out)}</span>
                </li>)}</ul> : <p className="mt-3 text-sm text-slate-600">No recent attendance records are available.</p>}
              </div>}
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-4 md:col-span-2 xl:col-span-1">
          <section aria-labelledby="employee-leave-balances-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2"><div><h3 id="employee-leave-balances-heading" className="font-semibold text-[#08263D]">Leave balances</h3>
              <p className="mt-1 text-xs text-slate-500">Current year · {display(leave.balance_year)}</p></div><CalendarDays className="h-5 w-5 text-[#08558B]" /></div>
            {balances.length ? <ul className="mt-3 divide-y divide-slate-100">{balances.map((row, index) => <li key={String(row.leave_type_id || index)} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0 truncate">{display(row.leave_type_name)}</span><strong className="shrink-0 tabular-nums">{display(row.available_days)} days</strong>
            </li>)}</ul> : <p className="mt-3 text-sm text-slate-600">No leave balance records are available.</p>}
          </section>
          <PersonalLeaveRequests tenantId={tenantId} userId={userId} leave={leave} onRefresh={() => load(false)} compact showBalances={false} showHistory={false} />
          <section aria-labelledby="employee-holidays-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 id="employee-holidays-heading" className="font-semibold text-[#08263D]">Upcoming holidays</h3>
            {holidays.length ? <ul className="mt-3 max-h-56 divide-y divide-slate-100 overflow-y-auto">{holidays.slice(0, 8).map((holiday, index) => <li key={String(holiday.id || index)} className="flex items-start justify-between gap-3 py-3 text-sm">
              <span className="min-w-0 break-words">{display(holiday.name)}</span><span className="shrink-0 text-xs text-slate-500">{displayShortDate(holiday.start_date)}{holiday.end_date && holiday.end_date !== holiday.start_date ? ` – ${displayShortDate(holiday.end_date)}` : ''}</span>
            </li>)}</ul> : <p className="mt-3 text-sm text-slate-600">No upcoming holidays are published.</p>}
          </section>
        </aside>
      </div>

      <section aria-labelledby="employee-leave-history-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h3 id="employee-leave-history-heading" className="font-semibold text-[#08263D]">My leave requests</h3>
          <p className="mt-1 text-xs text-slate-500">Status and resolution updates from this organization</p></div><span className="text-xs text-slate-500">{requests.length} requests</span></div>
        {requests.length ? <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-[#EFF7F8] text-xs text-slate-600"><tr>{['Leave type', 'From', 'To', 'Days', 'Reason', 'Status'].map(label => <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{requests.map((item, index) => <tr key={String(item.id || index)}>
            <td className="px-3 py-3">{display(item.leave_type_name)}</td><td className="px-3 py-3">{displayShortDate(item.from_date)}</td><td className="px-3 py-3">{displayShortDate(item.to_date)}</td>
            <td className="px-3 py-3">{display(item.requested_days)}</td><td className="max-w-48 px-3 py-3"><span className="block truncate" title={String(item.reason || '')}>{display(item.reason)}</span>
              {Boolean(item.resolution_note) && <span className="block truncate text-xs text-slate-500">{display(item.resolution_note)}</span>}</td><td className="px-3 py-3 font-medium">{display(item.status)}</td>
          </tr>)}</tbody>
        </table></div> : <p className="rounded-lg bg-[#EFF7F8] p-4 text-sm text-slate-600">No leave requests yet.</p>}
      </section>
      <PersonalAttendanceCorrections tenantId={tenantId} today={today} corrections={asRows(attendance.corrections)} onRefresh={() => load(false)} />
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
    if (permissions.attendanceView || permissions.attendanceManage) items.push({ id: 'shift-roster', label: 'Roster', icon: <Clock3 className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.leave) items.push({ id: 'leave', label: 'Leave', icon: <ClipboardList className="h-5 w-5" />, group: 'HRIS' });
    if (isEmployee) items.push({ id: 'my-dashboard', label: 'My Overview', icon: <Users className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-leave', label: 'My Leave', icon: <CalendarDays className="h-5 w-5" />, group: 'Personal' });
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
            tenantId={tenantId} canView={permissions.attendanceView} canReport={permissions.attendanceReport} canManage={permissions.attendanceManage}
          />}
          {page === 'shift-roster' && (permissions.attendanceView || permissions.attendanceManage) && <ShiftRoster tenantId={tenantId} canManage={permissions.attendanceManage} />}
          {page === 'leave' && permissions.leave && <LeaveWorkspace tenantId={tenantId} canManage={permissions.leaveManage} />}
          {page === 'my-dashboard' && isEmployee && <EmployeeOverview tenantId={tenantId} tenantName={tenantName} userId={userId} />}
          {page === 'my-leave' && isEmployee && <EmployeePersonalLeave tenantId={tenantId} tenantName={tenantName} userId={userId} />}
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

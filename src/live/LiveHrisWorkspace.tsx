import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import attendanceDownloadIcon from '../assets/attendance-download.png';
import attendanceFilterIcon from '../assets/attendance-filter.svg';
import attendanceSearchIcon from '../assets/attendance-search.svg';
import attendanceTeamSortIcon from '../assets/attendance-team-sort.svg';
import { OrganizationTeams } from './OrganizationTeams';
import { OrganizationProjects } from './OrganizationProjects';
import { MyProjects } from './MyProjects';
import { ProjectNotifications } from './ProjectNotifications';
import { MyPerformance } from './MyPerformance';
import { MyLearning } from './MyLearning';
import { MyPayslips } from './MyPayslips';
import { PayrollRegister } from './PayrollRegister';
import { LearningRequests } from './LearningRequests';
import { LearningProgramAdmin } from './LearningProgramAdmin';
import { LearningCompletionQueue } from './LearningCompletionQueue';
import { OrganizationHolidayCalendar } from './OrganizationHolidayCalendar';
import { LeaveTypePolicyManager } from './LeaveTypePolicyManager';
import { MyTravelRequests, TravelRequests } from './TravelRequests';
import { ExpenseClaims } from './ExpenseClaims';
import { MyServiceRequests } from './MyServiceRequests';
import { ServiceRequestReview } from './ServiceRequestReview';
import { OrganizationPerformance } from './OrganizationPerformance';
import { OrganizationEmployeeDirectory } from './OrganizationEmployeeDirectory';
import { RecruitmentPipeline } from './RecruitmentPipeline';
import { CandidatePreboardingQueue } from './CandidatePreboardingQueue';
import { EmployeeReferrals } from './EmployeeReferrals';
import { PlatformTenantWorkspace } from './PlatformTenantWorkspace';
import { platformTenantFeatureAvailable } from './platformTenantApi';
import { downloadCsv } from './csv';
import { projectText, type Locale } from './project-locale';
import {
  Activity, Bell, BookOpen, BookOpenCheck, BriefcaseBusiness, Building2, CalendarDays, CheckCircle2,
  ClipboardList, Clock3, Download, House, LayoutDashboard, LogOut, Mail, MapPin, Menu,
  Receipt, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Target, UserRoundPlus, Users, X, XCircle,
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
  organization: boolean;
  organizationManage: boolean;
  employees: boolean;
  employeesManage: boolean;
  performance: boolean;
  recruitment: boolean;
  recruitmentManage: boolean;
  referrals: boolean;
  referralsManage: boolean;
  holidayManage: boolean;
  learningManage: boolean;
  travel: boolean;
  travelView: boolean;
  travelManage: boolean;
  expenses: boolean;
  expensesView: boolean;
  expensesManage: boolean;
  payroll: boolean;
  payrollManage: boolean;
};
type PageId = 'dashboard' | 'attendance' | 'shift-roster' | 'leave' | 'projects' | 'platform-tenants' | 'teams' | 'employees' | 'onboarding' | 'performance' | 'recruitment' | 'referrals' | 'holidays' | 'learning-requests' | 'learning-completions' | 'learning-programs' | 'travel' | 'expenses' | 'payroll-register' | 'service-requests' | 'my-dashboard' | 'my-projects' | 'my-notifications' | 'my-performance' | 'my-learning' | 'my-payslips' | 'my-leave' | 'my-timesheets' | 'my-travel' | 'my-expenses' | 'my-service-requests';
type DashboardPoint = { date: string; records: number };
type DashboardTeamReportRow = {
  team_id?: string | null;
  team_name?: string;
  present_members?: number;
  absent_members?: number;
  total_members?: number;
  work_from_office?: number;
  work_from_home?: number;
  client_meeting?: number;
};
type DashboardTeamReportDetail = {
  employee_name?: string;
  employee_number?: string;
  designation_title?: string;
  team_name?: string | null;
  department_name?: string;
  attendance_days?: number;
  office_hours?: number;
  working_hours?: number;
  deviation?: number;
};
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
  attendanceReport: false, leave: false, leaveManage: false, organization: false,
  organizationManage: false, employees: false, employeesManage: false, performance: false, recruitment: false, recruitmentManage: false,
  referrals: false, referralsManage: false, holidayManage: false,
  learningManage: false,
  travel: false, travelView: false, travelManage: false,
  expenses: false, expensesView: false, expensesManage: false,
  payroll: false, payrollManage: false,
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

function displayLocalizedNumber(value: unknown, locale: Locale): string {
  if (value === null || value === undefined || value === '') return '—';
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US');
}

function localizedEmployeeNumber(value: unknown, locale: Locale, fractionDigits = 0): string {
  if (value === null || value === undefined || value === '') return '—';
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function localizedEmployeeTime(value: unknown, locale: Locale): string {
  if (typeof value !== 'string' || !value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString(locale === 'bn' ? 'bn-BD' : 'en-US', { hour: '2-digit', minute: '2-digit' });
}

function localizedEmployeeDate(value: unknown, locale: Locale): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return display(value);
  return new Date(`${value}T12:00:00`).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', { month: 'short', day: 'numeric' });
}

function localizedProjectText(locale: Locale, source: string, values: Record<string, string | number> = {}): string {
  const translated = projectText(locale, source);
  return Object.entries(values).reduce((text, [key, value]) =>
    text.replaceAll(`{${key}}`, String(value)), translated);
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

function leaveCalendarMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shiftLeaveCalendarMonth(value: string, amount: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return leaveCalendarMonth();
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function leaveCalendarBounds(value: string): { start: string; end: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Choose a valid month for the absence calendar.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error('Choose a valid month for the absence calendar.');
  const end = new Date(Date.UTC(year, month, 0));
  return { start: `${value}-01`, end: `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}-${String(end.getUTCDate()).padStart(2, '0')}` };
}

function leaveCalendarCells(value: string): Array<string | null> {
  const { start, end } = leaveCalendarBounds(value);
  const first = new Date(`${start}T12:00:00Z`);
  const days = Number(end.slice(-2));
  const leading = (first.getUTCDay() + 6) % 7;
  const cellCount = Math.ceil((leading + days) / 7) * 7;
  return Array.from({ length: cellCount }, (_, index) => {
    const day = index - leading + 1;
    return day < 1 || day > days ? null : `${value}-${String(day).padStart(2, '0')}`;
  });
}

function addIsoDateDays(value: string, count: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isInteger(count) || count < 0) return '';
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
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

function StatusMessage({ error, onRetry, retryLabel = 'Retry' }: { error: string; onRetry: () => void; retryLabel?: string }) {
  return <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">
    <p>{error}</p>
    <button type="button" className="mt-3 min-h-11 rounded-md border border-rose-400 px-3 font-medium" onClick={onRetry}>{retryLabel}</button>
  </div>;
}

function Metric({ label, value, icon, onOpen, compact = false, emphasized = false }: {
  label: string; value: unknown; icon: ReactNode; onOpen?: () => void; compact?: boolean; emphasized?: boolean;
}) {
  const content = <>
    <span className={`flex items-center justify-between gap-2 ${compact ? 'text-xs font-semibold text-[#49454F]' : 'text-sm text-slate-600'}`}>
      <span>{label}</span><span className="shrink-0 text-[#08558B]">{icon}</span>
    </span>
    <span className={`${compact ? 'mt-1 text-base' : 'mt-3 text-2xl'} block font-semibold tabular-nums text-slate-900`}>{display(value)}</span>
  </>;
  const className = compact
    ? `min-h-[68px] rounded-md border border-[#E6EEF3] ${emphasized ? 'bg-[#E6EEF3]' : 'bg-white'} p-2 text-left ${onOpen ? 'hover:border-[#08558B] focus-visible:outline-2 focus-visible:outline-[#08558B]' : ''}`
    : `min-h-[108px] rounded-lg border border-[#DEE0E3] bg-white p-4 text-left shadow-sm ${onOpen ? 'hover:border-[#08558B] focus-visible:outline-2 focus-visible:outline-[#08558B]' : ''}`;
  return onOpen
    ? <button type="button" onClick={onOpen} className={className}>{content}</button>
    : <div className={className}>{content}</div>;
}

function AttendanceTrend({ points, range, locale }: { points: DashboardPoint[]; range: '7' | '30'; locale: Locale }) {
  const tx = (value: string) => projectText(locale, value);
  const safePoints = points.filter(point => typeof point.date === 'string' && Number.isFinite(Number(point.records)));
  if (!safePoints.length) return <p className="p-5 text-sm text-slate-600">{tx('No attendance summary is available for the recent date range.')}</p>;
  const maxRecords = Math.max(0, ...safePoints.map(point => Number(point.records)));
  const max = Math.max(4, Math.ceil(maxRecords / 4) * 4);
  const coords = safePoints.map((point, index) => ({
    x: safePoints.length === 1 ? 340 : 66 + index * (548 / (safePoints.length - 1)),
    y: 176 - (Number(point.records) / max) * 132,
    point,
  }));
  const path = coords.length < 2
    ? `M ${coords[0].x} ${coords[0].y}`
    : coords.slice(0, -1).map((point, index) => {
      const next = coords[index + 1];
      const previous = coords[Math.max(0, index - 1)];
      const after = coords[Math.min(coords.length - 1, index + 2)];
      const lowerY = Math.min(point.y, next.y);
      const upperY = Math.max(point.y, next.y);
      const control1Y = Math.max(lowerY, Math.min(upperY, point.y + (next.y - previous.y) / 6));
      const control2Y = Math.max(lowerY, Math.min(upperY, next.y - (after.y - point.y) / 6));
      const control1X = point.x + (next.x - previous.x) / 6;
      const control2X = next.x - (after.x - point.x) / 6;
      return `${index ? '' : `M ${point.x} ${point.y} `}C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${next.x} ${next.y}`;
    }).join(' ');
  const areaPath = coords.length ? `${path} L ${coords.at(-1)!.x} 176 L ${coords[0].x} 176 Z` : '';
  return <div className="overflow-x-auto p-3">
    <svg viewBox="0 0 650 220" role="img" aria-labelledby="attendance-trend-title attendance-trend-description" className="min-w-[600px] w-full">
      <title id="attendance-trend-title">{locale === 'bn' ? `${tx('Attendance records over the last')} ${range} ${tx('days')}` : `Attendance records over the last ${range} days`}</title>
      <desc id="attendance-trend-description">{tx('Daily attendance record counts returned by the tenant-scoped HRIS dashboard service.')}</desc>
      <defs><linearGradient id="attendance-trend-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#08558B" stopOpacity="0.22" /><stop offset="100%" stopColor="#08558B" stopOpacity="0.02" /></linearGradient></defs>
      {[0, 1, 2, 3, 4, 5].map(i => {
        const y = 44 + i * 26.4;
        const tick = Math.round(max * (1 - i / 5));
        return <g key={i}>
          <line x1="58" x2="630" y1={y} y2={y} stroke="#e7eef0" />
          <text x="48" y={y + 4} textAnchor="end" fontSize="11" fill="#77838f">{tick}</text>
        </g>;
      })}
      <path d={areaPath} fill="url(#attendance-trend-area)" />
      <path d={path} fill="none" stroke="#08558B" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((point, index) => <g key={`${point.point.date}-${index}`}>
        <circle cx={point.x} cy={point.y} r="5" fill="#fff" stroke="#08558B" strokeWidth="2" />
        {(safePoints.length <= 7 || index % 5 === 0 || index === safePoints.length - 1) &&
          <text x={point.x} y="202" textAnchor="middle" fontSize="10" fill="#615E83">
            {new Date(`${point.point.date}T12:00:00`).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', { month: 'short', day: 'numeric' })}
          </text>}
      </g>)}
    </svg>
    <table className="sr-only" aria-label={tx('Attendance chart data')}>
      <caption>{tx('Attendance chart data')}</caption>
      <thead><tr><th scope="col">{tx('Date')}</th><th scope="col">{tx('Attendance records')}</th></tr></thead>
      <tbody>{safePoints.map((point, index) => <tr key={`${point.date}-${index}`}>
        <th scope="row">{new Date(`${point.date}T12:00:00`).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</th>
        <td>{Number(point.records).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function LiveDashboard({ tenantId, onOpen, canReport, locale }: { tenantId: string; onOpen: (page: PageId) => void; canReport: boolean; locale: Locale }) {
  const tx = (value: string) => projectText(locale, value);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryTenantId, setSummaryTenantId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [chartRange, setChartRange] = useState<'7' | '30'>('7');
  const [teamReportRows, setTeamReportRows] = useState<DashboardTeamReportRow[]>([]);
  const [teamReportTenantId, setTeamReportTenantId] = useState('');
  const [teamReportDate, setTeamReportDate] = useState('');
  const [teamReportLoading, setTeamReportLoading] = useState(false);
  const [teamReportError, setTeamReportError] = useState('');
  const [teamReportSearch, setTeamReportSearch] = useState('');
  const [teamReportRefresh, setTeamReportRefresh] = useState(0);
  const [teamReportDateDraft, setTeamReportDateDraft] = useState('');
  const [teamReportDateFilter, setTeamReportDateFilter] = useState('');
  const [teamReportDetail, setTeamReportDetail] = useState<{ tenantId: string; teamName: string; date: string; teamId: string | null; isUnassigned: boolean } | null>(null);
  const [teamReportDetailTenantId, setTeamReportDetailTenantId] = useState('');
  const [teamReportDetailRows, setTeamReportDetailRows] = useState<DashboardTeamReportDetail[]>([]);
  const [teamReportDetailLoading, setTeamReportDetailLoading] = useState(false);
  const [teamReportDetailError, setTeamReportDetailError] = useState('');
  const [teamReportDetailRetry, setTeamReportDetailRetry] = useState(0);
  const teamReportDetailSequence = useRef(0);
  const dashboardSummarySequence = useRef(0);
  const activeDashboardTenantId = useRef(tenantId);
  const teamReportDetailHeading = useRef<HTMLHeadingElement>(null);
  const teamReportDetailDialog = useRef<HTMLElement>(null);
  const teamReportDetailTrigger = useRef<HTMLButtonElement | null>(null);
  activeDashboardTenantId.current = tenantId;

  async function load() {
    const requestId = ++dashboardSummarySequence.current;
    setLoading(true); setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('hris_get_tenant_dashboard_summary', {
        p_tenant_id: tenantId,
      });
      if (rpcError) throw rpcError;
      const value = asObject(data);
      if (!value) throw new Error('Dashboard service returned an invalid response.');
      if (requestId !== dashboardSummarySequence.current || activeDashboardTenantId.current !== tenantId) return;
      setSummary(value as DashboardSummary);
      setSummaryTenantId(tenantId);
      setRefreshedAt(new Date());
    } catch {
      if (requestId === dashboardSummarySequence.current && activeDashboardTenantId.current === tenantId) {
        setSummary(null);
        setSummaryTenantId('');
        setError(tx('Unable to load the authorized dashboard.'));
      }
    } finally {
      if (requestId === dashboardSummarySequence.current && activeDashboardTenantId.current === tenantId) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return () => { dashboardSummarySequence.current += 1; };
  }, [tenantId]);
  useEffect(() => {
    setTeamReportDateDraft('');
    setTeamReportDateFilter('');
    setTeamReportSearch('');
    setTeamReportDetail(null);
    setTeamReportDetailTenantId('');
    setTeamReportDetailRows([]);
    setTeamReportDetailError('');
    teamReportDetailSequence.current += 1;
  }, [tenantId]);
  useEffect(() => {
    let active = true;
    if (!canReport) {
      setTeamReportRows([]);
      setTeamReportTenantId('');
      setTeamReportDate('');
      setTeamReportError('');
      setTeamReportLoading(false);
      setTeamReportDetail(null);
      setTeamReportDetailTenantId('');
      setTeamReportDetailRows([]);
      setTeamReportDetailError('');
      teamReportDetailSequence.current += 1;
      return () => { active = false; };
    }

    setTeamReportLoading(true);
    setTeamReportError('');
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('hris_get_tenant_dashboard_team_report', {
          p_tenant_id: tenantId,
          p_report_date: teamReportDateFilter || null,
        });
        if (rpcError) throw rpcError;
        const value = asObject(data);
        if (!value || !Array.isArray(value.teams)) throw new Error('Team report service returned an invalid response.');
        const reportDate = typeof value.dashboard_date === 'string' ? value.dashboard_date : '';
        if (active) {
          setTeamReportRows(asRows(value.teams) as DashboardTeamReportRow[]);
          setTeamReportDate(reportDate);
          if (reportDate) setTeamReportDateDraft(current => current || reportDate);
          setTeamReportTenantId(tenantId);
        }
      } catch {
        if (active) setTeamReportError(tx('Unable to load the authorized team report.'));
      } finally {
        if (active) setTeamReportLoading(false);
      }
    })();

    return () => { active = false; };
  }, [tenantId, canReport, teamReportRefresh, teamReportDateFilter]);
  useEffect(() => {
    if (!teamReportDetail) return;
    const requestId = ++teamReportDetailSequence.current;
    let active = true;
    setTeamReportDetailLoading(true);
    setTeamReportDetailError('');
    setTeamReportDetailRows([]);
    setTeamReportDetailTenantId('');
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('hris_get_tenant_dashboard_team_details', {
          p_tenant_id: teamReportDetail.tenantId,
          p_team_id: teamReportDetail.isUnassigned ? null : teamReportDetail.teamId,
          p_unassigned: teamReportDetail.isUnassigned,
          p_report_date: teamReportDetail.date,
        });
        if (rpcError) throw rpcError;
        const value = asObject(data);
        if (!value || value.report_date !== teamReportDetail.date || !Array.isArray(value.details)) {
          throw new Error(tx('Team detail service returned an invalid response.'));
        }
        const matchingRows = asRows(value.details) as DashboardTeamReportDetail[];
        if (active && activeDashboardTenantId.current === teamReportDetail.tenantId && requestId === teamReportDetailSequence.current) {
          setTeamReportDetailRows(matchingRows);
          setTeamReportDetailTenantId(teamReportDetail.tenantId);
        }
      } catch {
        if (active && activeDashboardTenantId.current === teamReportDetail.tenantId && requestId === teamReportDetailSequence.current) {
          setTeamReportDetailError(tx('Unable to load authorized team details.'));
        }
      } finally {
        if (active && activeDashboardTenantId.current === teamReportDetail.tenantId && requestId === teamReportDetailSequence.current) {
          setTeamReportDetailLoading(false);
        }
      }
    })();
    return () => { active = false; };
  }, [teamReportDetail, teamReportDetailRetry]);
  useEffect(() => {
    if (!teamReportDetail) return;
    teamReportDetailHeading.current?.focus();
  }, [teamReportDetail]);
  useEffect(() => {
    if (summaryTenantId === tenantId && summary
      && (!Array.isArray(summary.attendance_last_30_days) || summary.attendance_last_30_days.length < 30)) {
      setChartRange('7');
    }
  }, [summary, summaryTenantId, tenantId]);

  const currentSummary = summaryTenantId === tenantId ? summary : null;
  const metrics = [
    { label: 'Team Members', value: currentSummary?.team_members ?? currentSummary?.employees, icon: <Users className="h-4 w-4" />, emphasized: true },
    { label: 'Present', value: currentSummary?.present_today, icon: <CheckCircle2 className="h-4 w-4" />, page: 'attendance' as PageId, emphasized: true },
    { label: 'Absent', value: currentSummary?.absent_today, icon: <XCircle className="h-4 w-4" />, page: 'attendance' as PageId, emphasized: true },
    { label: 'Work from Office', value: currentSummary?.wfo_today, icon: <Building2 className="h-4 w-4" />, page: 'attendance' as PageId },
    { label: 'Work From Home', value: currentSummary?.wfh_today, icon: <House className="h-4 w-4" />, page: 'attendance' as PageId },
    { label: 'Client Meeting', value: currentSummary?.client_meeting_today, icon: <BriefcaseBusiness className="h-4 w-4" />, page: 'attendance' as PageId },
    { label: 'On Leave', value: currentSummary?.on_leave_today, icon: <CalendarDays className="h-4 w-4" />, page: 'leave' as PageId },
    { label: 'Late', value: currentSummary?.late_today, icon: <Clock3 className="h-4 w-4" />, page: 'attendance' as PageId },
  ];
  const visibleMetrics = metrics.filter(metric => `${metric.label} ${tx(metric.label)}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const has30DayTrend = Array.isArray(currentSummary?.attendance_last_30_days) && currentSummary.attendance_last_30_days.length >= 30;
  const activeChartRange = chartRange === '30' && has30DayTrend ? '30' : '7';
  const trendSource = has30DayTrend ? currentSummary?.attendance_last_30_days || [] : currentSummary?.attendance_last_7_days || [];
  const trendPoints = trendSource.slice(-Number(activeChartRange));
  const currentTeamReportRows = teamReportTenantId === tenantId ? teamReportRows : [];
  const currentTeamReportDate = teamReportTenantId === tenantId ? teamReportDate : '';
  const visibleTeamReportRows = useMemo(() => {
    const needle = teamReportSearch.trim().toLocaleLowerCase();
    return currentTeamReportRows.filter(row => !needle || String(row.team_name || '').toLocaleLowerCase().includes(needle));
  }, [currentTeamReportRows, teamReportSearch]);
  const teamReportTotals = useMemo(() => {
    const totals = { present_members: 0, absent_members: 0, total_members: 0, work_from_office: 0, work_from_home: 0, client_meeting: 0 };
    for (const row of visibleTeamReportRows) {
      totals.present_members += Number(row.present_members) || 0;
      totals.absent_members += Number(row.absent_members) || 0;
      totals.total_members += Number(row.total_members) || 0;
      totals.work_from_office += Number(row.work_from_office) || 0;
      totals.work_from_home += Number(row.work_from_home) || 0;
      totals.client_meeting += Number(row.client_meeting) || 0;
    }
    return totals;
  }, [visibleTeamReportRows]);
  const teamReportErrorMessage = (message: string, onRetry: () => void) => <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">
    <p>{message}</p><button type="button" className="mt-3 min-h-11 rounded-md border border-rose-400 px-3 font-medium" onClick={onRetry}>{tx('Retry')}</button>
  </div>;

  function applyTeamReportDate() {
    if (!teamReportDateDraft) {
      setTeamReportError(tx('Choose a report date.'));
      return;
    }
    setTeamReportError('');
    setTeamReportDateFilter(teamReportDateDraft);
  }

  function closeTeamReportDetails() {
    setTeamReportDetail(null);
    const trigger = teamReportDetailTrigger.current;
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus();
      else document.getElementById('dashboard-team-report-heading')?.focus();
      if (teamReportDetailTrigger.current === trigger) teamReportDetailTrigger.current = null;
    });
  }

  function handleTeamReportDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeTeamReportDetails();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = teamReportDetailDialog.current;
    if (!dialog) return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0);
    if (!focusable.length) {
      event.preventDefault();
      teamReportDetailHeading.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;
    const activeIndex = focusable.indexOf(activeElement as HTMLElement);
    if (activeIndex < 0) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && activeIndex === 0) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeIndex === focusable.length - 1) {
      event.preventDefault();
      first.focus();
    }
  }

  function openTeamReportDetails(row: DashboardTeamReportRow, trigger: HTMLButtonElement) {
    if (!canReport || !currentTeamReportDate) return;
    if (!row.team_id && String(row.team_name || '') !== 'Unassigned') return;
    teamReportDetailTrigger.current = trigger;
    setTeamReportDetail({
      tenantId,
      teamName: String(row.team_name || tx('Unassigned')),
      date: currentTeamReportDate,
      teamId: row.team_id || null,
      isUnassigned: !row.team_id,
    });
  }

  function downloadReport() {
    if (!currentSummary) return;
    const rows: unknown[][] = [
      [tx('Today'), tx('Team Members'), currentSummary.team_members ?? currentSummary.employees],
      ...metrics.slice(1).map(metric => [tx('Today'), tx(metric.label), metric.value]),
      ...trendPoints.map(point => [tx('Attendance trend'), point.date, point.records]),
    ];
    downloadCsv(`managerial-dashboard-${currentSummary.dashboard_date || localIsoDate(new Date())}.csv`, [tx('Section'), tx('Metric'), tx('Value')], rows);
  }

  function downloadTeamReport() {
    if (!canReport || !visibleTeamReportRows.length) return;
    const rows = visibleTeamReportRows.map(row => [
      teamReportDate, row.team_name, row.present_members, row.absent_members, row.total_members,
      row.work_from_office, row.work_from_home, row.client_meeting,
    ]);
    rows.push([teamReportDate, tx('Filtered total'), teamReportTotals.present_members, teamReportTotals.absent_members, teamReportTotals.total_members,
      teamReportTotals.work_from_office, teamReportTotals.work_from_home, teamReportTotals.client_meeting]);
    downloadCsv(`managerial-dashboard-team-report-${teamReportDate || localIsoDate(new Date())}.csv`, [
      tx('Report date'), tx('Team Name'), tx('Present Member'), tx('Absent Member'), tx('Total Member'),
      tx('Work from office'), tx('Work from Home'), tx('Client meeting'),
    ], rows);
  }

  function downloadTeamReportDetails() {
    const detail = teamReportDetail;
    if (!canReport || !detail || detail.tenantId !== tenantId
      || activeDashboardTenantId.current !== detail.tenantId
      || teamReportDetailTenantId !== detail.tenantId || !teamReportDetailRows.length) return;
    const rows = teamReportDetailRows.map(row => [
      row.employee_name, row.employee_number, row.designation_title, row.department_name,
      row.attendance_days, row.office_hours, row.working_hours, row.deviation,
    ]);
    downloadCsv(`managerial-dashboard-team-details-${detail.date}.csv`, [
      tx('Employee'), tx('Employee number'), tx('Designation'), tx('Department'),
      tx('Attendance days'), tx('Office hours'), tx('Working hours'), tx('Deviation'),
    ], rows);
  }

  return <section aria-labelledby="live-dashboard-heading" className="space-y-5">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div><h2 id="live-dashboard-heading" className="text-2xl font-semibold text-[#1E1B39]">{tx('Managerial Dashboard')}</h2>
        <p className="mt-1 text-sm text-[#86929E]">{tx('Today’s workforce attendance for this organization')}</p></div>
      <div role="group" aria-label={tx('Managerial dashboard actions')} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(220px,1fr)_auto_auto] xl:min-w-[540px]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#86929E]" />
          <input type="search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder={tx('Search metrics')} aria-label={tx('Search dashboard metrics')}
            className="min-h-11 w-full rounded-lg border border-[#DEE0E3] bg-white py-2 pl-9 pr-3 text-sm text-[#1E1B39] placeholder:text-[#86929E] focus:outline-2 focus:outline-[#08558B]" />
        </label>
        <button type="button" disabled={loading || !summary} onClick={downloadReport}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#DEE0E3] bg-white px-3 text-sm font-medium text-[#1E1B39] hover:border-[#08558B] disabled:opacity-50">
          <Download className="h-4 w-4" /> {tx('Download Report')}
        </button>
        <button type="button" onClick={() => setFiltersOpen(open => !open)} aria-expanded={filtersOpen}
          aria-controls="dashboard-filters" aria-label={tx('Filter attendance chart')}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[#DEE0E3] bg-white text-[#49454F] hover:border-[#08558B] focus-visible:outline-2 focus-visible:outline-[#08558B]">
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
    {filtersOpen && <div id="dashboard-filters" className="flex flex-wrap items-end gap-3 rounded-lg border border-[#DEE0E3] bg-white p-4">
      <div><label htmlFor="dashboard-chart-range" className="mb-1 block text-xs font-medium text-slate-600">{tx('Attendance chart range')}</label>
        <select id="dashboard-chart-range" value={chartRange} onChange={event => setChartRange(event.target.value as '7' | '30')}
          className="min-h-11 min-w-44 rounded-lg border border-slate-300 bg-white px-3 text-sm">
          <option value="7">{tx('Last 7 days')}</option><option value="30" disabled={!has30DayTrend}>{tx('Last 30 days')}</option>
        </select></div>
      <p className="pb-2 text-xs text-slate-500">{tx('Attendance tiles above always summarize today.')}</p>
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      {refreshedAt ? <p className="text-xs text-slate-500">{tx('Last refreshed')} {refreshedAt.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')}</p> : <span />}
      <button type="button" disabled={loading} onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm text-[#49454F] hover:bg-white disabled:opacity-50">
        <RefreshCw className="h-4 w-4" /> {tx('Refresh')}
      </button>
    </div>
    {error && <StatusMessage error={error} retryLabel={tx('Retry')} onRetry={() => void load()} />}
    {loading && !currentSummary ? <p role="status" className="rounded-lg border bg-white p-5 text-sm">{tx('Loading authorized dashboard data…')}</p> : currentSummary && <>
      <section className="rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5" aria-labelledby="today-attendance-heading">
        <div className="mb-4 border-b border-[#E5E5EF] pb-3"><h3 id="today-attendance-heading" className="text-lg font-normal text-[#49454F]">{tx('Today’s Attendance Summary')}</h3>
          <p className="mt-1 text-xs text-[#86929E]">{tx('Live counts from this organization’s authorized records')}</p></div>
        {visibleMetrics.length ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          {visibleMetrics.map(metric => <Metric key={metric.label} label={tx(metric.label)} value={metric.value} icon={metric.icon}
            onOpen={metric.page ? () => onOpen(metric.page!) : undefined} compact emphasized={'emphasized' in metric && metric.emphasized} />)}
        </div> : <p role="status" className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">{tx('No dashboard metrics match')} “{search}”.</p>}
      </section>
      <section className="rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5" aria-labelledby="attendance-trend-heading">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#E5E5EF] pb-3"><div><h3 id="attendance-trend-heading" className="text-base font-normal text-[#49454F]">{tx('Daily Attendance Chart')}</h3>
          <p className="mt-1 text-xs text-[#86929E]">{locale === 'bn' ? `${tx('Recorded attendance by day')} · গত ${activeChartRange} ${tx('days')}` : `${tx('Recorded attendance by day')} · last ${activeChartRange} days`}</p></div>
          <span className="rounded-md bg-[#EFF7F8] px-2 py-1 text-xs text-[#615E83]">{trendPoints.reduce((sum, point) => sum + Number(point.records || 0), 0).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')} {tx('records')}</span></div>
        <AttendanceTrend points={trendPoints} range={activeChartRange} locale={locale} />
      </section>
      <section aria-labelledby="dashboard-actions-heading" className="rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3"><h3 id="dashboard-actions-heading" className="text-base font-semibold text-[#1E1B39]">{tx('Needs attention')}</h3>
          <p className="mt-1 text-xs text-[#86929E]">{tx('Open a work queue to review pending items.')}</p></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Metric label={tx('Pending attendance corrections')} value={currentSummary.attendance_corrections_pending} icon={<Activity className="h-5 w-5" />} onOpen={() => onOpen('attendance')} />
          <Metric label={tx('Pending leave requests')} value={currentSummary.leave_pending} icon={<ClipboardList className="h-5 w-5" />} onOpen={() => onOpen('leave')} />
        </div>
      </section>
      {canReport && <section aria-labelledby="dashboard-team-report-heading" className="rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 border-b border-[#E5E5EF] pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 id="dashboard-team-report-heading" className="text-2xl font-normal text-[#3D3D3D]">{tx('Team Report')}</h3>
            <p className="mt-1 text-xs text-[#86929E]">{tx('Attendance totals by organizational team')} · {currentTeamReportDate ? displayAttendanceDate(currentTeamReportDate) : tx('today')}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-0 sm:w-40">
              <label htmlFor="dashboard-team-report-date" className="mb-1 block text-xs font-medium text-slate-600">{tx('Report date')}</label>
              <input id="dashboard-team-report-date" type="date" value={teamReportDateDraft}
                onChange={event => setTeamReportDateDraft(event.target.value)}
                className="min-h-12 w-full rounded-lg border border-[#DEE0E3] bg-white px-3 text-sm focus:outline-2 focus:outline-[#08558B]" />
            </div>
            <button type="button" disabled={teamReportLoading || !teamReportDateDraft} onClick={applyTeamReportDate}
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[#DEE0E3] bg-white px-3 text-sm font-medium text-[#1E1B39] hover:border-[#08558B] disabled:opacity-50">{tx('Apply date')}</button>
            <label className="relative block min-w-0 flex-1 sm:w-[334px] sm:flex-none">
              <img src={attendanceSearchIcon} alt="" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <input type="search" value={teamReportSearch} onChange={event => setTeamReportSearch(event.target.value)}
                placeholder={tx('Search teams')} aria-label={tx('Search team report')}
                className="min-h-12 w-full rounded-lg border border-[#DEE0E3] bg-white py-2 pl-9 pr-3 text-sm text-[#1E1B39] placeholder:text-[#86929E] focus:outline-2 focus:outline-[#08558B]" />
            </label>
            <button type="button" disabled={teamReportLoading || !visibleTeamReportRows.length} onClick={downloadTeamReport}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[#DEE0E3] bg-white px-3 text-sm font-medium text-[#1E1B39] hover:border-[#08558B] disabled:opacity-50 sm:w-[184px]">
              <img src={attendanceDownloadIcon} alt="" className="h-4 w-4 shrink-0 object-contain" /> {tx('Download Report')}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-2">
          <p className="text-xs text-slate-500" aria-live="polite">{teamReportLoading ? tx('Refreshing team report…') : teamReportError ? tx('The last update failed; showing the previous report if available.') : teamReportTenantId === tenantId ? tx('Team totals are up to date.') : tx('Team totals are not loaded.')}</p>
          <button type="button" disabled={teamReportLoading} onClick={() => setTeamReportRefresh(value => value + 1)}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm text-[#49454F] hover:bg-[#EFF7F8] disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> {tx('Refresh')}
          </button>
        </div>
        {teamReportError && teamReportErrorMessage(teamReportError, () => setTeamReportRefresh(value => value + 1))}
        {teamReportError && !currentTeamReportRows.length ? <p role="status" className="rounded-lg bg-slate-50 p-5 text-sm text-slate-600">{tx('Team report data is unavailable until the connection recovers.')}</p>
          : teamReportLoading && !currentTeamReportRows.length ? <p role="status" className="rounded-lg border bg-white p-5 text-sm">{tx('Loading authorized team report…')}</p>
          : !teamReportError && !currentTeamReportRows.length ? <p role="status" className="rounded-lg bg-slate-50 p-5 text-sm text-slate-600">{tx('No active employees are available for a team report.')}</p>
            : !teamReportError && !visibleTeamReportRows.length ? <p role="status" className="rounded-lg bg-slate-50 p-5 text-sm text-slate-600">{tx('No teams match')} “{teamReportSearch}”.</p>
              : <div role="region" aria-label={tx('Scrollable team report totals')} tabIndex={0}
                className="overflow-x-auto rounded-lg border border-[#E6EEF3] focus-visible:outline-2 focus-visible:outline-[#08558B]">
                <table aria-label={tx('Team report totals')} className="w-full min-w-[790px] border-collapse text-left text-sm sm:min-w-[980px]">
                  <thead className="bg-white text-sm font-normal text-[#64748B]">
                    <tr>{['Team Name', 'Present Member', 'Absent Member', 'Total Member', 'Work from office', 'Work from Home', 'Client meeting', 'Details'].map(label =>
                      <th key={label} scope="col" className="h-[59px] whitespace-nowrap px-4 font-normal">{tx(label)}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-[#E6EEF3] text-[#1E1B39]">
                    {visibleTeamReportRows.map((row, index) => <tr key={row.team_id || `unassigned-${index}`} className="h-20 hover:bg-[#FAFCFD]">
                      <th scope="row" className="whitespace-nowrap px-4 py-4 font-normal text-[#424242]">{display(tx(String(row.team_name || 'Unassigned')))}</th>
                      <td className="px-4 py-4 tabular-nums">{displayLocalizedNumber(row.present_members, locale)}</td>
                      <td className="px-4 py-4 tabular-nums">{displayLocalizedNumber(row.absent_members, locale)}</td>
                      <td className="px-4 py-4 tabular-nums">{displayLocalizedNumber(row.total_members, locale)}</td>
                      <td className="px-4 py-4 tabular-nums">{displayLocalizedNumber(row.work_from_office, locale)}</td>
                      <td className="px-4 py-4 tabular-nums">{displayLocalizedNumber(row.work_from_home, locale)}</td>
                      <td className="px-4 py-4 tabular-nums">{displayLocalizedNumber(row.client_meeting, locale)}</td>
                      <td className="px-4 py-4"><button type="button" onClick={event => openTeamReportDetails(row, event.currentTarget)}
                        aria-label={`${tx('View attendance details for')} ${display(tx(String(row.team_name || 'Unassigned')))}`}
                        className="min-h-12 rounded-md border border-[#DEE0E3] px-3 text-xs font-medium text-[#08558B] hover:border-[#08558B] focus-visible:outline-2 focus-visible:outline-[#08558B]">{tx('View details')}</button></td>
                    </tr>)}
                  </tbody>
                  <tfoot className="border-t-2 border-[#D1DEE5] bg-[#F4F8FA] font-semibold text-[#1E1B39]">
                    <tr><th scope="row" className="whitespace-nowrap px-3 py-3">{tx('Filtered total')}</th>
                      <td className="px-3 py-3 tabular-nums">{displayLocalizedNumber(teamReportTotals.present_members, locale)}</td>
                      <td className="px-3 py-3 tabular-nums">{displayLocalizedNumber(teamReportTotals.absent_members, locale)}</td>
                      <td className="px-3 py-3 tabular-nums">{displayLocalizedNumber(teamReportTotals.total_members, locale)}</td>
                      <td className="px-3 py-3 tabular-nums">{displayLocalizedNumber(teamReportTotals.work_from_office, locale)}</td>
                      <td className="px-3 py-3 tabular-nums">{displayLocalizedNumber(teamReportTotals.work_from_home, locale)}</td>
                      <td className="px-3 py-3 tabular-nums">{displayLocalizedNumber(teamReportTotals.client_meeting, locale)}</td><td className="px-3 py-3">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>}
        <p className="mt-3 text-xs text-slate-500">{tx('Only aggregate counts are shown. Employees with no same-tenant team assignment appear as Unassigned.')}</p>
        <p className="mt-1 text-xs text-slate-500">{tx('Team membership totals reflect current active employee records; attendance counts use the selected report date.')}</p>
      </section>}
      {teamReportDetail && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-3" role="presentation"
        onMouseDown={event => { if (event.target === event.currentTarget) closeTeamReportDetails(); }}>
        <section ref={teamReportDetailDialog} role="dialog" aria-modal="true" aria-labelledby="team-report-detail-heading" onKeyDown={handleTeamReportDialogKeyDown} className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
            <div><h3 ref={teamReportDetailHeading} id="team-report-detail-heading" tabIndex={-1} className="font-semibold text-slate-900">{tx('Team report details')}</h3>
              <p className="mt-1 text-sm text-slate-600">{display(tx(teamReportDetail.teamName))} · {displayAttendanceDate(teamReportDetail.date)}</p>
              <p className="mt-1 text-xs text-slate-500">{tx('Authorized employee-level attendance aggregates for the selected date.')}</p></div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <button type="button" disabled={!canReport || teamReportDetailLoading || teamReportDetailError !== ''
                || teamReportDetailTenantId !== teamReportDetail.tenantId || !teamReportDetailRows.length}
                onClick={downloadTeamReportDetails} aria-label={tx('Download details')}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#DEE0E3] px-3 text-sm text-[#08558B] disabled:opacity-50">
                <img src={attendanceDownloadIcon} alt="" className="h-3 w-2.5 object-contain" />{tx('Download details')}
              </button>
              <button type="button" onClick={closeTeamReportDetails} className="min-h-10 rounded-md border border-slate-300 px-3 text-sm">{tx('Close')}</button>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            {teamReportDetailError && teamReportErrorMessage(teamReportDetailError, () => setTeamReportDetailRetry(value => value + 1))}
            {teamReportDetailLoading ? <p role="status" className="rounded-lg bg-slate-50 p-4 text-sm">{tx('Loading team details…')}</p>
              : !teamReportDetailError && teamReportDetailTenantId === tenantId && !teamReportDetailRows.length
                ? <p role="status" className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">{tx('No attendance report details are available for this team and date.')}</p>
                : !teamReportDetailError && teamReportDetailTenantId === tenantId && <div role="region" aria-label={tx('Scrollable team report details')} tabIndex={0} className="overflow-x-auto rounded-lg border border-slate-200 focus-visible:outline-2 focus-visible:outline-[#08558B]">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead className="bg-[#F4F8FA] text-xs text-slate-600"><tr>{['Employee', 'Employee number', 'Designation', 'Department', 'Attendance days', 'Office hours', 'Working hours', 'Deviation'].map(label => <th key={label} scope="col" className="whitespace-nowrap px-3 py-3">{tx(label)}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-100">{teamReportDetailRows.map((row, index) => <tr key={`${row.employee_number || 'employee'}-${index}`}>
                      <th scope="row" className="px-3 py-3 font-medium">{display(row.employee_name)}</th>
                      <td className="px-3 py-3">{display(row.employee_number)}</td><td className="px-3 py-3">{display(row.designation_title)}</td>
                      <td className="px-3 py-3">{display(row.department_name)}</td><td className="px-3 py-3 tabular-nums">{displayLocalizedNumber(row.attendance_days, locale)}</td>
                      <td className="px-3 py-3 tabular-nums">{displayLocalizedNumber(row.office_hours, locale)}</td><td className="px-3 py-3 tabular-nums">{displayLocalizedNumber(row.working_hours, locale)}</td><td className="px-3 py-3 tabular-nums">{displayLocalizedNumber(row.deviation, locale)}</td>
                    </tr>)}</tbody>
                  </table>
                </div>}
          </div>
        </section>
      </div>}
      <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
        Present, absent, and late counts use explicit attendance statuses. Work location uses stored attendance modes; “On Leave” counts approved leave covering today. No schedule-based late marks or sample counts are substituted.
      </p>
    </>}
  </section>;
}

function AttendanceReport({ tenantId, canView, canReport, canManage, locale }: { tenantId: string; canView: boolean; canReport: boolean; canManage: boolean; locale: Locale }) {
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
  const [rejectingCorrection, setRejectingCorrection] = useState<AttendanceRecord | null>(null);
  const [correctionResolutionNote, setCorrectionResolutionNote] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const requestSequence = useRef(0);
  const rejectionDialogRef = useRef<HTMLDivElement>(null);
  const rejectionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const resolvingCorrectionIdRef = useRef('');
  const activeTenantId = useRef(tenantId);
  activeTenantId.current = tenantId;
  resolvingCorrectionIdRef.current = resolvingCorrectionId;
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
    setResolvingCorrectionId(''); setRejectingCorrection(null); setCorrectionResolutionNote(''); setActionMessage('');
  }, [tenantId]);

  useEffect(() => {
    if (!rejectingCorrection) return;
    const dialog = rejectionDialogRef.current;
    const focusable = (): HTMLElement[] => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) || []);
    focusable()[0]?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !resolvingCorrectionIdRef.current) {
        setRejectingCorrection(null); setCorrectionResolutionNote('');
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
      if (rejectionTriggerRef.current?.isConnected) rejectionTriggerRef.current.focus();
      else document.getElementById('attendance-report-heading')?.focus();
    };
  }, [rejectingCorrection]);

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

  async function resolveCorrection(id: string, decision: 'approved' | 'rejected', note: string | null = null) {
    if (resolvingCorrectionId) return;
    const actionTenantId = tenantId;
    setResolvingCorrectionId(id); setActionMessage(''); setError('');
    try {
      const { error: rpcError } = await supabase.rpc('admin_resolve_attendance_correction', {
        p_id: id, p_decision: decision, p_note: note?.trim() || null,
      });
      if (rpcError) throw rpcError;
      if (activeTenantId.current !== actionTenantId) return;
      setActionMessage(`Attendance correction ${decision}.`);
      if (decision === 'rejected') {
        setRejectingCorrection(null);
        setCorrectionResolutionNote('');
      }
      await load();
      if (decision === 'rejected') document.getElementById('attendance-report-heading')?.focus();
    } catch (cause) {
      if (activeTenantId.current === actionTenantId) setError(cause instanceof Error ? cause.message : 'Unable to resolve this correction.');
    } finally {
      if (activeTenantId.current === actionTenantId) setResolvingCorrectionId('');
    }
  }

  function exportReport() {
    const exportRows = filteredRows;
    if (!exportRows.length) return;
    const fields = aggregateOnly
      ? ['employee_name', 'employee_number', 'designation_title', 'team_name', 'department_name', 'attendance_days', 'office_hours', 'working_hours', 'deviation']
      : ['full_name', 'employee_number', 'designation_title', 'team_name', 'department_name', 'attendance_date', 'check_in', 'check_out', 'work_mode', 'status', 'work_hours'];
    const labels = aggregateOnly
      ? ['Employee', 'Employee number', 'Designation', 'Team Name', 'Department', 'Attendance days', 'Office hours', 'Working hours', 'Deviation']
      : ['Employee', 'Employee number', 'Designation', projectText(locale, 'Team Name'), 'Department', 'Date', 'Check in', 'Check out', 'Work location', 'Status', 'Working hours'];
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

  return <section aria-labelledby="attendance-report-heading" className={`space-y-4 ${aggregateOnly ? 'mx-auto w-full max-w-[1386px]' : ''}`}>
    <div className={`flex flex-wrap justify-between gap-3 ${aggregateOnly ? 'items-center' : 'items-end'}`}>
      <div><h2 id="attendance-report-heading" tabIndex={-1} className="text-2xl font-medium text-[#49454F]">Attendance Report</h2>
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
            <td className="px-3 py-3 capitalize"><span>{display(item.status)}</span>
              {Boolean(item.resolution_note) && <span className="mt-1 block normal-case whitespace-normal text-xs font-normal text-slate-600">Decision note: {display(item.resolution_note)}</span>}
            </td>
            {canManage && <td className="px-3 py-3">
              {item.status === 'pending' ? <div className="flex gap-2">
                <button type="button" disabled={Boolean(resolvingCorrectionId)} onClick={() => void resolveCorrection(String(item.id), 'approved')}
                  className="min-h-10 rounded-md bg-[#08558B] px-3 text-xs font-medium text-white disabled:opacity-50">
                  {resolvingCorrectionId === item.id ? 'Saving…' : 'Approve'}
                </button>
                <button type="button" disabled={Boolean(resolvingCorrectionId)}
                  className="min-h-10 rounded-md border border-slate-300 px-3 text-xs font-medium disabled:opacity-50"
                  onClick={event => { rejectionTriggerRef.current = event.currentTarget; setCorrectionResolutionNote(''); setError(''); setActionMessage(''); setRejectingCorrection(item); }}>Reject</button>
              </div> : '—'}
            </td>}
          </tr>)}</tbody>
        </table>
      </div>
    </section>}
    {currentTenantReady && rejectingCorrection && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-3" role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget && !resolvingCorrectionId) { setRejectingCorrection(null); setCorrectionResolutionNote(''); } }}>
      <div ref={rejectionDialogRef} role="dialog" aria-modal="true" aria-labelledby="attendance-rejection-heading" aria-describedby="attendance-rejection-description"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 id="attendance-rejection-heading" className="font-semibold text-slate-900">Reject attendance correction</h3>
          <p id="attendance-rejection-description" className="mt-1 text-sm text-slate-600">{display(rejectingCorrection.full_name)} · {display(rejectingCorrection.attendance_date)}</p>
          <p className="mt-1 text-xs text-slate-500">{display(rejectingCorrection.reason)}</p>
        </div>
        <div className="space-y-3 p-5">
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
          <label htmlFor="attendance-rejection-note" className="block text-sm font-medium text-slate-700">Decision note <span className="font-normal text-slate-500">(optional)</span></label>
          <textarea id="attendance-rejection-note" rows={4} value={correctionResolutionNote} onChange={event => setCorrectionResolutionNote(event.target.value)} disabled={Boolean(resolvingCorrectionId)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-[#085587] disabled:opacity-60" />
          <p className="text-xs text-slate-500">The employee can see this note with the decision in their correction history.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button type="button" disabled={Boolean(resolvingCorrectionId)} onClick={() => { setRejectingCorrection(null); setCorrectionResolutionNote(''); }}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm disabled:opacity-50">Cancel</button>
          <button type="button" disabled={Boolean(resolvingCorrectionId)} onClick={() => void resolveCorrection(String(rejectingCorrection.id), 'rejected', correctionResolutionNote)}
            className="min-h-11 rounded-lg bg-rose-700 px-4 text-sm font-medium text-white disabled:opacity-50">{resolvingCorrectionId ? 'Saving…' : 'Reject correction'}</button>
        </div>
      </div>
    </div>}
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {loading || !currentTenantReady ? <p role="status" className="p-5 text-sm">Loading attendance data…</p> : !rows.length ? <p className="p-5 text-sm text-slate-600">{aggregateOnly && appliedTeamFilter ? 'No attendance report rows match the selected team.' : 'No attendance records were returned for this date range.'}</p> : <div role="region" aria-label="Scrollable attendance report table" tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-[#08558B]">
          <table aria-label={aggregateOnly ? 'Attendance summary by employee' : 'Attendance information'} className={`w-full border-separate text-left text-sm ${aggregateOnly ? 'min-w-[1383px] border-spacing-x-0 border-spacing-y-[6px]' : 'min-w-[1280px] border-spacing-0'}`}>
          <thead className="bg-white text-xs text-slate-500"><tr>
            {(aggregateOnly ? ['Name', 'Designation', 'Team Name', 'Department', 'From date', 'To date', 'Office Hour', 'Work Hour', 'Deviation'] : ['Name', 'Designation', projectText(locale, 'Team Name'), 'Department', 'Date', 'Work location', 'In time', 'Out time', 'Work hours', 'Status']).map(label => <th key={label} scope="col" aria-sort={aggregateOnly && label === 'Team Name' ? teamSortDirection === 'asc' ? 'ascending' : teamSortDirection === 'desc' ? 'descending' : 'none' : undefined} className="border-b border-slate-200 px-4 py-4 font-medium">
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
              <td className={cellClass}>{display(row.team_name)}</td>
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

function LeaveWorkspace({ tenantId, canManage, locale }: { tenantId: string; canManage: boolean; locale: Locale }) {
  const tx = (value: string) => projectText(locale, value);
  const [data, setData] = useState<LeaveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resolvingRequestId, setResolvingRequestId] = useState('');
  const [downloadingEvidenceId, setDownloadingEvidenceId] = useState('');
  const [evidenceMessage, setEvidenceMessage] = useState('');
  const [evidenceError, setEvidenceError] = useState('');
  const [rejectingRequest, setRejectingRequest] = useState<LeaveRequest | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [requestFromDate, setRequestFromDate] = useState('');
  const [requestToDate, setRequestToDate] = useState('');
  const [appliedRequestRange, setAppliedRequestRange] = useState({ from: '', to: '' });
  const [filterError, setFilterError] = useState('');
  const [absenceMonth, setAbsenceMonth] = useState(() => leaveCalendarMonth());
  const [selectedAbsenceDate, setSelectedAbsenceDate] = useState(() => localIsoDate(new Date()));
  const [absenceData, setAbsenceData] = useState<LeaveData | null>(null);
  const [absenceDataTenantId, setAbsenceDataTenantId] = useState('');
  const [absenceDataMonth, setAbsenceDataMonth] = useState('');
  const [absenceLoading, setAbsenceLoading] = useState(true);
  const [absenceError, setAbsenceError] = useState('');
  const dataTenantId = useRef('');
  const requestSequence = useRef(0);
  const absenceRequestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  const rejectionDialogRef = useRef<HTMLDivElement>(null);
  const rejectionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const resolvingRequestIdRef = useRef('');
  activeTenantId.current = tenantId;
  resolvingRequestIdRef.current = resolvingRequestId;

  async function load(range = appliedRequestRange) {
    const requestId = ++requestSequence.current;
    const requestedTenantId = tenantId;
    setLoading(true); setError(''); setEvidenceMessage(''); setEvidenceError('');
    try {
      const { data: response, error: rpcError } = await supabase.rpc('hris_get_tenant_leave_data', {
        p_tenant_id: requestedTenantId, p_start: range.from || null, p_end: range.to || null,
      });
      if (rpcError) throw rpcError;
      const value = asObject(response);
      if (!value) throw new Error('Leave service returned an invalid response.');
      if (requestId !== requestSequence.current) return;
      setData({ requests: asRows(value.requests), leave_types: asRows(value.leave_types), holidays: asRows(value.holidays) });
      dataTenantId.current = requestedTenantId;
    } catch (cause) {
      if (requestId !== requestSequence.current) return;
      setData(null); dataTenantId.current = requestedTenantId;
      setError(cause instanceof Error ? cause.message : 'Unable to load leave data.');
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }

  async function loadAbsenceSchedule(month = absenceMonth) {
    const requestId = ++absenceRequestSequence.current;
    const requestedTenantId = tenantId;
    setAbsenceLoading(true);
    setAbsenceError('');
    try {
      const bounds = leaveCalendarBounds(month);
      const { data: response, error: rpcError } = await supabase.rpc('hris_get_tenant_leave_data', {
        p_tenant_id: requestedTenantId, p_start: bounds.start, p_end: bounds.end,
      });
      if (rpcError) throw rpcError;
      const value = asObject(response);
      if (!value) throw new Error('Absence calendar returned an invalid response.');
      if (requestId !== absenceRequestSequence.current || activeTenantId.current !== requestedTenantId) return;
      setAbsenceData({ requests: asRows(value.requests), leave_types: asRows(value.leave_types), holidays: asRows(value.holidays) });
      setAbsenceDataTenantId(requestedTenantId);
      setAbsenceDataMonth(month);
    } catch {
      if (requestId !== absenceRequestSequence.current || activeTenantId.current !== requestedTenantId) return;
      setAbsenceData(null);
      setAbsenceDataTenantId(requestedTenantId);
      setAbsenceDataMonth(month);
      setAbsenceError(tx('Unable to load the absence calendar.'));
    } finally {
      if (requestId === absenceRequestSequence.current && activeTenantId.current === requestedTenantId) setAbsenceLoading(false);
    }
  }

  useEffect(() => {
    setData(null); dataTenantId.current = '';
    setResolvingRequestId(''); setRejectingRequest(null); setResolutionNote(''); setActionMessage('');
    setDownloadingEvidenceId(''); setEvidenceMessage(''); setEvidenceError('');
    setSearch(''); setStatusFilter('all'); setFilterError('');
    void load(appliedRequestRange);
    return () => { requestSequence.current += 1; };
  }, [tenantId, appliedRequestRange]);

  useEffect(() => {
    setAbsenceData(null);
    setAbsenceDataTenantId('');
    setAbsenceDataMonth('');
    setSelectedAbsenceDate(`${absenceMonth}-01`);
    setAbsenceError('');
    void loadAbsenceSchedule(absenceMonth);
    return () => { absenceRequestSequence.current += 1; };
  }, [tenantId, absenceMonth]);

  useEffect(() => {
    if (!rejectingRequest) return;
    const dialog = rejectionDialogRef.current;
    const focusable = (): HTMLElement[] => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) || []);
    focusable()[0]?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !resolvingRequestIdRef.current) {
        setRejectingRequest(null); setResolutionNote('');
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
      if (rejectionTriggerRef.current?.isConnected) rejectionTriggerRef.current.focus();
      else document.getElementById('leave-workspace-heading')?.focus();
    };
  }, [rejectingRequest]);
  const visibleData = dataTenantId.current === tenantId ? data : null;
  const visibleAbsenceData = absenceDataTenantId === tenantId && absenceDataMonth === absenceMonth ? absenceData : null;
  const absenceRequests = (visibleAbsenceData?.requests || []).filter(item => String(item.status || '').toLowerCase() === 'approved');
  const absenceHolidays = (visibleAbsenceData?.holidays || []).filter(item => item.active === true);
  const selectedDateAbsences = absenceRequests.filter(item =>
    String(item.from_date || '') <= selectedAbsenceDate && String(item.to_date || '') >= selectedAbsenceDate);
  const selectedDateHolidays = absenceHolidays.filter(item =>
    String(item.start_date || '') <= selectedAbsenceDate && String(item.end_date || '') >= selectedAbsenceDate);
  const calendarCells = leaveCalendarCells(absenceMonth);
  const calendarWeekdays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(2024, 0, 1 + index));
    return date.toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', { weekday: 'short', timeZone: 'UTC' });
  });
  const calendarMonthLabel = new Date(`${absenceMonth}-01T12:00:00`).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', { month: 'long', year: 'numeric' });
  const selectedAbsenceDateLabel = new Date(`${selectedAbsenceDate}T12:00:00`).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const calendarDateText = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : display(value);
  const pending = useMemo(() => (visibleData?.requests || []).filter(item => String(item.status || '').toLowerCase() === 'pending'), [visibleData]);
  const statusOptions = useMemo(() => Array.from(new Set((visibleData?.requests || [])
    .map(item => String(item.status || '').trim()).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })), [visibleData]);
  const filteredRequests = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (visibleData?.requests || []).filter(item => {
      const matchesStatus = statusFilter === 'all' || String(item.status || '').toLocaleLowerCase() === statusFilter;
      const searchText = [item.full_name, item.employee_number, item.leave_type_name, item.leave_type_code,
        item.from_date, item.to_date, item.status].map(value => String(value ?? '')).join(' ').toLocaleLowerCase();
      return matchesStatus && (!needle || searchText.includes(needle));
    });
  }, [visibleData, search, statusFilter]);

  function applyRequestDateRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestFromDate && requestToDate && requestFromDate > requestToDate) {
      setFilterError(tx('The end date must be on or after the start date.'));
      return;
    }
    setFilterError('');
    const nextRange = { from: requestFromDate, to: requestToDate };
    if (nextRange.from === appliedRequestRange.from && nextRange.to === appliedRequestRange.to) {
      void load(nextRange);
      return;
    }
    setAppliedRequestRange(nextRange);
  }

  function clearRequestDateRange() {
    setRequestFromDate('');
    setRequestToDate('');
    setFilterError('');
    if (!appliedRequestRange.from && !appliedRequestRange.to) return;
    setAppliedRequestRange({ from: '', to: '' });
  }

  async function resolveRequest(id: string, decision: 'approved' | 'rejected', note: string | null = null) {
    if (resolvingRequestId) return;
    const actionTenantId = tenantId;
    setResolvingRequestId(id); setActionMessage(''); setError('');
    try {
      const { error: rpcError } = await supabase.rpc('admin_resolve_leave_request', {
        p_id: id, p_decision: decision, p_note: note?.trim() || null,
      });
      if (rpcError) throw rpcError;
      if (activeTenantId.current !== actionTenantId) return;
      setActionMessage(`Leave request ${decision}.`);
      if (decision === 'rejected') {
        setRejectingRequest(null);
        setResolutionNote('');
      }
      await load();
      await loadAbsenceSchedule(absenceMonth);
      if (decision === 'rejected') document.getElementById('leave-workspace-heading')?.focus();
    } catch (cause) {
      if (activeTenantId.current === actionTenantId) {
        setError(cause instanceof Error ? cause.message : 'Unable to resolve this leave request.');
      }
    } finally {
      if (activeTenantId.current === actionTenantId) setResolvingRequestId('');
    }
  }

  async function downloadEvidence(request: LeaveRequest) {
    const id = String(request.id || '');
    const path = String(request.attachment_url || '').trim();
    const parts = path.split('/');
    const extension = parts.at(-1)?.split('.').at(-1)?.toLowerCase() || '';
    if (!id || parts.length !== 3 || parts.some(part => !part || part === '.' || part === '..')
        || parts[1] !== tenantId || !/^[0-9a-f-]{36}$/i.test(parts[0])
        || !/^[0-9a-f-]{36}\.(pdf|doc|docx|jpg|png)$/i.test(parts[2])) {
      setEvidenceMessage(''); setEvidenceError('This evidence reference is not valid for the active organization.');
      return;
    }
    if (downloadingEvidenceId) return;
    const actionTenantId = tenantId;
    setDownloadingEvidenceId(id); setEvidenceMessage(''); setEvidenceError('');
    try {
      // Download through the authenticated Storage client. The private bucket's
      // SELECT policies remain the authority for employee and tenant access.
      const { data: file, error: storageError } = await supabase.storage.from('leave-evidence').download(path);
      if (storageError) throw storageError;
      if (!file) throw new Error('The evidence file was not returned.');
      if (activeTenantId.current !== actionTenantId) return;
      const objectUrl = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `leave-evidence-${id.slice(0, 8)}.${extension}`;
      anchor.rel = 'noopener';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      setEvidenceMessage('Evidence downloaded.');
    } catch (cause) {
      if (activeTenantId.current === actionTenantId) {
        setEvidenceError(cause instanceof Error ? cause.message : 'Unable to download this private evidence.');
      }
    } finally {
      if (activeTenantId.current === actionTenantId) setDownloadingEvidenceId('');
    }
  }

  const hasEvidence = Boolean(visibleData?.requests.some(item => String(item.attachment_url || '').trim()));

  return <section aria-labelledby="leave-workspace-heading" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="leave-workspace-heading" tabIndex={-1} className="text-2xl font-medium text-[#49454F]">Leave Requests</h2>
        <p className="mt-1 text-sm text-slate-500">Tenant leave records returned by the authorized HRIS service</p></div>
      <button type="button" disabled={loading || absenceLoading} onClick={() => { void load(); void loadAbsenceSchedule(absenceMonth); }} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
        <RefreshCw className="h-4 w-4" /> Refresh
      </button>
    </div>
    {error && <StatusMessage error={error} onRetry={() => void load()} />}
    {actionMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{actionMessage}</p>}
    {evidenceError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{evidenceError}</p>}
    {evidenceMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{evidenceMessage}</p>}
    {loading || (!visibleData && !error) ? <p role="status" className="rounded-lg border bg-white p-5 text-sm">Loading authorized leave records…</p> : visibleData && <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-600">Pending requests</p><p className="mt-2 text-2xl font-semibold">{pending.length}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-600">Leave types</p><p className="mt-2 text-2xl font-semibold">{visibleData.leave_types.length}</p></div>
        <div className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-600">Holidays</p><p className="mt-2 text-2xl font-semibold">{visibleData.holidays.length}</p></div>
      </div>
      <section aria-labelledby="leave-absence-calendar-heading" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h3 id="leave-absence-calendar-heading" className="font-semibold text-[#08263D]">{tx('Absence calendar')}</h3>
            <p className="mt-1 text-xs text-slate-600">{tx('Only approved leave requests appear here. Pending requests remain in the review queue.')}</p></div>
          <div className="flex flex-wrap items-end gap-2">
            <button type="button" aria-label={tx('Previous month')} onClick={() => setAbsenceMonth(month => shiftLeaveCalendarMonth(month, -1))}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg" aria-controls="leave-absence-month-view">‹</button>
            <div><label htmlFor="leave-absence-month" className="mb-1 block text-xs font-medium text-slate-600">{tx('Month')}</label>
              <input id="leave-absence-month" type="month" required value={absenceMonth}
                onChange={event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) setAbsenceMonth(event.target.value); }}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm" /></div>
            <button type="button" aria-label={tx('Next month')} onClick={() => setAbsenceMonth(month => shiftLeaveCalendarMonth(month, 1))}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg" aria-controls="leave-absence-month-view">›</button>
            <button type="button" onClick={() => setAbsenceMonth(leaveCalendarMonth())}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm">{tx('Current month')}</button>
          </div>
        </div>
        {absenceError && <StatusMessage error={absenceError} onRetry={() => void loadAbsenceSchedule(absenceMonth)} retryLabel={tx('Retry')} />}
        {(absenceLoading || (!visibleAbsenceData && !absenceError)) && <p role="status" className="rounded-lg border bg-[#F8FAFA] p-4 text-sm">{tx('Loading absence calendar…')}</p>}
        {visibleAbsenceData && !absenceLoading && <>
          <div className="overflow-x-auto rounded-lg border border-slate-200" role="region" aria-label={`${tx('Absence calendar')} ${calendarMonthLabel}`} tabIndex={0}>
            <table id="leave-absence-month-view" className="w-full min-w-[336px] table-fixed text-left text-sm" aria-label={`${tx('Absence calendar')} ${calendarMonthLabel}`}>
              <thead className="bg-[#EFF7F8] text-xs text-slate-600"><tr>{calendarWeekdays.map(day => <th key={day} scope="col" className="px-1 py-2 text-center font-medium">{day}</th>)}</tr></thead>
              <tbody>{Array.from({ length: calendarCells.length / 7 }, (_, week) => <tr key={week} className="divide-x divide-slate-100 border-t border-slate-100">
                {calendarCells.slice(week * 7, week * 7 + 7).map((date, dayIndex) => {
                  if (!date) return <td key={`empty-${week}-${dayIndex}`} className="h-[76px] bg-slate-50/60" aria-hidden="true" />;
                  const dayAbsences = absenceRequests.filter(item => String(item.from_date || '') <= date && String(item.to_date || '') >= date);
                  const dayHolidays = absenceHolidays.filter(item => String(item.start_date || '') <= date && String(item.end_date || '') >= date);
                  const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                  return <td key={date} className="h-[76px] p-0.5 align-top sm:p-1">
                    <button type="button" aria-pressed={selectedAbsenceDate === date}
                      aria-label={`${dayLabel}, ${localizedEmployeeNumber(dayAbsences.length, locale)} ${tx('people on leave')}${dayHolidays.length ? `, ${dayHolidays.map(item => display(item.name)).join(', ')}` : ''}`}
                      onClick={() => setSelectedAbsenceDate(date)}
                      className={`flex h-full min-h-[72px] w-full flex-col items-start rounded-md p-1 text-left focus-visible:outline-2 focus-visible:outline-[#085587] sm:p-1.5 ${selectedAbsenceDate === date ? 'bg-[#E7F1F3] ring-1 ring-[#085587]' : 'hover:bg-slate-50'}`}>
                      <span className="font-medium tabular-nums">{new Date(`${date}T12:00:00Z`).getUTCDate().toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')}</span>
                      {dayAbsences.length > 0 && <span className="mt-1 w-full truncate rounded bg-[#DCEFF4] px-1 py-0.5 text-[9px] font-medium leading-3 text-[#085587] sm:text-[10px]">{localizedEmployeeNumber(dayAbsences.length, locale)} {tx('people on leave')}</span>}
                      {dayHolidays.length > 0 && <span className="mt-1 w-full truncate rounded bg-amber-50 px-1 py-0.5 text-[9px] leading-3 text-amber-800 sm:text-[10px]">{display(dayHolidays[0].name)}</span>}
                    </button>
                  </td>;
                })}
              </tr>)}</tbody>
            </table>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <section aria-labelledby="leave-absence-day-heading" className="min-w-0 rounded-lg border border-slate-200 p-3">
              <h4 id="leave-absence-day-heading" className="font-medium text-slate-800">{tx('Approved absences on')} {selectedAbsenceDateLabel}</h4>
              {selectedDateAbsences.length ? <ul className="mt-2 divide-y divide-slate-100">{selectedDateAbsences.map((item, index) => <li key={String(item.id || index)} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-2 text-sm">
                <span className="font-medium text-slate-800">{display(item.full_name)}</span><span className="text-slate-600">{display(item.leave_type_name)} · {calendarDateText(item.from_date)} – {calendarDateText(item.to_date)}</span>
              </li>)}</ul> : <p className="mt-2 text-sm text-slate-600">{tx('No approved absences on this date.')}</p>}
            </section>
            <section aria-labelledby="leave-absence-holiday-heading" className="min-w-0 rounded-lg border border-slate-200 p-3">
              <h4 id="leave-absence-holiday-heading" className="font-medium text-slate-800">{tx('Organization holidays on')} {selectedAbsenceDateLabel}</h4>
              {selectedDateHolidays.length ? <ul className="mt-2 divide-y divide-slate-100">{selectedDateHolidays.map((item, index) => <li key={String(item.id || index)} className="py-2 text-sm text-slate-700">{display(item.name)} · {calendarDateText(item.start_date)} – {calendarDateText(item.end_date)}</li>)}</ul>
                : <p className="mt-2 text-sm text-slate-600">{tx('No organization holidays on this date.')}</p>}
            </section>
          </div>
        </>}
      </section>
      {canManage && <LeaveTypePolicyManager tenantId={tenantId} leaveTypes={visibleData.leave_types} locale={locale} onRefresh={() => load()} />}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <form onSubmit={applyRequestDateRange} className="grid grid-cols-1 items-end gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_minmax(132px,0.8fr)_minmax(132px,0.8fr)_minmax(170px,1fr)_auto_auto]">
          <div className="min-w-0"><label htmlFor="leave-request-search" className="mb-1 block text-xs font-medium text-slate-600">{tx('Search requests')}</label>
            <input id="leave-request-search" type="search" value={search} onChange={event => setSearch(event.target.value)}
              placeholder={tx('Employee, leave type, date…')} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
          </div>
          <div><label htmlFor="leave-request-from" className="mb-1 block text-xs font-medium text-slate-600">{tx('From date')}</label>
            <input id="leave-request-from" type="date" value={requestFromDate} onChange={event => setRequestFromDate(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
          </div>
          <div><label htmlFor="leave-request-to" className="mb-1 block text-xs font-medium text-slate-600">{tx('To date')}</label>
            <input id="leave-request-to" type="date" value={requestToDate} onChange={event => setRequestToDate(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
          </div>
          <div><label htmlFor="leave-request-status" className="mb-1 block text-xs font-medium text-slate-600">{tx('Filter by status')}</label>
            <select id="leave-request-status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="all">{tx('All statuses')}</option>
              {statusOptions.map(status => <option key={status} value={status.toLocaleLowerCase()}>{status.replaceAll('_', ' ').replace(/^\w/, letter => letter.toUpperCase())}</option>)}
            </select>
          </div>
          <button type="submit" className="min-h-11 rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white hover:bg-[#074770]">{tx('Apply date range')}</button>
          <button type="button" onClick={clearRequestDateRange} disabled={!requestFromDate && !requestToDate && !appliedRequestRange.from && !appliedRequestRange.to}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm disabled:opacity-50">{tx('Clear dates')}</button>
          {filterError && <p className="text-sm text-rose-700 sm:col-span-2 xl:col-span-6" role="alert">{filterError}</p>}
          <p className="text-xs text-slate-500 sm:col-span-2 xl:col-span-6" role="status">{localizedProjectText(locale, 'Showing {shown} of {total}', { shown: filteredRequests.length, total: visibleData.requests.length })}</p>
        </form>
        {!visibleData.requests.length ? <p className="p-5 text-sm text-slate-600">No leave requests were returned for this tenant.</p> : !filteredRequests.length
          ? <p className="p-5 text-sm text-slate-600">No requests match these filters.</p> : <div className="overflow-x-auto" role="region" aria-label="Leave request results" tabIndex={0}>
          <table className="w-full min-w-[760px] text-left text-sm" aria-label="Leave requests">
            <thead className="bg-[#eff7f8] text-xs text-slate-600"><tr>
              {['Employee', 'Leave type', 'From', 'To', 'Days', 'Status', ...(hasEvidence ? ['Evidence'] : []), ...(canManage ? ['Actions'] : [])].map(label => <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{filteredRequests.map((row, index) => <tr key={String(row.id || index)}>
              <td className="px-3 py-3 font-medium">{display(row.full_name)}</td><td className="px-3 py-3">{display(row.leave_type_name)}</td>
              <td className="px-3 py-3">{display(row.from_date)}</td><td className="px-3 py-3">{display(row.to_date)}</td>
              <td className="px-3 py-3">{display(row.requested_days)}</td><td className="px-3 py-3 font-medium">
                <span>{display(row.status)}</span>
                {Boolean(row.resolution_note) && <span className="mt-1 block whitespace-normal text-xs font-normal text-slate-600">Decision note: {display(row.resolution_note)}</span>}
              </td>
              {hasEvidence && <td className="px-3 py-3">{String(row.attachment_url || '').trim()
                ? <button type="button" disabled={Boolean(downloadingEvidenceId)}
                    aria-label={`Download evidence for ${display(row.full_name)}’s ${display(row.leave_type_name)} leave request`}
                    onClick={() => void downloadEvidence(row)}
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 disabled:opacity-50">
                    {downloadingEvidenceId === row.id ? 'Downloading…' : 'Download evidence'}
                  </button> : '—'}</td>}
              {canManage && <td className="px-3 py-3">
                {row.status === 'pending' ? <div className="flex gap-2">
                  <button type="button" disabled={Boolean(resolvingRequestId)} onClick={() => void resolveRequest(String(row.id), 'approved')}
                    className="min-h-10 rounded-md bg-[#08558B] px-3 text-xs font-medium text-white disabled:opacity-50">
                    {resolvingRequestId === row.id ? 'Saving…' : 'Approve'}
                  </button>
                  <button type="button" disabled={Boolean(resolvingRequestId)}
                    className="min-h-10 rounded-md border border-slate-300 px-3 text-xs font-medium disabled:opacity-50"
                    onClick={event => { rejectionTriggerRef.current = event.currentTarget; setResolutionNote(''); setError(''); setActionMessage(''); setRejectingRequest(row); }}>Reject</button>
                </div> : '—'}
              </td>}
            </tr>)}</tbody>
          </table>
        </div>}
      </div>
      {rejectingRequest && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-3" role="presentation"
        onMouseDown={event => { if (event.target === event.currentTarget && !resolvingRequestId) { setRejectingRequest(null); setResolutionNote(''); } }}>
        <div ref={rejectionDialogRef} role="dialog" aria-modal="true" aria-labelledby="leave-rejection-heading" aria-describedby="leave-rejection-description"
          className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 id="leave-rejection-heading" className="font-semibold text-slate-900">Reject leave request</h3>
            <p id="leave-rejection-description" className="mt-1 text-sm text-slate-600">{display(rejectingRequest.full_name)} · {display(rejectingRequest.leave_type_name)} · {display(rejectingRequest.from_date)} to {display(rejectingRequest.to_date)}</p>
          </div>
          <div className="space-y-3 p-5">
            {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
            <label htmlFor="leave-rejection-note" className="block text-sm font-medium text-slate-700">Decision note <span className="font-normal text-slate-500">(optional)</span></label>
            <textarea id="leave-rejection-note" rows={4} value={resolutionNote} onChange={event => setResolutionNote(event.target.value)} disabled={Boolean(resolvingRequestId)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-[#085587] disabled:opacity-60" />
            <p className="text-xs text-slate-500">The employee can see this note with the decision in their leave history.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
            <button type="button" disabled={Boolean(resolvingRequestId)} onClick={() => { setRejectingRequest(null); setResolutionNote(''); }}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm disabled:opacity-50">Cancel</button>
            <button type="button" disabled={Boolean(resolvingRequestId)} onClick={() => void resolveRequest(String(rejectingRequest.id), 'rejected', resolutionNote)}
              className="min-h-11 rounded-lg bg-rose-700 px-4 text-sm font-medium text-white disabled:opacity-50">{resolvingRequestId ? 'Saving…' : 'Reject request'}</button>
          </div>
        </div>
      </div>}
      <section aria-labelledby="organization-holidays-heading" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4"><h3 id="organization-holidays-heading" className="font-semibold text-slate-900">Organization holidays</h3>
          <p className="mt-1 text-xs text-slate-500">Holiday dates returned by this organization’s leave service</p></div>
        {!visibleData.holidays.length ? <p className="p-5 text-sm text-slate-600">No holidays were returned for this organization.</p> :
          <div className="overflow-x-auto" role="region" aria-label="Organization holidays" tabIndex={0}>
            <table className="w-full min-w-[520px] text-left text-sm" aria-label="Organization holidays">
              <thead className="bg-[#eff7f8] text-xs text-slate-600"><tr>
                {['Holiday', 'From', 'To', 'Status'].map(label => <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">{visibleData.holidays.map((holiday, index) => <tr key={String(holiday.id || index)}>
                <td className="px-3 py-3 font-medium">{display(holiday.name)}</td><td className="px-3 py-3">{display(holiday.start_date)}</td>
                <td className="px-3 py-3">{display(holiday.end_date)}</td><td className="px-3 py-3">{holiday.active === false ? 'Inactive' : 'Active'}</td>
              </tr>)}</tbody>
            </table>
          </div>}
      </section>
    </>}
  </section>;
}

function PersonalLeaveRequests({
  tenantId, userId, leave, onRefresh, compact = false, showBalances = true, showHistory = true, locale = 'en',
}: {
  tenantId: string;
  userId: string;
  leave: Record<string, unknown>;
  onRefresh: () => Promise<void>;
  compact?: boolean;
  showBalances?: boolean;
  showHistory?: boolean;
  locale?: Locale;
}) {
  const tx = (source: string) => projectText(locale, source);
  const txf = (source: string, values: Record<string, string | number>) => localizedProjectText(locale, source, values);
  const employeeDate = (value: unknown) => localizedEmployeeDate(value, locale);
  const noticeDate = (value: string) => locale === 'bn' ? employeeDate(value) : value;
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
  const evidenceInputRef = useRef<HTMLInputElement>(null);
  const requestButtonRef = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);
  const leaveTypes = asRows(leave.leave_types);
  const balances = asRows(leave.balances);
  const requests = asRows(leave.requests);
  const selectedLeaveType = leaveTypes.find(item => item.id === leaveTypeId);
  const noticeDays = selectedLeaveType?.min_days_notice == null ? null : Number(selectedLeaveType.min_days_notice);
  const earliestStartDate = noticeDays != null && Number.isInteger(noticeDays) && noticeDays >= 0
    ? addIsoDateDays(String(leave.dashboard_date || ''), noticeDays)
    : '';

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
    if (!selected) { setFormError(tx('Choose a leave type.')); return; }
    if (fromDate > toDate) { setFormError(tx('The end date must be on or after the start date.')); return; }
    if (earliestStartDate && fromDate < earliestStartDate) {
      setFormError(txf('Choose a start date on or after {date} to meet the {days}-day advance notice.', { date: noticeDate(earliestStartDate), days: localizedEmployeeNumber(noticeDays, locale) }));
      return;
    }
    if (dayPortion !== 'full' && fromDate !== toDate) {
      setFormError(tx('A half-day request must use one date.')); return;
    }
    if (selected.requires_document_proof === true && !evidence) {
      setFormError(tx('Upload supporting evidence for this leave type.')); return;
    }
    const allowedMimeTypes = new Set([
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg', 'image/png',
    ]);
    if (evidence && (!allowedMimeTypes.has(evidence.type) || evidence.size > 10 * 1024 * 1024)) {
      setFormError(tx('Use a PDF, Word document, JPG, or PNG up to 10 MB.')); return;
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
      if (!data) throw new Error(tx('The leave request was not confirmed. Refresh and check your request history.'));
      setSuccess(tx('Leave request submitted. You can follow its status in your history.'));
      if (evidenceInputRef.current) evidenceInputRef.current.value = '';
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
      const message = tx(cause instanceof Error ? cause.message : 'Unable to submit this leave request.');
      setFormError(cleanupFailed
        ? `${message} ${tx('The private evidence upload could not be removed; please contact HRIS support.')}`
        : message);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return <>
    <section className={`space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${compact ? 'xl:p-4' : 'sm:p-5'}`} aria-labelledby="personal-leave-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 id="personal-leave-heading" className="text-lg font-semibold text-[#49454F]">{tx(compact ? 'Request time off' : 'My leave')}</h3>
          <p className="mt-1 text-sm text-slate-600">{tx(compact ? 'Submit a request for an authorized leave type' : 'Current-year balances and your request history')}</p></div>
        <button ref={requestButtonRef} type="button" disabled={!leaveTypes.length} onClick={() => { setFormError(''); setRequestOpen(true); }}
          className="min-h-11 rounded-lg bg-[#08558B] px-5 text-sm font-medium text-white shadow-[0_3px_0_#02395c] disabled:cursor-not-allowed disabled:opacity-50">
          {tx('Request for leave')}
        </button>
      </div>
      {success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
      {showBalances && balances.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6">
        {balances.map((item, index) => <div key={String(item.leave_type_id || index)} className="rounded-md border border-slate-200 p-3">
          <p className="truncate text-sm font-semibold text-[#49454F]">{display(item.leave_type_name)}</p>
          <p className="mt-1 text-sm text-slate-700">{localizedEmployeeNumber(item.available_days, locale)} {tx('days available')}</p>
        </div>)}
      </div>}
      {showHistory && <div>
        <h4 id="personal-leave-history-heading" className="mb-2 font-medium text-slate-800">{tx('Leave request history')}</h4>
        {!requests.length ? <p className="rounded-lg bg-[#EFF7F8] p-4 text-sm text-slate-600">{tx('No leave requests yet.')}</p> :
          <div role="region" aria-label={tx('Leave request history table')} tabIndex={0}
            className="overflow-x-auto rounded-lg border border-slate-200 focus-visible:outline-2 focus-visible:outline-[#08558B]">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-[#EFF7F8] text-xs text-slate-600"><tr>
                {['Leave type', 'From', 'To', 'Days', 'Reason', 'Status'].map(label => <th key={label} scope="col" className="px-3 py-3 font-medium">{tx(label)}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">{requests.map((item, index) => <tr key={String(item.id || index)}>
                <td className="px-3 py-3">{display(item.leave_type_name)}</td>
                <td className="px-3 py-3">{employeeDate(item.from_date)}</td>
                <td className="px-3 py-3">{employeeDate(item.to_date)}</td>
                <td className="px-3 py-3">{localizedEmployeeNumber(item.requested_days, locale)}</td>
                <td className="max-w-48 px-3 py-3" title={String(item.reason || '')}>
                  <span className="block truncate">{display(item.reason)}</span>
                  {Boolean(item.resolution_note) && <span className="block truncate text-xs text-slate-500">{display(item.resolution_note)}</span>}
                </td>
                <td className="px-3 py-3 font-medium">{tx(display(item.status))}</td>
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
          <h2 id="request-leave-title" className="text-lg font-semibold text-slate-950">{tx('Request for leave')}</h2>
          <button type="button" onClick={() => setRequestOpen(false)} disabled={submitting} className="min-h-11 min-w-11 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-50" aria-label={tx('Close leave request')}>
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
            <div><label htmlFor="personal-leave-type" className="mb-1 block text-sm font-medium text-slate-700">{tx('Leave type')} <span aria-hidden="true">*</span></label>
              <select id="personal-leave-type" required value={leaveTypeId} onChange={event => setLeaveTypeId(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                <option value="">{tx('Choose a leave type')}</option>{leaveTypes.map(item => <option key={String(item.id)} value={String(item.id)}>{display(item.name)}</option>)}
              </select>
              {selectedLeaveType?.min_days_notice != null && Number(selectedLeaveType.min_days_notice) > 0 &&
                <p className="mt-1 text-xs text-slate-600">{txf('This leave type requires {days} days’ advance notice', { days: localizedEmployeeNumber(selectedLeaveType.min_days_notice, locale) })}{earliestStartDate ? ` · ${txf('Earliest start date: {date}', { date: noticeDate(earliestStartDate) })}` : ''}.</p>}
              {selectedLeaveType?.requires_document_proof === true && <p className="mt-1 text-xs text-slate-600">{tx('Supporting evidence is required for this leave type.')}</p>}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label htmlFor="personal-leave-from" className="mb-1 block text-sm font-medium text-slate-700">{tx('From date')} <span aria-hidden="true">*</span></label>
                <input id="personal-leave-from" type="date" required min={earliestStartDate || undefined} value={fromDate} onChange={event => setFromDate(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
              <div><label htmlFor="personal-leave-to" className="mb-1 block text-sm font-medium text-slate-700">{tx('To date')} <span aria-hidden="true">*</span></label>
                <input id="personal-leave-to" type="date" required min={fromDate || undefined} value={toDate} onChange={event => setToDate(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
            </div>
            <div><label htmlFor="personal-leave-portion" className="mb-1 block text-sm font-medium text-slate-700">{tx('Day portion')}</label>
              <select id="personal-leave-portion" value={dayPortion} onChange={event => setDayPortion(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                <option value="full">{tx('Full day')}</option><option value="first_half">{tx('First half')}</option><option value="second_half">{tx('Second half')}</option>
              </select>
              {dayPortion !== 'full' && <p className="mt-1 text-xs text-slate-600">{tx('Half-day leave can be requested for one date only.')}</p>}
            </div>
            <div><label htmlFor="personal-leave-reason" className="mb-1 block text-sm font-medium text-slate-700">{tx('Reason')} <span aria-hidden="true">*</span></label>
              <textarea id="personal-leave-reason" required rows={3} value={reason} onChange={event => setReason(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
            <div><label htmlFor="personal-leave-evidence" className="mb-1 block text-sm font-medium text-slate-700">{tx('Supporting evidence')} {selectedLeaveType?.requires_document_proof === true ? <span aria-hidden="true">*</span> : <span className="text-slate-500">{tx('(optional)')}</span>}</label>
              <input ref={evidenceInputRef} id="personal-leave-evidence" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" required={selectedLeaveType?.requires_document_proof === true}
                onChange={event => setEvidence(event.target.files?.[0] || null)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <p className="mt-1 text-xs text-slate-600">{tx('PDF, Word, JPG, or PNG up to 10 MB. Evidence is private to you and authorized leave managers in this organization.')}</p>
            </div>
            {formError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{formError}</p>}
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
            <button type="button" disabled={submitting} onClick={() => setRequestOpen(false)} className="min-h-11 rounded-lg px-4 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50">{tx('Cancel')}</button>
            <button type="submit" disabled={submitting || !leaveTypes.length} className="min-h-11 rounded-lg bg-[#08558B] px-5 text-sm font-medium text-white disabled:opacity-50">
              {submitting ? tx('Sending…') : tx('Send request')}
            </button>
          </div>
        </form>
      </div>
    </div>}
  </>;
}

function EmployeePersonalLeave({ tenantId, userId, tenantName, focusRequestId, onFocusHandled }: {
  tenantId: string; userId: string; tenantName: string;
  focusRequestId: string | null; onFocusHandled: (requestId: string) => void;
}) {
  const [leave, setLeave] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [evidenceError, setEvidenceError] = useState('');
  const [evidenceMessage, setEvidenceMessage] = useState('');
  const [downloadingEvidenceId, setDownloadingEvidenceId] = useState('');
  const [historyYear, setHistoryYear] = useState('');
  const requestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  activeTenantId.current = tenantId;

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
    setEvidenceError('');
    setEvidenceMessage('');
    setDownloadingEvidenceId('');
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
  const yearListKey = years.join(',');
  const selectedYear = years.includes(historyYear) ? historyYear : defaultYear;
  const focusedRequest = requests.find(row => String(row.id || '') === focusRequestId);
  useEffect(() => {
    if (!focusRequestId || loading || !leave) return;
    const requestYear = String(focusedRequest?.from_date || '').slice(0, 4);
    if (years.includes(requestYear) && selectedYear !== requestYear) {
      setHistoryYear(requestYear);
      return;
    }
    const row = Array.from(document.querySelectorAll<HTMLElement>('[data-leave-request-id]'))
      .find(candidate => candidate.dataset.leaveRequestId === focusRequestId);
    if (!row) {
      onFocusHandled(focusRequestId);
      return;
    }
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.focus({ preventScroll: true });
    onFocusHandled(focusRequestId);
  }, [focusRequestId, focusedRequest?.from_date, loading, leave, onFocusHandled, selectedYear, yearListKey]);
  const yearNumber = Number(selectedYear);
  const history = requests.filter(row => {
    const first = Number(String(row.from_date || '').slice(0, 4));
    const last = Number(String(row.to_date || '').slice(0, 4));
    return Number.isInteger(first) && Number.isInteger(last) && first <= yearNumber && last >= yearNumber;
  });
  const historyHasEvidence = history.some(row => String(row.attachment_url || '').trim());

  async function downloadHistoryEvidence(row: Record<string, unknown>) {
    const id = String(row.id || '');
    const objectPath = String(row.attachment_url || '').trim();
    const parts = objectPath.split('/');
    const extension = parts.at(-1)?.split('.').at(-1)?.toLowerCase() || '';
    if (!id || parts.length !== 3 || parts.some(part => !part || part === '.' || part === '..')
        || parts[0] !== userId || parts[1] !== tenantId
        || !/^[0-9a-f-]{36}\.(pdf|doc|docx|jpg|png)$/i.test(parts[2])) {
      setEvidenceMessage('');
      setEvidenceError('This evidence reference is not valid for your active organization.');
      return;
    }
    if (downloadingEvidenceId) return;
    const actionTenantId = tenantId;
    setDownloadingEvidenceId(id);
    setEvidenceError('');
    setEvidenceMessage('');
    try {
      // The signed-in Storage client enforces the existing private bucket owner policy.
      const { data: file, error: storageError } = await supabase.storage.from('leave-evidence').download(objectPath);
      if (storageError) throw storageError;
      if (!file) throw new Error('The evidence file was not returned.');
      if (activeTenantId.current !== actionTenantId) return;
      const objectUrl = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `personal-leave-evidence-${id.slice(0, 8)}.${extension}`;
      anchor.rel = 'noopener';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      setEvidenceMessage('Evidence downloaded.');
    } catch (cause) {
      if (activeTenantId.current === actionTenantId) {
        setEvidenceError(cause instanceof Error ? cause.message : 'Unable to download your private evidence.');
      }
    } finally {
      if (activeTenantId.current === actionTenantId) setDownloadingEvidenceId('');
    }
  }

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
    {evidenceError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{evidenceError}</p>}
    {evidenceMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{evidenceMessage}</p>}
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
          <table aria-label={`Personal leave history for ${selectedYear}`} className={`w-full ${historyHasEvidence ? 'min-w-[860px]' : 'min-w-[720px]'} text-left text-sm`}>
            <thead className="bg-[#EFF7F8] text-xs text-slate-600"><tr>
              {['Applicable from', 'Applicable to', 'No. of days', 'Leave type', 'Remarks', 'Status', ...(historyHasEvidence ? ['Evidence'] : [])].map(label => <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{history.map((row, index) => {
              const status = String(row.status || '').toLowerCase();
              const statusClass = status === 'approved' ? 'text-emerald-700'
                : status === 'rejected' ? 'text-rose-700' : 'text-slate-600';
              return <tr key={String(row.id || index)} data-leave-request-id={String(row.id || '')} tabIndex={-1}
                className="focus:outline focus:outline-2 focus:outline-[#085587]">
                <td className="whitespace-nowrap px-3 py-3">{displayShortDate(row.from_date)}</td>
                <td className="whitespace-nowrap px-3 py-3">{displayShortDate(row.to_date)}</td>
                <td className="px-3 py-3 tabular-nums">{display(row.requested_days)}</td>
                <td className="px-3 py-3">{display(row.leave_type_name)}</td>
                <td className="max-w-56 px-3 py-3"><span className="block truncate" title={String(row.reason || '')}>{display(row.reason)}</span>
                  {Boolean(row.resolution_note) && <span className="block truncate text-xs text-slate-500">{display(row.resolution_note)}</span>}</td>
                <td className={`whitespace-nowrap px-3 py-3 font-semibold capitalize ${statusClass}`}>{display(row.status)}</td>
                {historyHasEvidence && <td className="px-3 py-3">{String(row.attachment_url || '').trim()
                  ? <button type="button" disabled={Boolean(downloadingEvidenceId)}
                      aria-label={`Download evidence for ${display(row.leave_type_name)} leave request`}
                      onClick={() => void downloadHistoryEvidence(row)}
                      className="min-h-10 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 disabled:opacity-50">
                      {downloadingEvidenceId === row.id ? 'Downloading…' : 'Download evidence'}
                    </button> : '—'}</td>}
              </tr>;
            })}</tbody>
          </table>
        </div> : <p className="rounded-lg bg-[#EFF7F8] p-4 text-sm text-slate-600">No leave requests overlap {selectedYear}.</p>}
      </section>
    </>}
  </section>;
}

type TimesheetDraftEntry = { activity_id: string; project_allocation_id: string; work_date: string; hours: string; note: string };

function addLocalDays(value: string, count: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + count);
  return localIsoDate(date);
}

function EmployeeTimesheets({ tenantId, tenantName, locale }: { tenantId: string; tenantName: string; locale: Locale }) {
  const tx = (source: string) => projectText(locale, source);
  const txf = (source: string, values: Record<string, string | number>) => localizedProjectText(locale, source, values);
  const dateText = (value: unknown) => localizedEmployeeDate(value, locale);
  const hoursText = (value: number, minimumFractionDigits = 0) => new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    minimumFractionDigits, maximumFractionDigits: 2,
  }).format(value);
  const failureText = (cause: unknown, fallback: string) => {
    const detail = asObject(cause)?.message;
    const source = cause instanceof Error ? cause.message : typeof detail === 'string' ? detail : '';
    if (!source) return tx(fallback);
    const translated = tx(source);
    return locale === 'bn' && translated === source ? tx(fallback) : translated;
  };
  const [activities, setActivities] = useState<Record<string, unknown>[]>([]);
  const [allocations, setAllocations] = useState<Record<string, unknown>[]>([]);
  const [timesheets, setTimesheets] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<number | null>(null);
  const [editingRejectedProject, setEditingRejectedProject] = useState<{ project_id: string; revision: number } | null>(null);
  const [periodType, setPeriodType] = useState<'daily' | 'weekly'>('weekly');
  const [periodStart, setPeriodStart] = useState(() => startOfRecentWeek());
  const [periodEnd, setPeriodEnd] = useState(() => localIsoDate(new Date()));
  const [entries, setEntries] = useState<TimesheetDraftEntry[]>([]);
  const [formError, setFormError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const loadSequence = useRef(0);
  const activeTenantId = useRef(tenantId);

  async function load(showLoading = true) {
    const sequence = ++loadSequence.current;
    const requestedTenant = tenantId;
    activeTenantId.current = requestedTenant;
    if (showLoading) setLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('hris_get_my_timesheet_context', {
        p_tenant_id: requestedTenant,
      });
      if (rpcError) throw rpcError;
      const context = asObject(data);
      if (!context || !Array.isArray(context.activities) || !Array.isArray(context.allocations) || !Array.isArray(context.timesheets)) {
        throw new Error('Timesheet service returned an invalid response.');
      }
      if (sequence !== loadSequence.current || activeTenantId.current !== requestedTenant) return;
      setActivities(asRows(context.activities));
      setAllocations(asRows(context.allocations));
      setTimesheets(asRows(context.timesheets));
    } catch (cause) {
      if (sequence !== loadSequence.current || activeTenantId.current !== requestedTenant) return;
      setError(failureText(cause, 'Unable to load your timesheets.'));
    } finally {
      if (sequence === loadSequence.current && activeTenantId.current === requestedTenant) setLoading(false);
    }
  }

  useEffect(() => {
    activeTenantId.current = tenantId;
    setActivities([]);
    setAllocations([]);
    setTimesheets([]);
    setEditorOpen(false);
    setError('');
    setSuccess('');
    void load();
    return () => { loadSequence.current += 1; };
  }, [tenantId]);

  function openNewTimesheet() {
    const end = localIsoDate(new Date());
    setEditingId(null);
    setEditingVersion(null);
    setEditingRejectedProject(null);
    setPeriodType('weekly');
    setPeriodStart(addLocalDays(end, -6));
    setPeriodEnd(end);
    setEntries([]);
    setFormError('');
    setSuccess('');
    setEditorOpen(true);
  }

  function editTimesheet(row: Record<string, unknown>) {
    setEditingId(String(row.id));
    setEditingVersion(Number(row.version));
    setEditingRejectedProject(null);
    setPeriodType(row.period_type === 'daily' ? 'daily' : 'weekly');
    setPeriodStart(String(row.period_start || ''));
    setPeriodEnd(String(row.period_end || ''));
    setEntries(asRows(row.entries).map(entry => ({
      activity_id: String(entry.activity_id || ''),
      project_allocation_id: String(entry.project_allocation_id || ''),
      work_date: String(entry.work_date || ''),
      hours: entry.hours === null || entry.hours === undefined ? '' : String(entry.hours),
      note: String(entry.note || ''),
    })));
    setFormError('');
    setSuccess('');
    setEditorOpen(true);
  }

  function editRejectedProject(row: Record<string, unknown>, review: Record<string, unknown>) {
    const projectId = String(review.project_id || '');
    setEditingId(String(row.id));
    setEditingVersion(Number(row.version));
    setEditingRejectedProject({ project_id: projectId, revision: Number(review.revision) });
    setPeriodType(row.period_type === 'daily' ? 'daily' : 'weekly');
    setPeriodStart(String(row.period_start || ''));
    setPeriodEnd(String(row.period_end || ''));
    setEntries(asRows(row.entries).filter(entry => String(entry.project_id || '') === projectId).map(entry => ({
      activity_id: String(entry.activity_id || ''),
      project_allocation_id: String(entry.project_allocation_id || ''),
      work_date: String(entry.work_date || ''),
      hours: entry.hours === null || entry.hours === undefined ? '' : String(entry.hours),
      note: String(entry.note || ''),
    })));
    setFormError(''); setSuccess(''); setEditorOpen(true);
  }

  function changePeriodType(next: 'daily' | 'weekly') {
    setPeriodType(next);
    setPeriodEnd(next === 'daily' ? periodStart : addLocalDays(periodStart, 6));
  }

  function updateEntry(index: number, patch: Partial<TimesheetDraftEntry>) {
    setEntries(current => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry));
  }

  function validateEntries(): { activity_id: string; project_allocation_id: string | null; work_date: string; hours: number; note: string | null }[] | null {
    if (!periodStart || !periodEnd || periodStart > periodEnd) {
      setFormError(tx('The period end date must be on or after its start date.')); return null;
    }
    const spanDays = (Date.parse(`${periodEnd}T00:00:00Z`) - Date.parse(`${periodStart}T00:00:00Z`)) / 86_400_000;
    if (periodType === 'daily' && spanDays !== 0) {
      setFormError(tx('A daily timesheet must use one date.')); return null;
    }
    if (periodType === 'weekly' && (spanDays < 0 || spanDays > 6)) {
      setFormError(tx('A weekly timesheet can cover up to seven consecutive dates.')); return null;
    }
    if (entries.some(entry => !entry.activity_id || !entry.work_date || !entry.hours.trim())) {
      setFormError(tx('Complete the activity, work date, and hours for each entry.')); return null;
    }
    if (entries.some(entry => activities.find(activity => String(activity.id) === entry.activity_id)?.activity_type === 'project' && !entry.project_allocation_id)) {
      setFormError(tx('Choose a project allocation for each project entry.')); return null;
    }
    if (entries.some(entry => {
      const activity = activities.find(item => String(item.id) === entry.activity_id);
      if (activity?.activity_type !== 'project') return false;
      const allocation = allocations.find(item => String(item.id) === entry.project_allocation_id);
      return !allocation || String(allocation.assigned_date || '') > entry.work_date
        || Boolean(allocation.release_date && String(allocation.release_date) < entry.work_date);
    })) {
      setFormError(tx('Choose an allocation that covers this employee and work date.')); return null;
    }
    const normalized = entries.map(entry => ({
      activity_id: entry.activity_id,
      project_allocation_id: entry.project_allocation_id || null,
      work_date: entry.work_date,
      hours: Number(entry.hours),
      note: entry.note.trim() || null,
    }));
    if (normalized.some(entry => !Number.isFinite(entry.hours) || entry.hours <= 0 || entry.hours > 24)) {
      setFormError(tx('Enter hours greater than zero and no more than 24 per entry.')); return null;
    }
    if (normalized.some(entry => entry.work_date < periodStart || entry.work_date > periodEnd)) {
      setFormError(tx('Each work date must fall inside the selected period.')); return null;
    }
    const totals = new Map<string, number>();
    normalized.forEach(entry => totals.set(entry.work_date, (totals.get(entry.work_date) || 0) + entry.hours));
    if (Array.from(totals.values()).some(total => total > 24)) {
      setFormError(tx('A day cannot contain more than 24 total hours.')); return null;
    }
    setFormError('');
    return normalized;
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionBusy) return;
    const normalized = validateEntries();
    if (!normalized) return;
    setActionBusy(true); setFormError(''); setError(''); setSuccess('');
    try {
      const { data, error: rpcError } = editingRejectedProject
        ? await supabase.rpc('hris_resubmit_rejected_project_timesheet', {
          p_tenant_id: tenantId, p_timesheet_id: editingId, p_project_id: editingRejectedProject.project_id,
          p_expected_revision: editingRejectedProject.revision, p_entries: normalized,
        })
        : await supabase.rpc('hris_save_my_timesheet', {
          p_tenant_id: tenantId, p_id: editingId, p_period_type: periodType,
          p_start: periodStart, p_end: periodEnd, p_entries: normalized,
          p_expected_version: editingVersion,
        });
      if (rpcError) throw rpcError;
      if (!data) throw new Error('The draft was not confirmed. Refresh your timesheet list and try again.');
      setEditorOpen(false);
      setEditingId(null);
      await load(false);
      setSuccess(tx(editingRejectedProject ? 'Project hours corrected and resubmitted.' : 'Timesheet draft saved.'));
    } catch (cause) {
      setFormError(failureText(cause, 'Unable to save this timesheet.'));
    } finally {
      setActionBusy(false);
    }
  }

  async function submitTimesheet(id: string) {
    if (actionBusy) return;
    setActionBusy(true); setError(''); setSuccess('');
    try {
      const { data, error: rpcError } = await supabase.rpc('hris_submit_my_timesheet', {
        p_tenant_id: tenantId, p_id: id,
      });
      if (rpcError) throw rpcError;
      if (!data) throw new Error('Submission was not confirmed. Refresh and check the timesheet status.');
      await load(false);
      setSuccess(tx('Timesheet submitted for review.'));
    } catch (cause) {
      setError(failureText(cause, 'Unable to submit this timesheet.'));
    } finally {
      setActionBusy(false);
    }
  }

  function totalHours(row: Record<string, unknown>): number {
    return asRows(row.entries).reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);
  }

  const entryDailyTotals = Array.from(entries.reduce((totals, entry) => {
    const hours = Number(entry.hours);
    if (entry.work_date && Number.isFinite(hours) && hours > 0) {
      totals.set(entry.work_date, (totals.get(entry.work_date) || 0) + hours);
    }
    return totals;
  }, new Map<string, number>())).sort(([left], [right]) => left.localeCompare(right));
  const currentTenantDataReady = !loading && !error;
  return <section aria-labelledby="my-timesheets-heading" className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="my-timesheets-heading" className="text-2xl font-medium text-[#49454F]">{tx('My timesheets')}</h2>
        <p className="mt-1 text-sm text-slate-500">{txf('Record and submit your work hours for {organization}', { organization: tenantName })}</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={loading || actionBusy} onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
          <RefreshCw className="h-4 w-4" /> {tx('Refresh')}
        </button>
        <button type="button" disabled={loading || actionBusy || activities.length === 0} onClick={openNewTimesheet} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white shadow-[0_3px_0_#02395c] disabled:opacity-50">
          <ClipboardList className="h-4 w-4" /> {tx('New timesheet')}
        </button>
      </div>
    </div>
    {error && <StatusMessage error={error} retryLabel={tx('Retry')} onRetry={() => void load()} />}
    {success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</p>}
    {loading && <p role="status" className="rounded-lg border border-slate-200 bg-white p-5 text-sm">{tx('Loading your timesheets…')}</p>}
    {currentTenantDataReady && <>
      {activities.length === 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{tx('Your organization has no active timesheet activities yet. Ask an administrator to configure them before recording hours.')}</p>}
      {editorOpen && <section aria-labelledby="timesheet-editor-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div><h3 id="timesheet-editor-heading" className="font-semibold text-[#08263D]">{tx(editingRejectedProject ? 'Correct rejected project hours' : editingId ? 'Edit timesheet draft' : 'New timesheet draft')}</h3>
            <p className="mt-1 text-xs text-slate-500">{tx(editingRejectedProject ? 'Only this rejected project portion will be changed; other project decisions remain unchanged.' : 'Drafts can be changed until they are submitted.')}</p></div>
          <button type="button" disabled={actionBusy} onClick={() => { setEditorOpen(false); setFormError(''); }} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50">{tx('Cancel')}</button>
        </div>
        <form onSubmit={event => void saveDraft(event)} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label htmlFor="timesheet-period-type" className="mb-1 block text-xs font-medium text-slate-600">{tx('Period type')}</label>
              <select id="timesheet-period-type" disabled={Boolean(editingRejectedProject)} value={periodType} onChange={event => changePeriodType(event.target.value === 'daily' ? 'daily' : 'weekly')} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                <option value="weekly">{tx('Weekly')}</option><option value="daily">{tx('Daily')}</option>
              </select></div>
            <div><label htmlFor="timesheet-period-start" className="mb-1 block text-xs font-medium text-slate-600">{tx('Period start')}</label>
              <input id="timesheet-period-start" type="date" required disabled={Boolean(editingRejectedProject)} value={periodStart} onChange={event => { setPeriodStart(event.target.value); if (periodType === 'daily') setPeriodEnd(event.target.value); }} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm disabled:bg-slate-100" /></div>
            <div><label htmlFor="timesheet-period-end" className="mb-1 block text-xs font-medium text-slate-600">{tx('Period end')}</label>
              <input id="timesheet-period-end" type="date" required disabled={Boolean(editingRejectedProject)} value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm disabled:bg-slate-100" /></div>
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-800">{tx('Work entries')}</h4>
              <button type="button" disabled={actionBusy} onClick={() => setEntries(current => [...current, { activity_id: '', project_allocation_id: '', work_date: periodStart, hours: '', note: '' }])} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50">{tx('Add entry')}</button>
            </div>
            {entries.length === 0 ? <p className="rounded-lg bg-[#EFF7F8] p-4 text-sm text-slate-600">{tx('No work entries yet. You can save an empty draft and add entries later.')}</p> : entries.map((entry, index) => <div key={index} className="grid min-w-0 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1.4fr)_minmax(160px,1fr)_minmax(140px,0.8fr)_minmax(90px,0.5fr)_minmax(160px,1.2fr)_auto]">
              <div className="min-w-0"><label htmlFor={`timesheet-activity-${index}`} className="mb-1 block text-xs font-medium text-slate-600">{tx('Activity')}</label>
                <select id={`timesheet-activity-${index}`} value={entry.activity_id} onChange={event => updateEntry(index, { activity_id: event.target.value })} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                  <option value="">{tx('Choose activity')}</option>{activities.map((activity, activityIndex) => <option key={String(activity.id || activityIndex)} value={String(activity.id || '')}>{display(activity.name)} · {display(activity.code)}</option>)}
                </select></div>
              <div className="min-w-0"><label htmlFor={`timesheet-allocation-${index}`} className="mb-1 block text-xs font-medium text-slate-600">{tx(activities.find(activity => String(activity.id) === entry.activity_id)?.activity_type === 'project' ? 'Project allocation (required)' : 'Project allocation (optional)')}</label>
                <select id={`timesheet-allocation-${index}`} value={entry.project_allocation_id} onChange={event => updateEntry(index, { project_allocation_id: event.target.value })} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                  <option value="">{tx('No project allocation')}</option>{allocations.map((allocation, allocationIndex) => <option key={String(allocation.id || allocationIndex)} value={String(allocation.id || '')}>{display(allocation.project_name)} · {display(allocation.project_code)} ({dateText(allocation.assigned_date)}{allocation.release_date ? `–${dateText(allocation.release_date)}` : ''})</option>)}
                </select></div>
              <div><label htmlFor={`timesheet-date-${index}`} className="mb-1 block text-xs font-medium text-slate-600">{tx('Work date')}</label>
                <input id={`timesheet-date-${index}`} type="date" value={entry.work_date} onChange={event => updateEntry(index, { work_date: event.target.value })} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
              <div><label htmlFor={`timesheet-hours-${index}`} className="mb-1 block text-xs font-medium text-slate-600">{tx('Hours')}</label>
                <input id={`timesheet-hours-${index}`} type="number" min="0.01" max="24" step="0.01" value={entry.hours} onChange={event => updateEntry(index, { hours: event.target.value })} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
              <div><label htmlFor={`timesheet-note-${index}`} className="mb-1 block text-xs font-medium text-slate-600">{tx('Note (optional)')}</label>
                <input id={`timesheet-note-${index}`} type="text" maxLength={1000} value={entry.note} onChange={event => updateEntry(index, { note: event.target.value })} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
              <div className="flex items-end"><button type="button" disabled={actionBusy} onClick={() => setEntries(current => current.filter((_, entryIndex) => entryIndex !== index))} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-rose-700 disabled:opacity-50 sm:w-auto">{tx('Remove')}</button></div>
            </div>)}
            {entryDailyTotals.length > 0 && <div aria-live="polite" aria-atomic="false" className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h5 className="text-sm font-semibold text-slate-800">{tx('Daily totals')}</h5>
              <ul className="mt-2 space-y-1 text-sm">{entryDailyTotals.map(([date, hours]) => <li key={date} aria-label={txf('{date} total {hours} hours, maximum 24', { date: dateText(date), hours: hoursText(hours, 2) })} className="flex flex-wrap items-center justify-between gap-2">
                <span>{dateText(date)}</span>
                <span className={hours > 24 ? 'font-medium text-rose-700' : 'tabular-nums text-slate-700'}>{txf('{hours} / 24 hours', { hours: hoursText(hours, 2) })}{hours > 24 ? ` · ${tx('Over daily limit')}` : ''}</span>
              </li>)}</ul>
            </div>}
          </div>
          {formError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{formError}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
            <button type="button" disabled={actionBusy} onClick={() => setEditorOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm disabled:opacity-50">{tx('Cancel')}</button>
            <button type="submit" disabled={actionBusy} className="min-h-11 rounded-lg bg-[#08558B] px-5 text-sm font-medium text-white shadow-[0_3px_0_#02395c] disabled:opacity-50">{actionBusy ? tx('Saving…') : tx(editingRejectedProject ? 'Save and resubmit project hours' : 'Save draft')}</button>
          </div>
        </form>
      </section>}
      <section aria-labelledby="timesheet-history-heading" className="space-y-3">
        <div><h3 id="timesheet-history-heading" className="font-semibold text-[#08263D]">{tx('Timesheet history')}</h3>
          <p className="mt-1 text-xs text-slate-500">{tx('Only timesheets linked to your employee profile are shown.')}</p></div>
        {timesheets.length === 0 ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{tx('No timesheets have been saved for this organization.')}</p> : timesheets.map((row, index) => {
          const status = String(row.status || 'draft').toLowerCase();
          const rowEntries = asRows(row.entries);
          const statusStyle = status === 'approved' ? 'bg-emerald-50 text-emerald-800'
            : status === 'rejected' ? 'bg-rose-50 text-rose-800'
              : status === 'submitted' ? 'bg-blue-50 text-blue-800' : 'bg-slate-100 text-slate-700';
          const statusLabel = tx(status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected'
            : status === 'submitted' ? 'Submitted' : 'Draft');
          const timesheetId = String(row.id || index);
          const projectReviews = asRows(row.project_reviews);
          const hasUnlinkedEntries = rowEntries.some(entry => !entry.project_allocation_id);
          return <article key={timesheetId} data-timesheet-id={timesheetId} aria-label={txf('Timesheet {start} to {end}', { start: dateText(row.period_start), end: dateText(row.period_end) })} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold text-slate-900">{tx(row.period_type === 'daily' ? 'Daily' : 'Weekly')} {tx('Period')} · {dateText(row.period_start)} – {dateText(row.period_end)}</h4>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyle}`}>{statusLabel}</span></div>
                <p className="mt-1 text-sm text-slate-600">{txf('{hours} total hours · {count} {entries}', { hours: hoursText(totalHours(row)), count: localizedEmployeeNumber(rowEntries.length, locale), entries: tx(rowEntries.length === 1 ? 'entry' : 'entries') })}</p>
                {Boolean(row.resolution_note) && <p className="mt-2 text-sm text-slate-600">{tx('Reviewer note:')} {display(row.resolution_note)}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {status === 'draft' && <button type="button" disabled={actionBusy} onClick={() => editTimesheet(row)} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50">{tx('Edit draft')}</button>}
                {status === 'draft' && <button type="button" disabled={actionBusy || rowEntries.length === 0} onClick={() => void submitTimesheet(timesheetId)} className="min-h-11 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50">{actionBusy ? tx('Submitting…') : tx('Submit timesheet')}</button>}
              </div>
            </div>
            {projectReviews.length > 0 && <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
              <h5 className="text-sm font-semibold text-slate-800">{tx('Project review status')}</h5>
              {projectReviews.map((review, reviewIndex) => {
                const reviewStatus = String(review.status || 'pending');
                return <div key={`${String(review.project_id)}-${reviewIndex}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#EFF7F8] p-3 text-sm">
                  <div className="min-w-0"><span className="font-medium text-slate-800">{display(review.project_name)}</span>
                    <span className="ml-2 capitalize text-slate-600">{tx(reviewStatus === 'pending' ? 'Feedback pending' : reviewStatus === 'approved' ? 'Approved' : 'Rejected')}</span>
                    {reviewStatus === 'rejected' && Boolean(review.rejection_reason) && <p className="mt-1 break-words text-rose-800">{tx('Rejection reason:')} {display(review.rejection_reason)}</p>}
                  </div>
                  {status === 'rejected' && reviewStatus === 'rejected' && <button type="button" disabled={actionBusy} onClick={() => editRejectedProject(row, review)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">{tx('Correct this project portion')}</button>}
                </div>;
              })}
            </div>}
            {status === 'rejected' && projectReviews.length === 0 && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{tx('This historical timesheet has no project review link, so it is preserved without guessing which project should be corrected.')}</p>}
            {status === 'submitted' && hasUnlinkedEntries && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{tx('Unlinked hours remain submitted because no project reviewer is assigned to non-project work.')}</p>}
            {rowEntries.length > 0 && <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
              {rowEntries.map((entry, entryIndex) => <div key={String(entry.id || entryIndex)} className="grid min-w-0 gap-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4">
                <p className="min-w-0 break-words font-medium text-slate-800">{display(entry.activity_name)}{entry.activity_code ? ` · ${String(entry.activity_code)}` : ''}{entry.project_name ? ` · ${display(entry.project_name)}` : ''}</p>
                <p className="text-slate-600">{dateText(entry.work_date)}</p><p className="tabular-nums text-slate-700">{hoursText(Number(entry.hours))} {tx('hr')}</p>
                {Boolean(entry.note) && <p className="text-xs text-slate-500 sm:col-span-3">{display(entry.note)}</p>}
              </div>)}
            </div>}
          </article>;
        })}
      </section>
    </>}
  </section>;
}

function ProjectTimesheetReviewQueue({ tenantId, locale }: { tenantId: string; locale: Locale }) {
  const tx = (source: string) => projectText(locale, source);
  const txf = (source: string, values: Record<string, string | number>) => localizedProjectText(locale, source, values);
  const [reviews, setReviews] = useState<Record<string, unknown>[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const dateText = (value: unknown) => localizedEmployeeDate(value, locale);
  const hoursText = (value: unknown) => new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-US', { maximumFractionDigits: 2 }).format(Number(value) || 0);

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('hris_get_my_project_timesheet_reviews', { p_tenant_id: tenantId });
      if (rpcError) throw rpcError;
      const result = asObject(data);
      if (!result || !Array.isArray(result.reviews)) throw new Error('Timesheet review service returned an invalid response.');
      setCanReview(result.can_review === true);
      setReviews(asRows(result.reviews));
    } catch (cause) {
      const detail = asObject(cause)?.message;
      const source = cause instanceof Error ? cause.message : typeof detail === 'string' ? detail : '';
      const translated = source ? tx(source) : '';
      setError(locale === 'bn' && translated === source ? tx('Unable to load project timesheet reviews.') : translated || tx('Unable to load project timesheet reviews.'));
    } finally { setLoading(false); }
  }

  useEffect(() => { setReviews([]); setReasons({}); setSuccess(''); setCanReview(false); void load(); }, [tenantId]);

  async function decide(review: Record<string, unknown>, decision: 'approved' | 'rejected') {
    const key = `${String(review.timesheet_id)}:${String(review.project_id)}`;
    if (busyKey) return;
    const reason = (reasons[key] || '').trim();
    if (decision === 'rejected' && !reason) { setError(tx('A rejection reason is required.')); return; }
    setBusyKey(key); setError(''); setSuccess('');
    try {
      const { data, error: rpcError } = await supabase.rpc('hris_resolve_project_timesheet', {
        p_tenant_id: tenantId, p_timesheet_id: review.timesheet_id, p_project_id: review.project_id,
        p_expected_revision: review.revision, p_decision: decision, p_reason: decision === 'rejected' ? reason : null,
      });
      if (rpcError) throw rpcError;
      if (!data) throw new Error('The project review was not confirmed. Refresh and check its status.');
      await load(false);
      setSuccess(tx(decision === 'approved' ? 'Project hours approved.' : 'Project hours rejected with a reason.'));
      setReasons(current => ({ ...current, [key]: '' }));
    } catch (cause) {
      const detail = asObject(cause)?.message;
      const source = cause instanceof Error ? cause.message : typeof detail === 'string' ? detail : '';
      const translated = source ? tx(source) : '';
      setError(locale === 'bn' && translated === source ? tx('Unable to save the project review. Refresh and try again.') : translated || tx('Unable to save the project review. Refresh and try again.'));
    } finally { setBusyKey(''); }
  }

  if (!loading && !error && !canReview) return null;
  return <section aria-labelledby="project-timesheet-reviews-heading" className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="project-timesheet-reviews-heading" className="text-xl font-semibold text-[#08263D]">{tx('Project timesheet reviews')}</h2>
        <p className="mt-1 text-sm text-slate-500">{tx('Review only the hours for projects assigned to you as Project Manager.')}</p></div>
      <button type="button" disabled={loading || Boolean(busyKey)} onClick={() => void load()} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50"><RefreshCw className="mr-2 inline h-4 w-4" />{tx('Refresh')}</button>
    </div>
    {success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
    {error && <StatusMessage error={error} retryLabel={tx('Retry')} onRetry={() => void load()} />}
    {loading ? <p role="status" className="rounded-lg bg-[#EFF7F8] p-4 text-sm">{tx('Loading project reviews…')}</p>
      : reviews.length === 0 ? <p role="status" className="rounded-lg bg-[#EFF7F8] p-4 text-sm text-slate-600">{tx('No timesheet portions are assigned to your projects yet.')}</p>
        : <div className="space-y-3">{reviews.map((review, index) => {
          const key = `${String(review.timesheet_id)}:${String(review.project_id)}`;
          const status = String(review.status || 'pending');
          const entries = asRows(review.entries);
          return <article key={key || index} className="rounded-lg border border-slate-200 p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h3 className="font-semibold text-slate-900">{display(review.project_name)}</h3>
                <p className="mt-1 text-sm text-slate-600">{display(review.employee_name)} · {dateText(review.period_start)} – {dateText(review.period_end)}</p></div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status === 'pending' ? 'bg-amber-50 text-amber-800' : status === 'approved' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{tx(status === 'pending' ? 'Feedback pending' : status === 'approved' ? 'Approved' : 'Rejected')}</span>
            </div>
            <div className="mt-3 divide-y divide-slate-100 rounded-lg bg-[#EFF7F8] px-3">{entries.map((entry, entryIndex) => <div key={String(entry.id || entryIndex)} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0 break-words font-medium text-slate-800">{display(entry.activity_name)}{entry.activity_code ? ` · ${String(entry.activity_code)}` : ''} · {dateText(entry.work_date)}</span>
              <span className="tabular-nums text-slate-700">{txf('{hours} hr', { hours: hoursText(entry.hours) })}</span>
              {Boolean(entry.note) && <p className="basis-full break-words text-xs text-slate-500">{display(entry.note)}</p>}
            </div>)}</div>
            {status === 'rejected' && Boolean(review.rejection_reason) && <p className="mt-3 break-words text-sm text-rose-800">{tx('Rejection reason:')} {display(review.rejection_reason)}</p>}
            {status === 'pending' && <div className="mt-3 space-y-2">
              <label htmlFor={`timesheet-review-reason-${index}`} className="block text-xs font-medium text-slate-600">{tx('Rejection reason (required when rejecting)')}</label>
              <textarea id={`timesheet-review-reason-${index}`} maxLength={1000} rows={2} value={reasons[key] || ''} onChange={event => setReasons(current => ({ ...current, [key]: event.target.value }))} className="w-full rounded-lg border border-slate-300 p-3 text-sm" />
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" disabled={Boolean(busyKey)} onClick={() => void decide(review, 'rejected')} className="min-h-11 rounded-lg border border-rose-300 px-4 text-sm text-rose-800 disabled:opacity-50">{busyKey === key ? tx('Saving…') : tx('Reject project hours')}</button>
                <button type="button" disabled={Boolean(busyKey)} onClick={() => void decide(review, 'approved')} className="min-h-11 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50">{busyKey === key ? tx('Saving…') : tx('Approve project hours')}</button>
              </div>
            </div>}
          </article>;
        })}</div>}
  </section>;
}

type EmployeePanelId = 'working-hours' | 'work-location' | 'leave-type' | 'check-in-times';

function PersonalAttendanceCorrections({
  tenantId, today, corrections, onRefresh, locale,
}: {
  tenantId: string;
  today: string;
  corrections: AttendanceRecord[];
  onRefresh: () => Promise<void>;
  locale: Locale;
}) {
  const tx = (source: string) => projectText(locale, source);
  const txf = (source: string, values: Record<string, string | number>) => localizedProjectText(locale, source, values);
  const employeeDate = (value: unknown) => localizedEmployeeDate(value, locale);
  const employeeTime = (value: unknown) => localizedEmployeeTime(value, locale);
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
      setFormError(tx('Enter at least one attendance field to correct.')); return;
    }
    if (checkIn && checkOut && checkOut < checkIn) {
      setFormError(tx('Check-out must be after check-in.')); return;
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
      if (!data) throw new Error(tx('The correction request was not confirmed. Refresh and check your request history.'));
      setSuccess(tx('Attendance correction submitted for review.'));
      setRequestOpen(false); setAttendanceDate(''); setCheckIn(''); setCheckOut(''); setWorkMode(''); setReason('');
      await onRefresh();
    } catch (cause) {
      setFormError(tx(cause instanceof Error ? cause.message : 'Unable to submit this attendance correction.'));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return <>
    <section aria-labelledby="employee-attendance-corrections-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div><h3 id="employee-attendance-corrections-heading" className="font-semibold text-[#08263D]">{tx('My attendance correction requests')}</h3>
          <p className="mt-1 text-xs text-slate-500">{tx('Requests are reviewed by an authorized attendance manager before records change.')}</p></div>
        <button ref={requestButtonRef} type="button" onClick={() => { setFormError(''); setRequestOpen(true); }}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white">
          <Clock3 className="h-4 w-4" /> {tx('Request a correction')}
        </button>
      </div>
      {success && <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
      {corrections.length ? <div role="region" aria-label={tx('Attendance correction history table')} tabIndex={0}
        className="overflow-x-auto rounded-lg border border-slate-200 focus-visible:outline-2 focus-visible:outline-[#08558B]"><table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-[#EFF7F8] text-xs text-slate-600"><tr>
          {['Date', 'Requested change', 'Reason', 'Status', 'Resolution'].map(label => <th key={label} scope="col" className="px-3 py-3 font-medium">{tx(label)}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{corrections.map((item, index) => <tr key={String(item.id || index)}>
          <td className="px-3 py-3">{employeeDate(item.attendance_date)}</td>
          <td className="px-3 py-3">{[
            item.requested_check_in ? txf('In {time}', { time: employeeTime(item.requested_check_in) }) : '',
            item.requested_check_out ? txf('Out {time}', { time: employeeTime(item.requested_check_out) }) : '',
            item.requested_work_mode ? txf('Mode {mode}', { mode: tx(displayWorkMode(item.requested_work_mode)) }) : '',
          ].filter(Boolean).join(' · ') || '—'}</td>
          <td className="max-w-64 px-3 py-3"><span className="block truncate" title={String(item.reason || '')}>{display(item.reason)}</span></td>
          <td className="px-3 py-3 capitalize">{tx(display(item.status))}</td>
          <td className="max-w-56 px-3 py-3"><span className="block truncate" title={String(item.resolution_note || '')}>{display(item.resolution_note)}</span></td>
        </tr>)}</tbody>
      </table></div> : <p className="rounded-lg bg-[#EFF7F8] p-4 text-sm text-slate-600">{tx('No attendance correction requests yet.')}</p>}
    </section>
    {requestOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-3 sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget && !submitting) setRequestOpen(false); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="attendance-correction-dialog-heading" className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div><h3 id="attendance-correction-dialog-heading" className="text-lg font-semibold text-[#08263D]">{tx('Request attendance correction')}</h3>
            <p className="mt-1 text-xs text-slate-500">{tx('Times use the organization’s local time.')}</p></div>
          <button type="button" aria-label={tx('Close attendance correction request')} disabled={submitting} onClick={() => setRequestOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={event => void submitRequest(event)} className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
            <div><label htmlFor="attendance-correction-date" className="mb-1 block text-sm font-medium text-slate-700">{tx('Attendance date')} <span aria-hidden="true">*</span></label>
              <input id="attendance-correction-date" autoFocus type="date" required value={attendanceDate || today} onChange={event => setAttendanceDate(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label htmlFor="attendance-correction-check-in" className="mb-1 block text-sm font-medium text-slate-700">{tx('Requested check-in')}</label>
                <input id="attendance-correction-check-in" type="time" value={checkIn} onChange={event => setCheckIn(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
              <div><label htmlFor="attendance-correction-check-out" className="mb-1 block text-sm font-medium text-slate-700">{tx('Requested check-out')}</label>
                <input id="attendance-correction-check-out" type="time" value={checkOut} onChange={event => setCheckOut(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
            </div>
            <div><label htmlFor="attendance-correction-work-mode" className="mb-1 block text-sm font-medium text-slate-700">{tx('Requested work location')}</label>
              <select id="attendance-correction-work-mode" value={workMode} onChange={event => setWorkMode(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                <option value="">{tx('No change')}</option><option value="office">{tx('Office')}</option><option value="home">{tx('Home')}</option><option value="client_meeting">{tx('Client Meeting')}</option>
              </select></div>
            <div><label htmlFor="attendance-correction-reason" className="mb-1 block text-sm font-medium text-slate-700">{tx('Reason')} <span aria-hidden="true">*</span></label>
              <textarea id="attendance-correction-reason" required maxLength={2000} rows={3} value={reason} onChange={event => setReason(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
            {formError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{formError}</p>}
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
            <button type="button" disabled={submitting} onClick={() => setRequestOpen(false)} className="min-h-11 rounded-lg px-4 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50">{tx('Cancel')}</button>
            <button type="submit" disabled={submitting} className="min-h-11 rounded-lg bg-[#08558B] px-5 text-sm font-medium text-white disabled:opacity-50">{submitting ? tx('Sending…') : tx('Send request')}</button>
          </div>
        </form>
      </div>
    </div>}
  </>;
}

function EmployeeOverview({ tenantId, tenantName, userId, locale }: { tenantId: string; tenantName: string; userId: string; locale: Locale }) {
  const tx = (source: string) => projectText(locale, source);
  const txf = (source: string, values: Record<string, string | number>) => localizedProjectText(locale, source, values);
  const employeeDate = (value: unknown) => localizedEmployeeDate(value, locale);
  const employeeTime = (value: unknown) => localizedEmployeeTime(value, locale);
  const employeeWorkMode = (value: unknown) => tx(displayWorkMode(value));
  const employeeNumber = (value: unknown, fractionDigits = 0) => localizedEmployeeNumber(value, locale, fractionDigits);
  const [attendance, setAttendance] = useState<Record<string, unknown> | null>(null);
  const [leave, setLeave] = useState<Record<string, unknown> | null>(null);
  const [loadedTenantId, setLoadedTenantId] = useState('');
  const [selectedAttendanceMonth, setSelectedAttendanceMonth] = useState('');
  const [monthlyAttendance, setMonthlyAttendance] = useState<Record<string, unknown>[]>([]);
  const [loadedAttendanceMonth, setLoadedAttendanceMonth] = useState('');
  const [attendanceMonthLoading, setAttendanceMonthLoading] = useState(false);
  const [attendanceMonthError, setAttendanceMonthError] = useState('');
  const [attendanceMonthRevision, setAttendanceMonthRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attendanceAction, setAttendanceAction] = useState<'check_in' | 'check_out' | null>(null);
  const [attendanceActionError, setAttendanceActionError] = useState('');
  const [attendanceActionSuccess, setAttendanceActionSuccess] = useState('');
  const [activePanel, setActivePanel] = useState<EmployeePanelId>('working-hours');
  const requestSequence = useRef(0);
  const attendanceMonthSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  activeTenantId.current = tenantId;

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
      if (!attendanceData || !dashboardData) throw new Error(tx('Employee services returned an invalid response.'));
      const dashboardDate = typeof dashboardData.dashboard_date === 'string' ? dashboardData.dashboard_date : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dashboardDate)) throw new Error(tx('Employee services returned an invalid organization date.'));
      if (requestId !== requestSequence.current) return;
      if (loadedTenantId !== tenantId) setSelectedAttendanceMonth(dashboardDate.slice(0, 7));
      setAttendance(attendanceData);
      setLeave(dashboardData);
      setLoadedTenantId(tenantId);
    } catch (cause) {
      if (requestId !== requestSequence.current) return;
      setAttendance(null); setLeave(null); setLoadedTenantId('');
      setError(tx(cause instanceof Error ? cause.message : 'Unable to load your HRIS summary.'));
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
      setAttendanceActionSuccess(tx(event === 'check_in' ? 'You are checked in for today.' : 'You are checked out for today.'));
      await load(false);
      setAttendanceMonthRevision(value => value + 1);
    } catch (cause) {
      setAttendanceActionError(tx(cause instanceof Error ? cause.message : 'Unable to update your attendance. Please retry.'));
    } finally {
      setAttendanceAction(null);
    }
  }

  useEffect(() => {
    setAttendance(null); setLeave(null); setLoadedTenantId('');
    void load();
    return () => { requestSequence.current += 1; };
  }, [tenantId]);

  useEffect(() => {
    const requestId = ++attendanceMonthSequence.current;
    const monthKey = `${tenantId}:${selectedAttendanceMonth}`;
    const isCurrent = () => requestId === attendanceMonthSequence.current
      && activeTenantId.current === tenantId;
    if (!selectedAttendanceMonth || loadedTenantId !== tenantId) {
      setMonthlyAttendance([]);
      setLoadedAttendanceMonth('');
      setAttendanceMonthLoading(false);
      setAttendanceMonthError('');
      return () => { attendanceMonthSequence.current += 1; };
    }

    setAttendanceMonthLoading(true);
    setAttendanceMonthError('');
    void (async () => {
      try {
        const result = await supabase.rpc('hris_get_my_attendance_period', {
          p_tenant_id: tenantId,
          p_month_start: `${selectedAttendanceMonth}-01`,
        });
        if (result.error) throw result.error;
        const data = asObject(result.data);
        const rows = asRows(data?.records);
        if (!data || data.tenant_id !== tenantId || data.month_start !== `${selectedAttendanceMonth}-01` || !Array.isArray(data.records)) {
          throw new Error(tx('Monthly attendance returned an invalid response.'));
        }
        if (!isCurrent()) return;
        setMonthlyAttendance(rows);
        setLoadedAttendanceMonth(monthKey);
      } catch (cause) {
        if (!isCurrent()) return;
        setMonthlyAttendance([]);
        setLoadedAttendanceMonth('');
        setAttendanceMonthError(tx(cause instanceof Error ? cause.message : 'Unable to load this month of attendance.'));
      } finally {
        if (isCurrent()) setAttendanceMonthLoading(false);
      }
    })();
    return () => { attendanceMonthSequence.current += 1; };
  }, [tenantId, selectedAttendanceMonth, attendanceMonthRevision, loadedTenantId]);

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
  const attendanceMonthKey = `${tenantId}:${selectedAttendanceMonth}`;
  const attendanceMonthReady = loadedAttendanceMonth === attendanceMonthKey;
  const monthAttendanceRows = attendanceMonthReady ? monthlyAttendance : [];
  const monthParts = selectedAttendanceMonth.split('-').map(Number);
  const monthDayCount = monthParts.length === 2 && monthParts.every(Number.isFinite)
    ? new Date(Date.UTC(monthParts[0], monthParts[1], 0)).getUTCDate() : 31;
  const workHours = monthAttendanceRows.map(row => ({
    row,
    hours: row.work_hours === null || row.work_hours === undefined ? null : Number(row.work_hours),
  })).filter(item => item.hours === null || Number.isFinite(item.hours));
  const recordedHours = workHours.reduce((sum, item) => sum + (item.hours ?? 0), 0);
  const weekBuckets = Array.from({ length: Math.ceil(monthDayCount / 7) }, (_, index) => ({
    label: `${index * 7 + 1}–${Math.min(monthDayCount, index * 7 + 7)}`,
    hours: 0,
    count: 0,
  }));
  for (const item of workHours) {
    const day = Number(String(item.row.attendance_date || '').slice(8, 10));
    if (!Number.isInteger(day) || day < 1 || day > 31) continue;
    const bucket = weekBuckets[Math.min(4, Math.floor((day - 1) / 7))];
    bucket.hours += item.hours ?? 0;
    if (item.hours !== null) bucket.count += 1;
  }
  const maxWeekHours = Math.max(0, ...weekBuckets.map(bucket => bucket.hours));
  const attendanceMonthLabel = selectedAttendanceMonth && monthParts.length === 2
    ? new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(monthParts[0], monthParts[1] - 1, 1)))
    : 'selected month';
  const workModes = monthAttendanceRows.reduce<Record<string, number>>((counts, row) => {
    const mode = employeeWorkMode(row.work_mode);
    if (mode !== tx('Not recorded')) counts[mode] = (counts[mode] || 0) + 1;
    return counts;
  }, {});
  const tabs: { id: EmployeePanelId; label: string }[] = [
    { id: 'working-hours', label: tx('Working hours') },
    { id: 'work-location', label: tx('Work location') },
    { id: 'leave-type', label: tx('Leave type') },
    { id: 'check-in-times', label: tx('Check-in times') },
  ];

  return <section aria-labelledby="employee-summary-heading" className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="employee-summary-heading" className="text-2xl font-medium text-[#49454F]">{tx('Personal Dashboard')}</h2>
        <p className="mt-1 text-sm text-slate-500">{txf('Your attendance and leave information for {organization}', { organization: tenantName })}</p></div>
      <button type="button" disabled={loading} onClick={() => {
        void load().finally(() => setAttendanceMonthRevision(value => value + 1));
      }} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50"><RefreshCw className="h-4 w-4" /> {tx('Refresh')}</button>
    </div>
    {error && <StatusMessage error={tx(error)} retryLabel={tx('Retry')} onRetry={() => void load()} />}
    {(loading || (!currentTenantDataReady && !error)) && <p role="status" className="rounded-lg border bg-white p-5 text-sm">{tx('Loading your HRIS summary…')}</p>}
    {currentTenantDataReady && attendance && leave && <>
      <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(160px,0.8fr)_minmax(0,2fr)] xl:grid-cols-[180px_minmax(0,1fr)_288px]">
        <section aria-labelledby="employee-profile-heading" className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
          <div className="mx-auto grid h-24 w-24 place-items-center rounded-xl bg-[#E7F1F3] text-2xl font-semibold text-[#08558B]" aria-hidden="true">{initials}</div>
          <h3 id="employee-profile-heading" className="mt-3 break-words text-base font-semibold text-[#08263D]">{fullName || tx('Employee profile')}</h3>
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
              <div><h3 id="employee-today-heading" className="font-semibold text-[#08263D]">{tx('Today’s attendance')}</h3>
                <p className="mt-1 text-xs text-slate-500">{employeeDate(today)} · {tx('organization local date')}</p></div>
              {todayRecord && <span className="rounded-full bg-[#E7F1F3] px-3 py-1 text-xs font-medium text-[#08558B]">{tx(display(todayRecord.status))}</span>}
            </div>
            {todayRecord ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div><p className="text-xs text-slate-500">{tx('Check in')}</p><p className="mt-1 text-sm font-medium">{employeeTime(todayRecord.check_in)}</p></div>
              <div><p className="text-xs text-slate-500">{tx('Check out')}</p><p className="mt-1 text-sm font-medium">{employeeTime(todayRecord.check_out)}</p></div>
              <div><p className="text-xs text-slate-500">{tx('Work location')}</p><p className="mt-1 text-sm font-medium">{employeeWorkMode(todayRecord.work_mode)}</p></div>
            </div> : <p className="mt-3 text-sm text-slate-600">{tx('No attendance record is available for this date. Your work schedule is not included in this summary.')}</p>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <p className="text-sm text-slate-600">{todayRecord?.check_out
                ? txf('Attendance recorded through {time}', { time: employeeTime(todayRecord.check_out) })
                : todayRecord?.check_in ? txf('Checked in at {time}', { time: employeeTime(todayRecord.check_in) }) : tx('You have not checked in today.')}</p>
              {!todayRecord?.check_out && <button type="button" disabled={loading || attendanceAction !== null}
                onClick={() => void recordAttendanceEvent(todayRecord?.check_in ? 'check_out' : 'check_in')}
                className="min-h-11 rounded-lg bg-[#08558B] px-5 text-sm font-medium text-white shadow-[0_3px_0_#02395c] disabled:cursor-wait disabled:opacity-60">
                {attendanceAction ? (attendanceAction === 'check_in' ? tx('Checking in…') : tx('Checking out…'))
                  : todayRecord?.check_in ? tx('Check out') : tx('Check in')}
              </button>}
            </div>
            {attendanceActionError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{attendanceActionError}</p>}
            {attendanceActionSuccess && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{attendanceActionSuccess}</p>}
          </section>

          <section aria-labelledby="employee-insights-heading" className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 pt-3 sm:px-5">
              <h3 id="employee-insights-heading" className="mb-2 font-semibold text-[#08263D]">{tx('Attendance and leave')}</h3>
              <div role="group" aria-label={tx('Personal dashboard views')} className="-mb-px grid grid-cols-2 gap-x-2 sm:flex sm:min-w-0 sm:overflow-x-auto">
                {tabs.map(tab => <button key={tab.id} type="button" aria-pressed={activePanel === tab.id}
                  onClick={() => setActivePanel(tab.id)} className={`min-h-12 w-full border-b-2 px-2 text-xs sm:w-auto sm:shrink-0 sm:flex-1 sm:px-2 sm:text-sm ${activePanel === tab.id ? 'border-[#08558B] text-[#08558B]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                  {tab.label}
                </button>)}
              </div>
            </div>
            <div className="min-h-56 p-4 sm:p-5" aria-live="polite">
              {attendanceMonthLoading && <p role="status" className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{txf('Loading {month} attendance…', { month: attendanceMonthLabel })}</p>}
              {attendanceMonthError && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                <span>{attendanceMonthError}</span>
                <button type="button" onClick={() => setAttendanceMonthRevision(value => value + 1)} className="min-h-10 rounded-md border border-rose-300 bg-white px-3 font-medium">{tx('Retry attendance month')}</button>
              </div>}
              {activePanel === 'working-hours' && <div>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div><h4 className="font-medium text-slate-800">{tx('Recorded working hours')}</h4>
                    <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span>{tx('Attendance month')}</span>
                      <input aria-label={tx('Attendance month')} type="month" value={selectedAttendanceMonth}
                        max={today.slice(0, 7)} onChange={event => setSelectedAttendanceMonth(event.target.value)}
                        className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 shadow-sm focus:border-[#08558B] focus:outline-none focus:ring-2 focus:ring-[#08558B]/20" />
                    </label>
                  </div>
                  <p className="text-right"><span className="block text-xl font-semibold tabular-nums text-[#08558B]">{attendanceMonthReady ? employeeNumber(recordedHours, 1) : '—'} {tx('hr')}</span><span className="text-xs text-slate-500">{txf('{month} · complete check-in pairs', { month: attendanceMonthLabel })}</span></p>
                </div>
                {attendanceMonthReady && (workHours.some(item => item.hours !== null) ? <div role="img" aria-label={txf('Recorded work hours for {month} by week', { month: attendanceMonthLabel })} className="mt-5 grid grid-cols-4 items-end gap-2 border-b border-slate-200 pb-2 sm:grid-cols-5">
                  {weekBuckets.map((bucket, index) => <div key={bucket.label} className="min-w-0 text-center">
                    <div className="flex h-28 items-end justify-center"><div title={txf('{hours} recorded hours', { hours: employeeNumber(bucket.hours, 1) })} className="w-full max-w-10 rounded-t bg-[#08558B]" style={{ height: `${maxWeekHours > 0 && bucket.hours ? Math.max(6, (bucket.hours / maxWeekHours) * 100) : 0}%` }} /></div>
                    <span className="mt-2 block truncate text-[10px] text-slate-500">{txf('Week {week} · {range}', { week: employeeNumber(index + 1), range: bucket.label.replace(/\d+/g, digits => employeeNumber(Number(digits))) })}</span>
                    <span className="mt-1 block text-[10px] tabular-nums text-slate-700">{bucket.count ? `${employeeNumber(bucket.hours, 1)}${tx('h')}` : '—'}</span>
                  </div>)}
                </div> : null)}
                {attendanceMonthReady && <div className="sr-only">
                  <table aria-label={tx('Weekly work-hours data')}>
                    <thead><tr><th scope="col">{tx('Week')}</th><th scope="col">{tx('Recorded working hours')}</th><th scope="col">{tx('Complete check-in pairs')}</th></tr></thead>
                    <tbody>{weekBuckets.map((bucket, index) => <tr key={bucket.label}>
                      <th scope="row">{txf('Week {week} · {range}', { week: employeeNumber(index + 1), range: bucket.label.replace(/\d+/g, digits => employeeNumber(Number(digits))) })}</th>
                      <td>{employeeNumber(bucket.hours, 1)} {tx('hr')}</td>
                      <td>{employeeNumber(bucket.count)}</td>
                    </tr>)}</tbody>
                  </table>
                </div>}
                {attendanceMonthReady && !workHours.some(item => item.hours !== null) && <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">{txf('No complete check-in and check-out pairs are available for {month}.', { month: attendanceMonthLabel })}</p>}
                {attendanceMonthReady && <p className="mt-3 text-xs text-slate-500">{tx('Scheduled hours are not returned in this personal summary, so no required-hours target is shown.')}</p>}
              </div>}
              {activePanel === 'work-location' && <div>
                <h4 className="font-medium text-slate-800">{tx('Recorded work locations')}</h4><p className="mt-1 text-xs text-slate-500">{attendanceMonthLabel}</p>
                {attendanceMonthReady && (Object.keys(workModes).length ? <div className="mt-4 grid grid-cols-2 gap-3">{Object.entries(workModes).map(([mode, count]) => <div key={mode} className="rounded-lg border border-slate-200 p-3">
                  <p className="flex items-center gap-2 text-sm text-slate-600"><MapPin className="h-4 w-4 text-[#08558B]" />{mode}</p><p className="mt-2 text-xl font-semibold tabular-nums">{employeeNumber(count)}</p><p className="text-xs text-slate-500">{tx('attendance entries')}</p>
                </div>)}</div> : <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">{txf('No work location is recorded for {month}.', { month: attendanceMonthLabel })}</p>)}
              </div>}
              {activePanel === 'leave-type' && <div>
                <h4 className="font-medium text-slate-800">{tx('Leave balances')} · {employeeNumber(leave.balance_year)}</h4>
                {balances.length ? <div className="mt-3 divide-y divide-slate-100">{balances.map((row, index) => <div key={String(row.leave_type_id || index)} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <span className="text-sm font-medium">{display(row.leave_type_name)}</span><span className="text-sm tabular-nums text-slate-700">{employeeNumber(row.available_days)} {tx('days available')}</span>
                </div>)}</div> : <p className="mt-3 text-sm text-slate-600">{tx('No leave balance records are available.')}</p>}
              </div>}
              {activePanel === 'check-in-times' && <div>
                <h4 className="font-medium text-slate-800">{tx('Check-in history')} · {attendanceMonthLabel}</h4>
                {attendanceMonthReady && (monthAttendanceRows.length ? <ul className="mt-2 divide-y divide-slate-100">{monthAttendanceRows.map((row, index) => <li key={String(row.id || index)} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span><strong>{employeeDate(row.attendance_date)}</strong><span className="ml-2 text-slate-500">{tx(display(row.status))}</span></span>
                  <span className="tabular-nums">{employeeTime(row.check_in)} – {employeeTime(row.check_out)}</span>
                </li>)}</ul> : <p className="mt-3 text-sm text-slate-600">{txf('No attendance records are available for {month}.', { month: attendanceMonthLabel })}</p>)}
              </div>}
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-4 md:col-span-2 xl:col-span-1">
          <section aria-labelledby="employee-leave-balances-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2"><div><h3 id="employee-leave-balances-heading" className="font-semibold text-[#08263D]">{tx('Leave balances')}</h3>
              <p className="mt-1 text-xs text-slate-500">{txf('Current year · {year}', { year: employeeNumber(leave.balance_year) })}</p></div><CalendarDays className="h-5 w-5 text-[#08558B]" /></div>
            {balances.length ? <ul className="mt-3 divide-y divide-slate-100">{balances.map((row, index) => <li key={String(row.leave_type_id || index)} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0 truncate">{display(row.leave_type_name)}</span><strong className="shrink-0 tabular-nums">{employeeNumber(row.available_days)} {tx('days')}</strong>
            </li>)}</ul> : <p className="mt-3 text-sm text-slate-600">{tx('No leave balance records are available.')}</p>}
          </section>
          <PersonalLeaveRequests tenantId={tenantId} userId={userId} leave={leave} onRefresh={() => load(false)} compact showBalances={false} showHistory={false} locale={locale} />
          <section aria-labelledby="employee-holidays-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 id="employee-holidays-heading" className="font-semibold text-[#08263D]">{tx('Upcoming holidays')}</h3>
            {holidays.length ? <ul className="mt-3 max-h-56 divide-y divide-slate-100 overflow-y-auto">{holidays.slice(0, 8).map((holiday, index) => <li key={String(holiday.id || index)} className="flex items-start justify-between gap-3 py-3 text-sm">
              <span className="min-w-0 break-words">{display(holiday.name)}</span><span className="shrink-0 text-xs text-slate-500">{employeeDate(holiday.start_date)}{holiday.end_date && holiday.end_date !== holiday.start_date ? ` – ${employeeDate(holiday.end_date)}` : ''}</span>
            </li>)}</ul> : <p className="mt-3 text-sm text-slate-600">{tx('No upcoming holidays are published.')}</p>}
          </section>
        </aside>
      </div>

      <section aria-labelledby="employee-leave-history-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h3 id="employee-leave-history-heading" className="font-semibold text-[#08263D]">{tx('My leave requests')}</h3>
          <p className="mt-1 text-xs text-slate-500">{tx('Status and resolution updates from this organization')}</p></div><span className="text-xs text-slate-500">{txf('{count} requests', { count: employeeNumber(requests.length) })}</span></div>
        {requests.length ? <div role="region" aria-label={tx('My leave request history table')} tabIndex={0}
          className="overflow-x-auto rounded-lg border border-slate-200 focus-visible:outline-2 focus-visible:outline-[#08558B]"><table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-[#EFF7F8] text-xs text-slate-600"><tr>{['Leave type', 'From', 'To', 'Days', 'Reason', 'Status'].map(label => <th key={label} scope="col" className="px-3 py-3 font-medium">{tx(label)}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{requests.map((item, index) => <tr key={String(item.id || index)}>
            <td className="px-3 py-3">{display(item.leave_type_name)}</td><td className="px-3 py-3">{employeeDate(item.from_date)}</td><td className="px-3 py-3">{employeeDate(item.to_date)}</td>
            <td className="px-3 py-3">{employeeNumber(item.requested_days)}</td><td className="max-w-48 px-3 py-3"><span className="block truncate" title={String(item.reason || '')}>{display(item.reason)}</span>
              {Boolean(item.resolution_note) && <span className="block truncate text-xs text-slate-500">{display(item.resolution_note)}</span>}</td><td className="px-3 py-3 font-medium">{tx(display(item.status))}</td>
          </tr>)}</tbody>
        </table></div> : <p className="rounded-lg bg-[#EFF7F8] p-4 text-sm text-slate-600">{tx('No leave requests yet.')}</p>}
      </section>
      <PersonalAttendanceCorrections tenantId={tenantId} today={today} corrections={asRows(attendance.corrections)} onRefresh={() => load(false)} locale={locale} />
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
  const [locale, setLocale] = useState<Locale>(() => {
    try { return localStorage.getItem('synesis-hris-locale') === 'bn' ? 'bn' : 'en'; }
    catch { return 'en'; }
  });
  useEffect(() => {
    document.documentElement.lang = locale;
    try { localStorage.setItem('synesis-hris-locale', locale); } catch { /* locale still works for this session */ }
  }, [locale]);
  const [page, setPage] = useState<PageId>(() => {
    if (isSuperAdmin && platformTenantFeatureAvailable) return 'platform-tenants';
    if (isSuperAdmin && !permissions.dashboard && !permissions.attendance && !permissions.leave
        && !permissions.organization && !permissions.employees && !permissions.performance) return 'projects';
    if (permissions.dashboard) return 'dashboard';
    if (permissions.attendance) return 'attendance';
    if (permissions.leave) return 'leave';
    if (permissions.organization) return 'projects';
    if (permissions.employees) return 'employees';
    if (permissions.performance) return 'performance';
    if (permissions.referrals) return 'referrals';
    if (permissions.recruitment) return 'recruitment';
    return isEmployee ? 'my-dashboard' : 'dashboard';
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [travelFocusRequestId, setTravelFocusRequestId] = useState<string | null>(null);
  const [leaveFocusRequestId, setLeaveFocusRequestId] = useState<string | null>(null);
  const nav = useMemo(() => {
    const items: { id: PageId; label: string; icon: ReactNode; group: 'HRIS' | 'Personal' }[] = [];
    if (permissions.dashboard) items.push({ id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.attendance) items.push({ id: 'attendance', label: 'Attendance', icon: <CalendarDays className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.attendanceView || permissions.attendanceManage) items.push({ id: 'shift-roster', label: 'Roster', icon: <Clock3 className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.leave) items.push({ id: 'leave', label: 'Leave', icon: <ClipboardList className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.organization || isSuperAdmin) {
      items.push({ id: 'projects', label: 'Projects', icon: <BriefcaseBusiness className="h-5 w-5" />, group: 'HRIS' });
      if (permissions.organization) items.push({ id: 'teams', label: 'Teams', icon: <Users className="h-5 w-5" />, group: 'HRIS' });
    }
    else if (isEmployee) items.push({ id: 'projects', label: 'Project Workspace', icon: <BriefcaseBusiness className="h-5 w-5" />, group: 'Personal' });
    if (isSuperAdmin && platformTenantFeatureAvailable) items.push({ id: 'platform-tenants', label: 'Platform tenants', icon: <Building2 className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.employees) items.push({ id: 'employees', label: 'Employees', icon: <Users className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.employeesManage) items.push({ id: 'onboarding', label: 'Onboarding', icon: <UserRoundPlus className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.employeesManage) items.push({ id: 'service-requests', label: 'Service Requests', icon: <ClipboardList className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.performance) items.push({ id: 'performance', label: 'Performance', icon: <Target className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.recruitment) items.push({ id: 'recruitment', label: 'Candidate pipeline', icon: <Users className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.referrals) items.push({ id: 'referrals', label: 'Employee referrals', icon: <UserRoundPlus className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.holidayManage) items.push({ id: 'holidays', label: 'Holiday calendar', icon: <CalendarDays className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.learningManage) {
      items.push({ id: 'learning-programs', label: 'Learning programs', icon: <BookOpenCheck className="h-5 w-5" />, group: 'HRIS' });
      items.push({ id: 'learning-requests', label: 'Learning requests', icon: <BookOpenCheck className="h-5 w-5" />, group: 'HRIS' });
      items.push({ id: 'learning-completions', label: 'Learning completion review', icon: <BookOpenCheck className="h-5 w-5" />, group: 'HRIS' });
    }
    if (permissions.travel) items.push({ id: 'travel', label: 'Travel requests', icon: <MapPin className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.expenses) items.push({ id: 'expenses', label: 'Expense claims', icon: <Receipt className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.payroll) items.push({ id: 'payroll-register', label: 'Payroll register', icon: <Receipt className="h-5 w-5" />, group: 'HRIS' });
    if (isEmployee) items.push({ id: 'my-dashboard', label: 'My Overview', icon: <Users className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-projects', label: 'My Projects', icon: <BriefcaseBusiness className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-notifications', label: 'Notifications', icon: <Bell className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-performance', label: 'My Performance', icon: <Target className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-learning', label: 'My Learning', icon: <BookOpen className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-payslips', label: 'My Payslips', icon: <Receipt className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-leave', label: 'My Leave', icon: <CalendarDays className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-timesheets', label: 'My Timesheets', icon: <Clock3 className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-travel', label: 'My Travel', icon: <MapPin className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-expenses', label: 'My Expenses', icon: <Receipt className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-service-requests', label: 'My Requests', icon: <ClipboardList className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee && !permissions.referrals) items.push({ id: 'referrals', label: 'My Referrals', icon: <UserRoundPlus className="h-5 w-5" />, group: 'Personal' });
    return items;
  }, [permissions, isEmployee, isSuperAdmin]);

  const localizedNav = useMemo(() => nav.map(item => ({
    ...item,
    label: projectText(locale, item.label),
  })), [nav, locale]);

  useEffect(() => {
    if (nav.some(item => item.id === page)) return;
    setPage(nav[0]?.id || 'dashboard');
  }, [nav, page]);

  const roleLabel = isSuperAdmin ? 'Super Administrator' : permissions.dashboard || permissions.attendance || permissions.leave || permissions.organization || permissions.employees || permissions.employeesManage || permissions.performance || permissions.recruitment || permissions.holidayManage || permissions.learningManage || permissions.travel || permissions.expenses || permissions.payroll ? 'HRIS Administrator' : 'Employee';
  const navigate = (next: PageId) => { setPage(next); setMobileOpen(false); };
  const openTravelRequest = (requestId: string) => { setTravelFocusRequestId(requestId); navigate('my-travel'); };
  const clearTravelRequestFocus = (requestId: string) => setTravelFocusRequestId(currentId => currentId === requestId ? null : currentId);
  const openLeaveRequest = (requestId: string) => { setLeaveFocusRequestId(requestId); navigate('my-leave'); };
  const clearLeaveRequestFocus = (requestId: string) => setLeaveFocusRequestId(currentId => currentId === requestId ? null : currentId);
  const current = localizedNav.find(item => item.id === page);

  const navigation = <nav aria-label="HRIS modules" className="space-y-1">
    {(['HRIS', 'Personal'] as const).map(group => {
      const items = localizedNav.filter(item => item.group === group);
      return items.length ? <div key={group} className="space-y-1">
        <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{projectText(locale, group === 'HRIS' ? 'Workforce' : 'Self service')}</p>
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
        <button type="button" onClick={() => setLocale(currentLocale => currentLocale === 'en' ? 'bn' : 'en')}
          aria-label={locale === 'en' ? 'Switch language to Bengali' : 'Switch language to English'}
          aria-pressed={locale === 'bn'} className="inline-flex min-h-11 min-w-12 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold hover:bg-slate-50">
          {locale === 'en' ? 'EN' : 'বাংলা'}
        </button>
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
          {page === 'dashboard' && permissions.dashboard && <LiveDashboard tenantId={tenantId} onOpen={navigate} canReport={permissions.attendanceReport} locale={locale} />}
          {page === 'attendance' && permissions.attendance && <AttendanceReport
            tenantId={tenantId} canView={permissions.attendanceView} canReport={permissions.attendanceReport} canManage={permissions.attendanceManage} locale={locale}
          />}
          {page === 'shift-roster' && (permissions.attendanceView || permissions.attendanceManage) && <ShiftRoster tenantId={tenantId} canManage={permissions.attendanceManage} />}
          {page === 'leave' && permissions.leave && <LeaveWorkspace tenantId={tenantId} canManage={permissions.leaveManage} locale={locale} />}
          {page === 'projects' && (permissions.organization || isSuperAdmin || isEmployee) && <>
            <OrganizationProjects tenantId={tenantId} locale={locale} />
            {isEmployee && <ProjectTimesheetReviewQueue tenantId={tenantId} locale={locale} />}
          </>}
          {page === 'teams' && permissions.organization && <OrganizationTeams tenantId={tenantId} />}
          {page === 'employees' && permissions.employees && <OrganizationEmployeeDirectory tenantId={tenantId} locale={locale} employeesManage={permissions.employeesManage} />}
          {page === 'onboarding' && permissions.employeesManage && <CandidatePreboardingQueue tenantId={tenantId} locale={locale} canActivate={permissions.employeesManage} />}
          {page === 'service-requests' && permissions.employeesManage && <ServiceRequestReview tenantId={tenantId} locale={locale} />}
          {page === 'performance' && permissions.performance && <OrganizationPerformance tenantId={tenantId} />}
          {page === 'recruitment' && permissions.recruitment && <RecruitmentPipeline tenantId={tenantId} locale={locale} canManagePreboarding={permissions.recruitmentManage} canManageOffers={permissions.recruitmentManage} canManageApplicationStages={permissions.recruitmentManage} />}
          {page === 'referrals' && (isEmployee || permissions.referrals) && <EmployeeReferrals tenantId={tenantId} userId={userId} canViewQueue={permissions.referrals} canManage={permissions.referralsManage} />}
          {page === 'holidays' && permissions.holidayManage && <OrganizationHolidayCalendar tenantId={tenantId} />}
          {page === 'learning-programs' && permissions.learningManage && <LearningProgramAdmin tenantId={tenantId} locale={locale} />}
          {page === 'learning-requests' && permissions.learningManage && <LearningRequests tenantId={tenantId} locale={locale} />}
          {page === 'learning-completions' && permissions.learningManage && <LearningCompletionQueue tenantId={tenantId} locale={locale} />}
          {page === 'travel' && permissions.travel && <TravelRequests tenantId={tenantId} canManage={permissions.travelManage} locale={locale} />}
          {page === 'expenses' && permissions.expenses && <ExpenseClaims tenantId={tenantId} userId={userId} mode="queue" canManage={permissions.expensesManage} />}
          {page === 'payroll-register' && permissions.payroll && <PayrollRegister tenantId={tenantId} />}
          {page === 'platform-tenants' && isSuperAdmin && platformTenantFeatureAvailable && <PlatformTenantWorkspace locale={locale} />}
          {page === 'my-dashboard' && isEmployee && <EmployeeOverview tenantId={tenantId} tenantName={tenantName} userId={userId} locale={locale} />}
          {page === 'my-projects' && isEmployee && <>
            <MyProjects tenantId={tenantId} locale={locale} />
            <ProjectTimesheetReviewQueue tenantId={tenantId} locale={locale} />
          </>}
          {page === 'my-notifications' && isEmployee && <ProjectNotifications tenantId={tenantId} locale={locale}
            onOpenProjects={() => navigate('my-projects')} onOpenLearning={() => navigate('my-learning')}
            onOpenTravel={openTravelRequest} onOpenLeave={openLeaveRequest} />}
          {page === 'my-performance' && isEmployee && <MyPerformance tenantId={tenantId} userId={userId} locale={locale} />}
          {page === 'my-learning' && isEmployee && <MyLearning tenantId={tenantId} locale={locale} />}
          {page === 'my-payslips' && isEmployee && <MyPayslips tenantId={tenantId} />}
          {page === 'my-leave' && isEmployee && <EmployeePersonalLeave tenantId={tenantId} tenantName={tenantName} userId={userId}
            focusRequestId={leaveFocusRequestId} onFocusHandled={clearLeaveRequestFocus} />}
          {page === 'my-timesheets' && isEmployee && <EmployeeTimesheets tenantId={tenantId} tenantName={tenantName} locale={locale} />}
          {page === 'my-travel' && isEmployee && <MyTravelRequests tenantId={tenantId} locale={locale}
            focusRequestId={travelFocusRequestId} onFocusHandled={clearTravelRequestFocus} />}
          {page === 'my-expenses' && isEmployee && <ExpenseClaims tenantId={tenantId} userId={userId} mode="personal" />}
          {page === 'my-service-requests' && isEmployee && <MyServiceRequests tenantId={tenantId} locale={locale} />}
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

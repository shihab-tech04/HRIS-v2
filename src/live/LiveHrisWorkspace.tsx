Warning: truncated output (original token count: 103466)
Total output lines: 5618

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import attendanceDownloadIcon from '../assets/attendance-download.png';
import attendanceFilterIcon from '../assets/attendance-filter.svg';
import attendanceSearchIcon from '../assets/attendance-search.svg';
import attendanceTeamSortIcon from '../assets/attendance-team-sort.svg';
import synesisItLogo from '../assets/synesis-it-logo.png';
import './attendance-report.css';
import { OrganizationTeams } from './OrganizationTeams';
import { RealUserProvisioningReadiness } from './RealUserProvisioningReadiness';
import { RealLinkedUserDirectory } from './RealLinkedUserDirectory';
import { RealRoleManagement } from './RealRoleManagement';
import { OrganizationProjects } from './OrganizationProjects';
import { MyProjects } from './MyProjects';
import { ProjectNotifications } from './ProjectNotifications';
import { MyEmployeeRoster } from './MyEmployeeRoster';
import { MyEmployeeAnnouncements } from './MyEmployeeAnnouncements';
import { MyPerformance } from './MyPerformance';
import { MyLearning } from './MyLearning';
import { MyPayslips } from './MyPayslips';
import { EmployeeDocumentVault } from './EmployeeDocumentVault';
import { EmployeeIdentityCard } from './EmployeeIdentityCard';
import { EmployeeProfileFigma } from './EmployeeProfileFigma';
import { EmployeeProfileChangeRequests, ProfileChangeReview } from './ProfileChangeRequests';
import { EmployeeUpcomingTraining } from './EmployeeUpcomingTraining';
import { EmployeeUpcomingReviews } from './EmployeeUpcomingReviews';
import { EmployeeDashboardWork } from './EmployeeDashboardWork';
import { EmployeeDashboardPendingRequests, type PendingRequestKind } from './EmployeeDashboardPendingRequests';
import { EmployeeDashboardQuickAccess } from './EmployeeDashboardQuickAccess';
import { EmployeeLeaveCalendar } from './EmployeeLeaveCalendar';
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
import { JobCircularManager } from './JobCircularManager';
import { CandidatePreboardingQueue } from './CandidatePreboardingQueue';
import { EmployeeReferrals } from './EmployeeReferrals';
import { PlatformTenantWorkspace } from './PlatformTenantWorkspace';
import { platformTenantFeatureAvailable } from './platformTenantApi';
import { downloadCsv } from './csv';
import { projectText, type Locale } from './project-locale';
import {
  Activity, ArrowLeft, ArrowUpRight, Bell, BookOpen, BookOpenCheck, BriefcaseBusiness, Building2, CalendarCheck,
  CalendarDays, Check, CheckCircle2, ClipboardList, Clock3, Download, FileText, House, Info, LayoutDashboard, LogOut,
  Mail, MapPin, Megaphone, Menu, Phone, Receipt, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Target,
  UserRoundPlus, Users, X, XCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type TenantOption = { id: string; name: string; slug: string; timezone?: string | null };
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
  selfServiceManage: boolean;
  userManagement?: boolean;
};
type PageId = 'dashboard' | 'attendance' | 'shift-roster' | 'leave' | 'projects' | 'platform-tenants' | 'teams' | 'employees' | 'onboarding' | 'performance' | 'recruitment' | 'job-circulars' | 'referrals' | 'holidays' | 'learning-requests' | 'learning-completions' | 'learning-programs' | 'travel' | 'expenses' | 'payroll-register' | 'service-requests' | 'profile-change-review' | 'my-profile-changes' | 'my-profile' | 'my-dashboard' | 'my-projects' | 'my-roster' | 'my-notifications' | 'my-announcements' | 'my-performance' | 'my-learning' | 'my-payslips' | 'my-documents' | 'my-leave' | 'my-timesheets' | 'my-travel' | 'my-expenses' | 'my-service-requests' | 'user-management' | 'role-management';
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

async function openAttendanceEvidenceFile(
  path: string,
  translate: (source: string) => string,
  onError: (message: string) => void,
) {
  const tab = window.open('about:blank', '_blank');
  if (tab) tab.opener = null;
  try {
    const { data, error } = await supabase.storage.from('attendance-evidence').createSignedUrl(path, 60);
    if (error || !data?.signedUrl) throw error || new Error('Signed evidence link unavailable.');
    if (tab) tab.location.href = data.signedUrl;
    else window.location.assign(data.signedUrl);
  } catch {
    tab?.close();
    onError(translate('Unable to open the private evidence file.'));
  }
}
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
  payroll: false, payrollManage: false, selfServiceManage: false, userManagement: false,
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

function calculateLeaveDaysPreview(
  fromDate: string,
  toDate: string,
  portion: string,
  weeklyOffValue: unknown,
  holidaysValue: unknown,
): number | null {
  const toUtcDay = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
  };
  const start = toUtcDay(fromDate);
  const end = toUtcDay(toDate);
  if (start === null || end === null || end < start || !['full', 'first_half', 'second_half'].includes(portion)
      || !Array.isArray(weeklyOffValue) || !Array.isArray(holidaysValue)) return null;
  if (portion !== 'full' && fromDate !== toDate) return null;

  const dayMilliseconds = 86_400_000;
  const count = Math.floor((end - start) / dayMilliseconds) + 1;
  if (count > 3_660) return null;
  const weeklyOffDays = new Set(weeklyOffValue.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6));
  const holidays = holidaysValue.filter(asObject).map(value => value as Record<string, unknown>).flatMap(row => {
    const from = typeof row.start_date === 'string' ? toUtcDay(row.start_date) : null;
    const to = typeof row.end_date === 'string' ? toUtcDay(row.end_date) : null;
    return from !== null && to !== null && to >= from ? [{ from, to }] : [];
  });
  const isChargeableDay = (timestamp: number) => {
    const weekday = new Date(timestamp).getUTCDay();
    return !weeklyOffDays.has(weekday) && !holidays.some(holiday => timestamp >= holiday.from && timestamp <= holiday.to);
  };
  if (portion !== 'full') return isChargeableDay(start) ? 0.5 : 0;
  let chargeableDays = 0;
  for (let day = start; day <= end; day += dayMilliseconds) {
    if (isChargeableDay(day)) chargeableDays += 1;
  }
  return chargeableDays;
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

function formatRequestDate(value: unknown, locale: Locale): string {
  if (typeof value !== 'string' || !value.trim()) return display(value);
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = new Date(dateOnly ? `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T12:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).format(date).replaceAll('/', '-');
}

function displayShortDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return display(value);
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function displayWorkMode(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'Not recorded';
  return value.trim().replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function displayAttendanceStatus(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'Not recorded';
  return value.trim().replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function displayAttendanceClock(value: unknown, locale: Locale, timeZone?: string | null): string {
  if (typeof value !== 'string' || !value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  };
  if (timeZone) options.timeZone = timeZone;
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    ...options,
  }).format(date).replace(/\s/g, '').toLowerCase();
}

function displayAttendanceWorkLocation(value: unknown, locale: Locale): string {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase().replaceAll('_', ' ') : '';
  if (normalized === 'office' || normalized === 'work from office') return projectText(locale, 'Work from Office');
  if (normalized === 'home' || normalized === 'remote' || normalized === 'wfh' || normalized === 'work from home') return projectText(locale, 'Work from Home');
  if (normalized === 'client meeting') return projectText(locale, 'Client meeting');
  if (normalized === 'client') return projectText(locale, 'Client');
  if (normalized === 'field') return projectText(locale, 'Field');
  return projectText(locale, displayWorkMode(value));
}

function displayAttendanceDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return display(value);
  const [, year, month, day] = value.match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
  return `${day}-${month}-${year}`;
}

function displayDashboardDate(value: unknown, locale: Locale): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(date);
}

function displayAttendanceTime(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
    .replace(' AM', 'am').replace(' PM', 'pm');
}

function displayAttendanceLocation(value: unknown, locale: Locale): string {
  if (typeof value !== 'string' || !value.trim()) return 'Not recorded';
  const mode = value.trim().toLowerCase();
  if (mode === 'office') return projectText(locale, 'Work from Office');
  if (mode === 'home') return projectText(locale, 'Work from Home');
  if (mode === 'client_meeting') return projectText(locale, 'Client meeting');
  return displayWorkMode(value);
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
  label: string; value: unknown; icon?: ReactNode; onOpen?: () => void; compact?: boolean; emphasized?: boolean;
}) {
  const content = <>
    <span className={`flex items-center justify-between gap-2 ${compact ? 'text-sm font-bold text-[#49454F]' : 'text-sm text-slate-600'}`}>
      <span>{label}</span>
      {(icon || (compact && onOpen)) && <span className="inline-flex shrink-0 items-center gap-1 text-[#08558B]" aria-hidden="true">
        {icon && <span className={compact ? 'text-emerald-600' : ''}>{icon}</span>}
        {compact && onOpen && <ArrowUpRight className="h-[11px] w-[11px]" />}
      </span>}
    </span>
    <span className={`${compact ? 'mt-1 text-base font-normal' : 'mt-3 text-2xl font-semibold'} block tabular-nums text-slate-900`}>{display(value)}</span>
  </>;
  const className = compact
    ? `min-h-[67px] rounded-[4px] border border-[#E6EEF3] ${emphasized ? 'bg-[#E6EEF3]' : 'bg-white'} p-2 text-left ${onOpen ? 'hover:border-[#08558B] focus-visible:outline-2 focus-visible:outline-[#08558B]' : ''}`
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
  const dateLabel = (value: string) => {
    const date = new Date(`${value}T12:00:00`);
    const formatLocale = locale === 'bn' ? 'bn-BD' : 'en-US';
    return `${date.toLocaleDateString(formatLocale, { day: '2-digit' })} ${date.toLocaleDateString(formatLocale, { month: 'short' })}`;
  };
  return <div className="w-full min-w-0 overflow-x-auto">
    <svg viewBox="0 0 650 220" role="img" aria-labelledby="attendance-trend-title attendance-trend-description" className="min-w-[600px] w-full">
      <title id="attendance-trend-title">{locale === 'bn' ? `${tx('Attendance records over the last')} ${range} ${tx('days')}` : `Attendance records over the last ${range} days`}</title>
      <desc id="attendance-trend-description">{tx('Daily attendance record counts returned by the tenant-scoped HRIS dashboard service.')}</desc>
      <defs><linearGradient id="attendance-trend-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#08558B" stopOpacity="0.22" /><stop offset="100%" stopColor="#08558B" stopOpacity="0.02" /></linearGradient></defs>
      {[0, 1, 2, 3, 4, 5].map(i => {
        const y = 44 + i * 26.4;
        const tick = Math.round(max * (1 - i / 5));
        return <g key={i}>
          <line x1="58" x2="630" y1={y} y2={y} stroke="#e7eef0" />
          <text x="48" y={y + 4} textAnchor="end" fontSize="8" fill="#77838f">{tick}</text>
        </g>;
      })}
      {coords.filter((_, index) => safePoints.length <= 7 || index % 5 === 0 || index === safePoints.length - 1).map((point, index) =>
        <line key={`grid-${point.point.date}-${index}`} x1={point.x} x2={point.x} y1="44" y2="176" stroke="#e7eef0" />)}
      <path d={areaPath} fill="url(#attendance-trend-area)" />
      <path d={path} fill="none" stroke="#08558B" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((point, index) => <g key={`${point.point.date}-${index}`}>
        <circle cx={point.x} cy={point.y} r="5" fill="#fff" stroke="#08558B" strokeWidth="2" />
        {(safePoints.length <= 7 || index % 5 === 0 || index === safePoints.length - 1) &&
          <text x={point.x} y="190" textAnchor="middle" fontSize="8" fill="#615E83">
            {dateLabel(point.point.date)}
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
  const dashboardDate = displayDashboardDate(currentSummary?.dashboard_date, locale);
  const lastUpdatedTime = refreshedAt?.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const lastUpdatedLabel = lastUpdatedTime
    ? tx('Last Updated at {time}').replace('{time}', lastUpdatedTime)
    : '';
  const metrics: Array<{ label: string; value: unknown; icon?: ReactNode; page?: PageId; emphasized?: boolean }> = [
    { label: 'Team Members', value: currentSummary?.team_members ?? currentSummary?.employees, emphasized: true },
    { label: 'Present', value: currentSummary?.present_today, page: 'attendance' as PageId, emphasized: true },
    { label: 'Absent', value: currentSummary?.absent_today, page: 'attendance' as PageId, emphasized: true },
    { label: 'Work from Office', value: currentSummary?.wfo_today, page: 'attendance' as PageId },
    { label: 'Work From Home', value: currentSummary?.wfh_today, page: 'attendance' as PageId },
    { label: 'Client Meeting', value: currentSummary?.client_meeting_today, icon: <CheckCircle2 className="h-3.5 w-3.5" />, page: 'attendance' as PageId },
    { label: 'On Leave', value: currentSummary?.on_leave_today, page: 'leave' as PageId },
    { label: 'Late', value: currentSummary?.late_today, page: 'attendance' as PageId },
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
      totals.present_members += Number…85466 tokens truncated….lang = locale;
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
  const [userDirectoryRevision, setUserDirectoryRevision] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const [attendanceView, setAttendanceView] = useState<'information' | 'requests'>(() =>
    typeof window !== 'undefined' && window.location.hash === '#attendance-correction-requests' ? 'requests' : 'information');
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileMenuCloseRef = useRef<HTMLButtonElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const accountPanelRef = useRef<HTMLDivElement>(null);
  const [travelFocusRequestId, setTravelFocusRequestId] = useState<string | null>(null);
  const [leaveFocusRequestId, setLeaveFocusRequestId] = useState<string | null>(null);
  const [serviceRequestFocusId, setServiceRequestFocusId] = useState<string | null>(null);
  const [serviceRequestMovementPreset, setServiceRequestMovementPreset] = useState<'official' | 'personal' | 'client_meeting' | null>(null);
  const [rosterFocusDate, setRosterFocusDate] = useState<string | null>(null);
  const nav = useMemo(() => {
    const items: { id: PageId; label: string; icon: ReactNode; group: 'HRIS' | 'Personal' }[] = [];
    if (permissions.dashboard) items.push({ id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.attendance) items.push({ id: 'attendance', label: 'Attendance', icon: <CalendarCheck className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.attendanceView || permissions.attendanceManage) items.push({ id: 'shift-roster', label: 'Roster', icon: <Clock3 className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.leave) items.push({ id: 'leave', label: 'Leave', icon: <ClipboardList className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.organization || isSuperAdmin) {
      items.push({ id: 'projects', label: 'Projects', icon: <BriefcaseBusiness className="h-5 w-5" />, group: 'HRIS' });
      if (permissions.organization) items.push({ id: 'teams', label: 'Teams', icon: <Users className="h-5 w-5" />, group: 'HRIS' });
    }
    else if (isEmployee) items.push({ id: 'projects', label: 'Project Workspace', icon: <BriefcaseBusiness className="h-5 w-5" />, group: 'Personal' });
    if (isSuperAdmin && platformTenantFeatureAvailable) items.push({ id: 'platform-tenants', label: 'Platform tenants', icon: <Building2 className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.employees) items.push({ id: 'employees', label: 'Employees', icon: <Users className="h-5 w-5" />, group: 'HRIS' });
    if ((isSuperAdmin || permissions.userManagement) && tenantId) items.push({ id: 'user-management', label: locale === 'bn' ? 'ব্যবহারকারী ব্যবস্থাপনা' : 'User Management', icon: <UserRoundPlus className="h-5 w-5" />, group: 'HRIS' });
    if (isSuperAdmin && tenantId) items.push({ id: 'role-management', label: locale === 'bn' ? 'ভূমিকা ও অনুমতি' : 'Roles & Permissions', icon: <ShieldCheck className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.employeesManage) items.push({ id: 'onboarding', label: 'Onboarding', icon: <UserRoundPlus className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.employeesManage) items.push({ id: 'service-requests', label: 'Service Requests', icon: <ClipboardList className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.selfServiceManage) items.push({ id: 'profile-change-review', label: 'Profile corrections', icon: <FileText className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.performance) items.push({ id: 'performance', label: 'Performance', icon: <Target className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.recruitment) items.push({ id: 'recruitment', label: 'Candidate pipeline', icon: <Users className="h-5 w-5" />, group: 'HRIS' });
    if (permissions.recruitmentManage) items.push({ id: 'job-circulars', label: 'Job circulars', icon: <BriefcaseBusiness className="h-5 w-5" />, group: 'HRIS' });
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
    if (isEmployee) items.push({ id: 'my-announcements', label: 'Announcements', icon: <Megaphone className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-roster', label: 'My Roster', icon: <Clock3 className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-notifications', label: 'Notifications', icon: <Bell className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-performance', label: 'My Performance', icon: <Target className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-learning', label: 'My Learning', icon: <BookOpen className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-payslips', label: 'My Payslips', icon: <Receipt className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-documents', label: 'My Documents', icon: <FileText className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-profile', label: 'My Profile', icon: <Users className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-profile-changes', label: 'Profile requests', icon: <FileText className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-leave', label: 'My Leave', icon: <CalendarDays className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-timesheets', label: 'My Timesheets', icon: <Clock3 className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-travel', label: 'My Travel', icon: <MapPin className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-expenses', label: 'My Expenses', icon: <Receipt className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee) items.push({ id: 'my-service-requests', label: 'My Requests', icon: <ClipboardList className="h-5 w-5" />, group: 'Personal' });
    if (isEmployee && !permissions.referrals) items.push({ id: 'referrals', label: 'My Referrals', icon: <UserRoundPlus className="h-5 w-5" />, group: 'Personal' });
    return items;
  }, [permissions, isEmployee, isSuperAdmin, tenantId, locale]);

  const useHrOperationsView = /(?:^|[_\s-])hr[_\s-]operations(?:[_\s-]|$)/i.test(tenantRole);
  const hasAttendanceAndLeave = nav.some(item => item.id === 'attendance') && nav.some(item => item.id === 'leave');
  const localizedNav = useMemo(() => {
    const items = hasAttendanceAndLeave
      ? nav.filter(item => item.id !== 'leave').map(item => item.id === 'attendance' ? { ...item, label: 'Attendance & Leave' } : item)
      : nav;
    return items.map(item => ({ ...item, label: projectText(locale, item.label) }));
  }, [nav, locale, hasAttendanceAndLeave]);

  useEffect(() => {
    const syncWorkspaceHash = () => {
      const hash = window.location.hash;
      const requestsView = hash === '#attendance-correction-requests';
      const leaveView = hash === '#leave-requests' || hash === '#leave-calendar' || hash === '#leave-policy';
      if (requestsView && nav.some(item => item.id === 'attendance') && permissions.attendanceManage) {
        setPage('attendance');
        setAttendanceView('requests');
        return;
      }
      setAttendanceView('information');
      if (leaveView) {
        // Leave subroutes are owned by LeaveWorkspace. The shared shell only
        // selects the authorized module; it does not reinterpret the route.
        if (nav.some(item => item.id === 'leave')) setPage('leave');
        return;
      }
      if (requestsView) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    };
    syncWorkspaceHash();
    window.addEventListener('hashchange', syncWorkspaceHash);
    window.addEventListener('popstate', syncWorkspaceHash);
    return () => {
      window.removeEventListener('hashchange', syncWorkspaceHash);
      window.removeEventListener('popstate', syncWorkspaceHash);
    };
  }, [nav, permissions.attendanceManage]);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleMobileKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = document.querySelector<HTMLElement>('[data-mobile-navigation]');
      const focusable = panel?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleMobileKeyDown);
    mobileMenuCloseRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', handleMobileKeyDown);
      mobileMenuTriggerRef.current?.focus();
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!accountOpen) return;
    const handleAccountKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setAccountOpen(false);
      accountTriggerRef.current?.focus();
    };
    const closeOutside = (event: MouseEvent) => {
      if (!accountPanelRef.current?.contains(event.target as Node) && !accountTriggerRef.current?.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    };
    window.addEventListener('keydown', handleAccountKeyDown);
    document.addEventListener('mousedown', closeOutside);
    return () => {
      window.removeEventListener('keydown', handleAccountKeyDown);
      document.removeEventListener('mousedown', closeOutside);
    };
  }, [accountOpen]);

  useEffect(() => {
    if (nav.some(item => item.id === page)) return;
    setPage(nav[0]?.id || 'dashboard');
  }, [nav, page]);

  const roleLabel = isSuperAdmin ? 'Super Administrator' : permissions.dashboard || permissions.attendance || permissions.leave || permissions.organization || permissions.employees || permissions.employeesManage || permissions.performance || permissions.recruitment || permissions.holidayManage || permissions.learningManage || permissions.travel || permissions.expenses || permissions.payroll || permissions.selfServiceManage ? 'HRIS Administrator' : 'Employee';
  const tenantTimeZone = tenants.find(tenant => tenant.id === tenantId)?.timezone || null;
  const navigate = (next: PageId) => {
    if (next === 'leave') {
      const leaveHash = useHrOperationsView ? '#leave-requests' : '';
      if (window.location.hash !== leaveHash) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${leaveHash}`);
    } else if (['#leave-requests', '#leave-calendar', '#leave-policy'].includes(window.location.hash)) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    setPage(next);
    setMobileOpen(false);
    if (next !== 'attendance') {
      setAttendanceView('information');
      if (window.location.hash === '#attendance-correction-requests'
          || window.location.hash === '#leave-requests'
          || window.location.hash === '#leave-calendar'
          || window.location.hash === '#leave-policy') {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      }
    }
  };
  const setAttendanceSection = (next: 'information' | 'requests') => {
    setAttendanceView(next);
    const hash = next === 'requests' ? '#attendance-correction-requests' : '';
    const currentHash = window.location.hash;
    if (currentHash !== hash) window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  const setLeaveSection = (next: 'requests' | 'calendar' | 'policy') => {
    const hash = next === 'requests' ? '#leave-requests' : next === 'calendar' ? '#leave-calendar' : '#leave-policy';
    const currentHash = window.location.hash;
    if (currentHash === hash) return;
    const oldURL = window.location.href;
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
    // LeaveWorkspace owns these states and listens for hashchange. pushState
    // avoids native fragment scrolling that would hide the shared title band.
    if (page === 'leave') {
      window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: window.location.href }));
    }
  };
  const openTravelRequest = (requestId: string) => { setTravelFocusRequestId(requestId); navigate('my-travel'); };
  const clearTravelRequestFocus = (requestId: string) => setTravelFocusRequestId(currentId => currentId === requestId ? null : currentId);
  const openLeaveRequest = (requestId: string) => { setLeaveFocusRequestId(requestId); navigate('my-leave'); };
  const clearLeaveRequestFocus = (requestId: string) => setLeaveFocusRequestId(currentId => currentId === requestId ? null : currentId);
  const openServiceRequest = (requestId: string) => { setServiceRequestFocusId(requestId); navigate('my-service-requests'); };
  const clearServiceRequestFocus = (requestId: string) => setServiceRequestFocusId(currentId => currentId === requestId ? null : currentId);
  const current = localizedNav.find(item => item.id === page);

  const navigation = <nav aria-label="HRIS modules" className="flex flex-col gap-2 lg:gap-[14px]">
    {localizedNav.map(item => {
      const attendanceGroupActive = hasAttendanceAndLeave && item.id === 'attendance' && (page === 'attendance' || page === 'leave');
      const itemActive = attendanceGroupActive || page === item.id;
      return <button key={item.id} type="button" title={item.label} onClick={() => {
      if (item.id === 'my-roster') setRosterFocusDate(null);
      if (item.id === 'attendance' && hasAttendanceAndLeave) {
        setAttendanceSection('information');
        navigate('attendance');
      } else navigate(item.id);
    }} aria-current={itemActive ? 'page' : undefined}
      className={`group flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-[var(--color-figma-primary-600)] lg:min-h-0 lg:flex-col lg:justify-center lg:gap-2 lg:rounded-none lg:px-0 lg:py-0 lg:text-center ${itemActive ? 'bg-[#EFF7F8] text-[#49454F] lg:bg-transparent' : 'text-[#424242] hover:bg-slate-50 lg:hover:bg-transparent'}`}>
      <span data-sidebar-icon className={`grid h-[42px] w-[42px] shrink-0 place-items-center rounded-lg transition-colors ${itemActive ? 'bg-[var(--color-figma-primary-600)] text-white' : 'bg-white text-[#424242] group-hover:bg-slate-50'}`}>
        {item.icon}
      </span>
      <span data-sidebar-label className="min-w-0 max-w-[94px] flex-1 text-left text-[14px] font-normal leading-[normal] text-[#424242] lg:flex-none lg:line-clamp-2 lg:text-center">
        {item.label}
      </span>
    </button>;
    })}
  </nav>;

  return <div className="min-h-screen bg-[#EFF7F8] text-slate-900">
    <header className="sticky top-0 z-30 flex h-[72px] min-h-[72px] flex-nowrap items-center justify-between gap-2 border-b border-[#E9ECED] bg-white px-2 sm:px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button ref={mobileMenuTriggerRef} type="button" onClick={() => setMobileOpen(true)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[#DEE0E3] text-slate-700 focus-visible:outline-2 focus-visible:outline-[var(--color-figma-primary-600)] lg:hidden" aria-label="Open navigation menu"><Menu className="h-5 w-5" /></button>
        <img src={synesisItLogo} alt="Synesis IT" width={174} height={30} className="h-[25px] w-[145px] shrink-0 object-contain sm:h-[30px] sm:w-[174px]" />
      </div>
      <div className="relative flex shrink-0 items-center gap-2">
        <button type="button" onClick={() => setLocale(currentLocale => currentLocale === 'en' ? 'bn' : 'en')}
          aria-label={locale === 'en' ? 'Switch language to Bengali' : 'Switch language to English'}
          aria-pressed={locale === 'bn'} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-[#DEE0E3] bg-white px-2 text-sm font-semibold hover:bg-slate-50">
          {locale === 'en' ? 'EN' : 'বাংলা'}
        </button>
        <button type="button" disabled title="Notifications are unavailable" aria-label="Notifications unavailable" className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-lg bg-[#E6EEF3] text-[#424242] disabled:cursor-not-allowed">
          <Bell className="h-5 w-5" aria-hidden="true" />
        </button>
        <button ref={accountTriggerRef} type="button" aria-label="Account options" aria-expanded={accountOpen} aria-controls="workspace-account-panel" aria-haspopup="true"
          onClick={() => setAccountOpen(value => !value)} className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-lg bg-[#DCEFF4] text-sm font-semibold text-[var(--color-figma-primary-600)] focus-visible:outline-2 focus-visible:outline-[var(--color-figma-primary-600)]">
          {userEmail.slice(0, 1).toUpperCase()}
        </button>
        {accountOpen && <div ref={accountPanelRef} id="workspace-account-panel" role="region" aria-label="Account details" className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(20rem,calc(100vw-1rem))] rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-lg">
          <p className="truncate text-sm font-medium text-slate-900">{tenantName}</p>
          <p className="mt-1 break-all text-xs text-slate-600">{userEmail}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-600"><ShieldCheck className="h-4 w-4 shrink-0" />{roleLabel}</p>
          {tenants.length > 1 && <div className="mt-3"><label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="workspace-tenant">Organization</label><select id="workspace-tenant" value={tenantId} onChange={event => onTenantChange(event.target.value)} className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm">
            {tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
          </select></div>}
          <button type="button" onClick={() => { setAccountOpen(false); onSignOut(); }} className="mt-4 inline-flex min-h-10 w-full items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm hover:bg-slate-50"><LogOut className="h-4 w-4" />Sign out</button>
        </div>}
      </div>
    </header>
    <div className="flex min-h-[calc(100vh-4.5rem)]">
      <aside aria-label="Primary HRIS navigation" className="sticky top-[72px] hidden h-[calc(100vh-4.5rem)] w-[111px] shrink-0 overflow-y-auto border-r border-[#E9ECED] bg-white px-2 pb-4 pt-[30px] lg:block">{navigation}</aside>
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-6">
        <div className="mx-auto w-full max-w-none">
          {(page === 'attendance' || page === 'leave') ? (
            <section aria-label="Attendance and leave application management" className="-mx-4 -mt-5 mb-8 border-b border-[#E9ECED] bg-white sm:-mx-6 lg:-mx-6">
              <h1 className="flex min-h-[85px] items-center px-4 py-4 text-2xl font-normal text-[#49454F] sm:px-6 lg:px-6">
                {projectText(locale, 'Attendance & Leave Application Management')}
              </h1>
              <nav aria-label="Attendance and leave sections" className="flex min-h-[57px] min-w-0 gap-0 overflow-x-auto border-t border-slate-100 px-4 sm:px-6 lg:px-6">
                <button type="button" disabled={!nav.some(item => item.id === 'attendance')}
                  onClick={() => { setAttendanceSection('information'); navigate('attendance'); }} aria-current={page === 'attendance' && attendanceView === 'information' ? 'page' : undefined}
                  className={`inline-flex min-h-[57px] shrink-0 items-center border-b-[3px] px-6 text-base focus-visible:outline-2 focus-visible:outline-[var(--color-figma-primary-600)] disabled:cursor-not-allowed disabled:opacity-50 ${page === 'attendance' && attendanceView === 'information' ? 'border-[var(--color-figma-primary-600)] text-[#49454F]' : 'border-transparent text-[#49454F] hover:bg-slate-50'}`}>
                  {projectText(locale, 'Attendance Information')}
                </button>
                {permissions.attendanceManage ? <button type="button" onClick={() => { setAttendanceSection('requests'); navigate('attendance'); }} aria-current={page === 'attendance' && attendanceView === 'requests' ? 'page' : undefined}
                  className={`inline-flex min-h-[57px] shrink-0 items-center border-b-[3px] px-6 text-base focus-visible:outline-2 focus-visible:outline-[var(--color-figma-primary-600)] ${page === 'attendance' && attendanceView === 'requests' ? 'border-[var(--color-figma-primary-600)] text-[#49454F]' : 'border-transparent text-[#49454F] hover:bg-slate-50'}`}>
                  {projectText(locale, 'Attendance Requests')}
                </button> : <span aria-disabled="true" title="Attendance request management requires attendance.manage access"
                  className="inline-flex min-h-[57px] shrink-0 cursor-not-allowed items-center border-b-[3px] border-transparent px-6 text-base text-slate-400">
                  {projectText(locale, 'Attendance Requests')}
                </span>}
                <button type="button" disabled={!nav.some(item => item.id === 'leave')}
                  onClick={() => { navigate('leave'); setLeaveSection('requests'); }} aria-current={page === 'leave' ? 'page' : undefined}
                  className={`inline-flex min-h-[57px] shrink-0 items-center border-b-[3px] px-6 text-base focus-visible:outline-2 focus-visible:outline-[var(--color-figma-primary-600)] disabled:cursor-not-allowed disabled:opacity-50 ${page === 'leave' ? 'border-[var(--color-figma-primary-600)] text-[#49454F]' : 'border-transparent text-[#49454F] hover:bg-slate-50'}`}>
                  {projectText(locale, 'Leave Requests')}
                </button>
                {nav.some(item => item.id === 'my-leave') ? (
                  <button type="button" onClick={() => navigate('my-leave')}
                    className="inline-flex min-h-[57px] shrink-0 items-center border-b-[3px] border-transparent px-6 text-base text-[#49454F] hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-[var(--color-figma-primary-600)]">
                    {projectText(locale, 'Personal Leave Application History')}
                  </button>
                ) : (
                  <span aria-disabled="true" title="Personal leave history requires employee self-service access"
                    className="inline-flex min-h-[57px] shrink-0 cursor-not-allowed items-center border-b-[3px] border-transparent px-6 text-base text-slate-400">
                    {projectText(locale, 'Personal Leave Application History')}
                  </span>
                )}
              </nav>
            </section>
          ) : current && page !== 'dashboard' && <div className="mb-4 flex items-center gap-2 text-xs text-slate-500"><span>{tenantName}</span><span aria-hidden="true">/</span><span className="text-slate-700">{current.label}</span></div>}
          {page === 'dashboard' && permissions.dashboard && <LiveDashboard tenantId={tenantId} onOpen={navigate} canReport={permissions.attendanceReport} locale={locale} />}
          {page === 'attendance' && permissions.attendance && ((useHrOperationsView || attendanceView === 'requests')
            ? <HrAttendanceReport tenantId={tenantId} canView={permissions.attendanceView} canReport={permissions.attendanceReport} canManage={permissions.attendanceManage} locale={locale} view={attendanceView} />
            : <AttendanceReport tenantId={tenantId} tenantTimeZone={tenantTimeZone} canView={permissions.attendanceView} canReport={permissions.attendanceReport} canManage={permissions.attendanceManage} locale={locale} view={attendanceView} />
          )}
          {page === 'shift-roster' && (permissions.attendanceView || permissions.attendanceManage) && <ShiftRoster tenantId={tenantId} canManage={permissions.attendanceManage} locale={locale} />}
          {page === 'leave' && permissions.leave && (useHrOperationsView ? <HrLeaveWorkspace tenantId={tenantId} canManage={permissions.leaveManage} locale={locale} /> : <LeaveWorkspace tenantId={tenantId} canManage={permissions.leaveManage} locale={locale} />)}
          {page === 'projects' && (permissions.organization || isSuperAdmin || isEmployee) && <>
            <OrganizationProjects tenantId={tenantId} locale={locale} />
            {isEmployee && <ProjectTimesheetReviewQueue tenantId={tenantId} locale={locale} />}
          </>}
          {page === 'teams' && permissions.organization && <OrganizationTeams tenantId={tenantId} locale={locale} />}
          {page === 'employees' && permissions.employees && <OrganizationEmployeeDirectory tenantId={tenantId} locale={locale} employeesManage={permissions.employeesManage} />}
          {page === 'user-management' && (isSuperAdmin || permissions.userManagement) && tenantId && <div className="space-y-6">
            <RealLinkedUserDirectory tenantId={tenantId} tenantName={tenantName} locale={locale}
              canManage={isSuperAdmin || permissions.userManagement === true} isSuperAdmin={isSuperAdmin} revision={userDirectoryRevision}
              onSaved={() => setUserDirectoryRevision(value => value + 1)} />
            <RealUserProvisioningReadiness tenantId={tenantId} tenantName={tenantName} locale={locale}
              onCreated={() => setUserDirectoryRevision(value => value + 1)} />
          </div>}
          {page === 'role-management' && isSuperAdmin && tenantId && <RealRoleManagement tenantId={tenantId} tenantName={tenantName} locale={locale} />}
          {page === 'onboarding' && permissions.employeesManage && <CandidatePreboardingQueue tenantId={tenantId} locale={locale} canActivate={permissions.employeesManage} />}
          {page === 'service-requests' && permissions.employeesManage && <ServiceRequestReview tenantId={tenantId} locale={locale} />}
          {page === 'profile-change-review' && permissions.selfServiceManage && <ProfileChangeReview tenantId={tenantId} locale={locale} />}
          {page === 'performance' && permissions.performance && <OrganizationPerformance tenantId={tenantId} />}
          {page === 'recruitment' && permissions.recruitment && <RecruitmentPipeline tenantId={tenantId} locale={locale} canManagePreboarding={permissions.recruitmentManage} canManageOffers={permissions.recruitmentManage} canManageApplicationStages={permissions.recruitmentManage} />}
          {page === 'job-circulars' && permissions.recruitmentManage && <JobCircularManager tenantId={tenantId} refreshKey={0} locale={locale} />}
          {page === 'referrals' && (isEmployee || permissions.referrals) && <EmployeeReferrals tenantId={tenantId} userId={userId} canViewQueue={permissions.referrals} canManage={permissions.referralsManage} />}
          {page === 'holidays' && permissions.holidayManage && <OrganizationHolidayCalendar tenantId={tenantId} locale={locale} />}
          {page === 'learning-programs' && permissions.learningManage && <LearningProgramAdmin tenantId={tenantId} locale={locale} />}
          {page === 'learning-requests' && permissions.learningManage && <LearningRequests tenantId={tenantId} locale={locale} />}
          {page === 'learning-completions' && permissions.learningManage && <LearningCompletionQueue tenantId={tenantId} locale={locale} />}
          {page === 'travel' && permissions.travel && <TravelRequests tenantId={tenantId} canManage={permissions.travelManage} locale={locale} />}
          {page === 'expenses' && permissions.expenses && <ExpenseClaims tenantId={tenantId} userId={userId} mode="queue" canManage={permissions.expensesManage} />}
          {page === 'payroll-register' && permissions.payroll && <PayrollRegister tenantId={tenantId} />}
          {page === 'platform-tenants' && isSuperAdmin && platformTenantFeatureAvailable && <PlatformTenantWorkspace locale={locale} />}
          {page === 'my-dashboard' && isEmployee && <EmployeeOverview tenantId={tenantId} tenantName={tenantName} userId={userId} locale={locale}
            onOpenLearning={() => navigate('my-learning')} onOpenProjects={() => navigate('my-projects')}
            onOpenPerformance={() => navigate('my-performance')} onOpenAnnouncements={() => navigate('my-announcements')}
            onOpenPendingRequest={kind => navigate(({ leave: 'my-leave', attendance: 'my-dashboard', expense: 'my-expenses', travel: 'my-travel', service: 'my-service-requests', learning: 'my-learning' } as const)[kind])}
            onOpenLeave={() => navigate('my-leave')} onOpenPayslips={() => navigate('my-payslips')}
            onOpenRequests={() => navigate('my-service-requests')}
            onOpenClientMeeting={() => { setServiceRequestMovementPreset('client_meeting'); navigate('my-service-requests'); }} />}
          {page === 'my-projects' && isEmployee && <>
            <MyProjects tenantId={tenantId} locale={locale} />
            <ProjectTimesheetReviewQueue tenantId={tenantId} locale={locale} />
          </>}
          {page === 'my-roster' && isEmployee && <MyEmployeeRoster tenantId={tenantId} locale={locale} focusDate={rosterFocusDate} />}
          {page === 'my-announcements' && isEmployee && <MyEmployeeAnnouncements tenantId={tenantId} locale={locale} />}
          {page === 'my-notifications' && isEmployee && <ProjectNotifications tenantId={tenantId} locale={locale}
            onOpenProjects={() => navigate('my-projects')} onOpenLearning={() => navigate('my-learning')}
            onOpenTravel={openTravelRequest} onOpenLeave={openLeaveRequest} onOpenServiceRequest={openServiceRequest}
            onOpenRoster={assignmentDate => { setRosterFocusDate(assignmentDate); navigate('my-roster'); }} />}
          {page === 'my-performance' && isEmployee && <MyPerformance tenantId={tenantId} userId={userId} locale={locale} />}
          {page === 'my-learning' && isEmployee && <MyLearning tenantId={tenantId} locale={locale} />}
          {page === 'my-payslips' && isEmployee && <MyPayslips tenantId={tenantId} />}
          {page === 'my-documents' && isEmployee && <EmployeeDocumentVault tenantId={tenantId} userId={userId} locale={locale} />}
          {page === 'my-profile' && isEmployee && <EmployeeProfileFigma tenantId={tenantId} locale={locale} />}
          {page === 'my-profile-changes' && isEmployee && <EmployeeProfileChangeRequests tenantId={tenantId} locale={locale} />}
          {page === 'my-leave' && isEmployee && <EmployeePersonalLeave tenantId={tenantId} tenantName={tenantName} userId={userId}
            focusRequestId={leaveFocusRequestId} onFocusHandled={clearLeaveRequestFocus} locale={locale} />}
          {page === 'my-timesheets' && isEmployee && <EmployeeTimesheets tenantId={tenantId} tenantName={tenantName} locale={locale} />}
          {page === 'my-travel' && isEmployee && <MyTravelRequests tenantId={tenantId} locale={locale}
            focusRequestId={travelFocusRequestId} onFocusHandled={clearTravelRequestFocus} />}
          {page === 'my-expenses' && isEmployee && <ExpenseClaims tenantId={tenantId} userId={userId} mode="personal" />}
          {page === 'my-service-requests' && isEmployee && <MyServiceRequests tenantId={tenantId} locale={locale}
            focusRequestId={serviceRequestFocusId} onFocusHandled={clearServiceRequestFocus}
            initialMovementType={serviceRequestMovementPreset}
            onInitialMovementHandled={() => setServiceRequestMovementPreset(null)} />}
          {!nav.length && <section className="mx-auto mt-12 max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-[#08558B]" /><h2 className="mt-3 text-lg font-semibold">No HRIS modules are available for this account</h2>
            <p className="mt-2 text-sm text-slate-600">Your sign-in succeeded, but no active employee link or supported module permission was returned. No sample records are shown.</p>
          </section>}
        </div>
      </main>
    </div>
    {mobileOpen && <div className="fixed inset-0 z-50 bg-slate-950/40 lg:hidden" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setMobileOpen(false); }}>
      <div data-mobile-navigation role="dialog" aria-modal="true" aria-label="HRIS navigation" className="h-full w-72 max-w-[85vw] overflow-y-auto border-r border-[#E9ECED] bg-white p-4 text-slate-900 shadow-xl">
        <div className="mb-3 flex items-center justify-between"><span className="font-semibold">{projectText(locale, 'Navigation')}</span><button ref={mobileMenuCloseRef} type="button" onClick={() => setMobileOpen(false)} className="min-h-11 min-w-11 rounded-lg border focus-visible:outline-2 focus-visible:outline-[var(--color-figma-primary-600)]" aria-label="Close navigation menu"><X className="mx-auto h-4 w-4" /></button></div>
        {navigation}
      </div>
    </div>}
  </div>;
}

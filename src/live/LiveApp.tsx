import React, { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { Database, LockKeyhole, LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { tenantAttendanceDate, tenantAttendanceDateTime, tenantAttendanceTime } from './attendanceDate.mjs';
import { RecoveryLinkFallback, redeemRecoveryToken } from './RecoveryLinkFallback';
import { LiveSystemWorkspace } from './LiveSystemWorkspace';

type Membership = { tenant_id: string; role: string; status: string };
type Tenant = { id: string; name: string; slug: string; timezone: string | null };
type Employee = { id: string; full_name: string; employee_number: string; employment_status: string };
type DashboardProfile = { full_name: string; preferred_name: string | null; employee_number: string; official_email: string | null; personal_email: string | null; phone: string | null; official_phone: string | null; gender: string | null; date_of_birth: string | null; nationality: string | null; marital_status: string | null; employment_status: string };
type Department = { id: string; name: string; code: string };
type Leave = { id: string; from_date: string; to_date: string; requested_days: number; status: string };
type LeaveType = { id: string; name: string; annual_entitlement: number | null };
type LeaveBalance = { leave_type_id: string; leave_type_name: string; balance_year: number; available_days: number; used_days: number; pending_days: number };
type Holiday = { id: string; name: string; start_date: string; end_date: string; holiday_type: string | null; description: string | null };
type DashboardTraining = { id: string; title: string; institute_name: string | null; start_date: string | null; end_date: string | null };
type DashboardCycle = { id: string; name: string; start_date: string; end_date: string; self_review_deadline: string | null; manager_review_deadline: string | null; status: string };
type DashboardLearningSession = { id: string; title: string; start_at: string; end_at: string | null; location: string | null };
type DashboardInterview = { id: string; job_title: string; interview_type: string; scheduled_at: string; location_or_link: string | null };
type DashboardSchedule = { training: DashboardTraining[]; performance_cycles: DashboardCycle[]; learning_sessions: DashboardLearningSession[]; interviews: DashboardInterview[] };
type DashboardGoal = { id: string; title: string; category: string; target_metric: string | null; current_progress: number; due_date: string | null; status: string; origin: 'assigned' | 'personal' };
type DashboardNotice = { id: string; title: string; category: string; body: string; published_at: string; pinned: boolean };
type DashboardActionRequest = { id: string; category: string; title: string; status: string; requestDate: string | null; submittedAt: string | null };
type AttendanceToday = { status: string; work_mode: string; check_in: string | null; check_out: string | null };
type DashboardPayslip = { id: string; pay_period_name: string; pay_date: string | null; currency: string; net_salary: number; basic_salary: number | null; house_rent_allowance: number | null; medical_allowance: number | null; transport_allowance: number | null; special_allowance: number | null; overtime_pay: number | null; bonus: number | null; tax_deduction: number | null; provident_fund_deduction: number | null; leave_without_pay_deduction: number | null; other_deductions: number | null; gross_earnings: number | null; total_deductions: number | null };
type Records = { employees: Employee[]; departments: Department[]; leaves: Leave[]; leaveTypes: LeaveType[]; leaveBalances: LeaveBalance[]; holidays: Holiday[]; dashboardSchedule: DashboardSchedule; scheduleError: boolean; goals: DashboardGoal[]; goalsError: boolean; notices: DashboardNotice[]; noticesError: boolean; pendingRequests: DashboardActionRequest[]; pendingRequestErrors: string[]; attendanceToday: AttendanceToday | null; employeeProfile: DashboardProfile | null; payslips: DashboardPayslip[]; payslipsError: boolean };
type View = 'employee' | 'admin' | 'preview' | 'system';
const emptyDashboardSchedule = (): DashboardSchedule => ({ training: [], performance_cycles: [], learning_sessions: [], interviews: [] });
function normalizeDashboardSchedule(value: unknown): DashboardSchedule {
  const schedule = value && typeof value === 'object' ? value as Partial<DashboardSchedule> : {};
  return {
    training: Array.isArray(schedule.training) ? schedule.training : [],
    performance_cycles: Array.isArray(schedule.performance_cycles) ? schedule.performance_cycles : [],
    learning_sessions: Array.isArray(schedule.learning_sessions) ? schedule.learning_sessions : [],
    interviews: Array.isArray(schedule.interviews) ? schedule.interviews : [],
  };
}
function normalizeDashboardGoals(value: unknown): DashboardGoal[] {
  if (!value || typeof value !== 'object') return [];
  const goals = (value as { goals?: unknown }).goals;
  if (!Array.isArray(goals)) return [];
  return goals.filter((goal): goal is DashboardGoal => Boolean(goal && typeof goal === 'object'
    && typeof (goal as DashboardGoal).id === 'string'
    && typeof (goal as DashboardGoal).title === 'string'
    && typeof (goal as DashboardGoal).status === 'string'));
}
function goalIsOverdue(goal: DashboardGoal, today: string) {
  return Boolean(goal.due_date && goal.due_date < today && !['completed', 'cancelled'].includes(goal.status));
}
function normalizeDashboardNotices(value: unknown): DashboardNotice[] {
  if (!value || typeof value !== 'object') return [];
  const notices = (value as { notices?: unknown }).notices;
  if (!Array.isArray(notices)) return [];
  return notices.filter((notice): notice is DashboardNotice => Boolean(notice && typeof notice === 'object'
    && typeof (notice as DashboardNotice).id === 'string'
    && typeof (notice as DashboardNotice).title === 'string'
    && typeof (notice as DashboardNotice).category === 'string'
    && typeof (notice as DashboardNotice).body === 'string'
    && typeof (notice as DashboardNotice).published_at === 'string'
    && Number.isFinite(Date.parse((notice as DashboardNotice).published_at))
    && Date.parse((notice as DashboardNotice).published_at) <= Date.now()))
    .map(notice => ({ ...notice, pinned: notice.pinned === true }));
}
function normalizePendingRequests(value: unknown, category: string, pendingStatuses: string[], titleFor: (row: Record<string, unknown>) => string): DashboardActionRequest[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): DashboardActionRequest[] => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const status = typeof row.status === 'string' ? row.status.toLowerCase() : '';
    if (typeof row.id !== 'string' || !pendingStatuses.includes(status)) return [];
    const requestDate = [row.attendance_date, row.from_date, row.claim_date].find(field => typeof field === 'string');
    const submittedAt = [row.requested_at, row.submitted_at, row.created_at].find(field => typeof field === 'string');
    return [{
      id: row.id,
      category,
      title: titleFor(row),
      status,
      requestDate: typeof requestDate === 'string' ? requestDate : null,
      submittedAt: typeof submittedAt === 'string' ? submittedAt : null,
    }];
  });
}
function normalizeDashboardPayslips(value: unknown): DashboardPayslip[] {
  if (!Array.isArray(value)) return [];
  const amount = (row: Record<string, unknown>, field: string): number | null => {
    const parsed = typeof row[field] === 'number' ? row[field] : typeof row[field] === 'string' ? Number(row[field]) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  };
  return value.flatMap((item): DashboardPayslip[] => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const netSalary = amount(row, 'net_salary');
    if (typeof row.id !== 'string' || row.status !== 'released' || netSalary === null) return [];
    const currency = typeof row.currency === 'string' && /^[A-Z]{3}$/.test(row.currency) ? row.currency : '---';
    return [{
      id: row.id,
      pay_period_name: typeof row.pay_period_name === 'string' ? row.pay_period_name : 'Payslip',
      pay_date: typeof row.pay_date === 'string' ? row.pay_date : null,
      currency,
      net_salary: netSalary,
      basic_salary: amount(row, 'basic_salary'),
      house_rent_allowance: amount(row, 'house_rent_allowance'),
      medical_allowance: amount(row, 'medical_allowance'),
      transport_allowance: amount(row, 'transport_allowance'),
      special_allowance: amount(row, 'special_allowance'),
      overtime_pay: amount(row, 'overtime_pay'),
      bonus: amount(row, 'bonus'),
      tax_deduction: amount(row, 'tax_deduction'),
      provident_fund_deduction: amount(row, 'provident_fund_deduction'),
      leave_without_pay_deduction: amount(row, 'leave_without_pay_deduction'),
      other_deductions: amount(row, 'other_deductions'),
      gross_earnings: amount(row, 'gross_earnings'),
      total_deductions: amount(row, 'total_deductions'),
    }];
  });
}
function formatPayslipAmount(amount: number, currency: string) {
  return `${currency} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
}
function contextRows(value: unknown, key: string): unknown[] {
  if (!value || typeof value !== 'object') return [];
  const rows = (value as Record<string, unknown>)[key];
  return Array.isArray(rows) ? rows : [];
}
const empty = (): Records => ({ employees: [], departments: [], leaves: [], leaveTypes: [], leaveBalances: [], holidays: [], dashboardSchedule: emptyDashboardSchedule(), scheduleError: false, goals: [], goalsError: false, notices: [], noticesError: false, pendingRequests: [], pendingRequestErrors: [], attendanceToday: null, employeeProfile: null, payslips: [], payslipsError: false });

function attendanceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    present: 'Present',
    late: 'Late',
    absent: 'Absent',
    on_leave: 'On leave',
    holiday: 'Holiday',
    weekend: 'Weekend',
    missing: 'No attendance recorded',
    partial: 'Partial attendance',
  };
  return labels[status] || 'Status unavailable';
}

function attendanceWorkModeLabel(workMode: string) {
  const labels: Record<string, string> = {
    office: 'Working on-site',
    home: 'Working remotely',
    client: 'Working at a client site',
    field: 'Working in the field',
  };
  return labels[workMode] || '';
}

function attendanceDateLabel(now: Date, timeZone: string | null) {
  return `Today · ${tenantAttendanceDate(now, timeZone || 'UTC')}`;
}

function EmployeeProfileSection({ profile, onSaved }: { profile: DashboardProfile; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [form, setForm] = useState({
    preferred_name: profile.preferred_name || '',
    gender: profile.gender || '',
    date_of_birth: profile.date_of_birth || '',
    nationality: profile.nationality || '',
    marital_status: profile.marital_status || '',
  });
  useEffect(() => {
    setForm({
      preferred_name: profile.preferred_name || '',
      gender: profile.gender || '',
      date_of_birth: profile.date_of_birth || '',
      nationality: profile.nationality || '',
      marital_status: profile.marital_status || '',
    });
    setError('');
  }, [profile]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const { error: updateError } = await supabase.rpc('employee_update_my_profile', { p_payload: {
        preferred_name: form.preferred_name.trim(),
        gender: form.gender,
        date_of_birth: form.date_of_birth,
        nationality: form.nationality.trim(),
        marital_status: form.marital_status.trim(),
      } });
      if (updateError) throw updateError;
      setEditing(false);
      setSaved('Personal information saved.');
      onSaved();
    } catch {
      setError('Unable to save your personal information. Refresh and try again.');
    } finally {
      setSaving(false);
    }
  }

  return <section id="employee-profile" aria-label="My profile" className="scroll-mt-24 bg-white border rounded-lg overflow-hidden">
    <div className="border-b p-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">My profile</h2><p className="text-xs text-slate-500">Personal information from your linked employee record</p></div>{!editing && <button type="button" className="min-h-10 rounded-md border px-3 text-sm" onClick={() => { setError(''); setSaved(''); setEditing(true); }}>Edit personal information</button>}</div>
    {saved && <p role="status" className="border-b p-3 text-sm text-emerald-800">{saved}</p>}
    {error && <p role="alert" className="border-b p-3 text-sm text-red-800">{error}</p>}
    {editing ? <form className="p-4" onSubmit={submit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label htmlFor="employee-profile-preferred-name" className="block text-xs font-medium text-slate-600">Preferred name</label><input id="employee-profile-preferred-name" maxLength={120} className="mt-1 min-h-11 w-full rounded-md border px-3" value={form.preferred_name} onChange={event => setForm(value => ({ ...value, preferred_name: event.target.value }))}/></div>
        <div><label htmlFor="employee-profile-gender" className="block text-xs font-medium text-slate-600">Gender</label><select id="employee-profile-gender" className="mt-1 min-h-11 w-full rounded-md border px-3" value={form.gender} onChange={event => setForm(value => ({ ...value, gender: event.target.value }))}><option value="">Not provided</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select></div>
        <div><label htmlFor="employee-profile-date-of-birth" className="block text-xs font-medium text-slate-600">Date of birth</label><input id="employee-profile-date-of-birth" type="date" max={new Date().toISOString().slice(0, 10)} className="mt-1 min-h-11 w-full rounded-md border px-3" value={form.date_of_birth} onChange={event => setForm(value => ({ ...value, date_of_birth: event.target.value }))}/></div>
        <div><label htmlFor="employee-profile-nationality" className="block text-xs font-medium text-slate-600">Nationality</label><input id="employee-profile-nationality" maxLength={100} className="mt-1 min-h-11 w-full rounded-md border px-3" value={form.nationality} onChange={event => setForm(value => ({ ...value, nationality: event.target.value }))}/></div>
        <div><label htmlFor="employee-profile-marital-status" className="block text-xs font-medium text-slate-600">Marital status</label><input id="employee-profile-marital-status" maxLength={100} className="mt-1 min-h-11 w-full rounded-md border px-3" value={form.marital_status} onChange={event => setForm(value => ({ ...value, marital_status: event.target.value }))}/></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><button type="submit" disabled={saving} className="min-h-10 rounded-md bg-[#085587] px-4 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save personal information'}</button><button type="button" disabled={saving} className="min-h-10 rounded-md border px-4 text-sm" onClick={() => { setForm({ preferred_name: profile.preferred_name || '', gender: profile.gender || '', date_of_birth: profile.date_of_birth || '', nationality: profile.nationality || '', marital_status: profile.marital_status || '' }); setEditing(false); setError(''); }}>Cancel</button></div>
    </form> : <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm">
      <div><dt className="text-xs text-slate-500">Full name</dt><dd className="font-medium">{profile.full_name || 'Not provided'}</dd></div>
      <div><dt className="text-xs text-slate-500">Preferred name</dt><dd className="font-medium">{profile.preferred_name || 'Not provided'}</dd></div>
      <div><dt className="text-xs text-slate-500">Employee number</dt><dd className="font-medium">{profile.employee_number || 'Not provided'}</dd></div>
      <div><dt className="text-xs text-slate-500">Official email</dt><dd className="font-medium">{profile.official_email || 'Not provided'}</dd></div>
      <div><dt className="text-xs text-slate-500">Personal email</dt><dd className="font-medium">{profile.personal_email || 'Not provided'}</dd></div>
      <div><dt className="text-xs text-slate-500">Personal phone</dt><dd className="font-medium">{profile.phone || 'Not provided'}</dd></div>
      <div><dt className="text-xs text-slate-500">Official phone</dt><dd className="font-medium">{profile.official_phone || 'Not provided'}</dd></div>
      <div><dt className="text-xs text-slate-500">Gender</dt><dd className="font-medium">{profile.gender || 'Not provided'}</dd></div>
      <div><dt className="text-xs text-slate-500">Date of birth</dt><dd className="font-medium">{profile.date_of_birth || 'Not provided'}</dd></div>
      <div><dt className="text-xs text-slate-500">Nationality</dt><dd className="font-medium">{profile.nationality || 'Not provided'}</dd></div>
      <div><dt className="text-xs text-slate-500">Marital status</dt><dd className="font-medium">{profile.marital_status || 'Not provided'}</dd></div>
      <div><dt className="text-xs text-slate-500">Employment status</dt><dd className="font-medium capitalize">{profile.employment_status.replace(/_/g, ' ')}</dd></div>
    </dl>}
  </section>;
}

function SignIn({ onSuccess, onRecoveryVerified, recoveryLinkError }: {
  onSuccess: (value: User) => void;
  onRecoveryVerified: (value: User) => void;
  recoveryLinkError?: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(Boolean(recoveryLinkError));
  useEffect(() => { if (recoveryLinkError) setForgotPassword(true); }, [recoveryLinkError]);
  const [resetRequested, setResetRequested] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(), password,
      });
      if (authError) { setError(authError.message); return; }
      if (!data.user) { setError('No authenticated user was returned.'); return; }
      setPassword('');
      onSuccess(data.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication service is unavailable. Try again.');
    } finally {
      setBusy(false);
    }
  }
  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const callback = new URL(import.meta.env.BASE_URL || '/', window.location.origin).toString();
      const result = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: callback });
      if (result.error) {
        if (/rate limit|only request this after|too many/i.test(result.error.message)) {
          setError('Too many recovery requests. Wait a minute, then try again.');
          return;
        }
        throw result.error;
      }
      setResetRequested(true);
    } catch {
      setError('Unable to request a recovery link. Please try again later.');
    } finally {
      setBusy(false);
    }
  }
  if (forgotPassword) return <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4"><section className="bg-white border border-slate-200 rounded-xl p-6 w-full max-w-md">
    <h1 className="text-2xl font-bold">Reset your password</h1>
    <p className="text-sm text-slate-600 mt-2">Request a recovery email for the specific account you need to recover. Admin and Super Admin may use different email addresses.</p>
    {recoveryLinkError && <p role="alert" className="mt-3 text-red-700 text-sm">{recoveryLinkError}</p>}
    {resetRequested ? <p role="status" className="mt-4 rounded-md bg-blue-50 p-3 text-sm">If an account exists for this email, a reset link has been requested.</p> : <form className="mt-5 space-y-4" onSubmit={requestRecovery}>
      <div><label htmlFor="recovery-email" className="block text-sm font-medium">Account email</label><input id="recovery-email" type="email" required autoComplete="email" className="border rounded-md px-3 min-h-11 w-full" value={email} onChange={e => setEmail(e.target.value)}/></div>
      {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
      <button disabled={busy} type="submit" className="min-h-11 rounded-md bg-[#085587] text-white w-full disabled:opacity-50">{busy ? 'Requesting…' : 'Send reset link'}</button>
    </form>}
    <RecoveryLinkFallback onVerified={onRecoveryVerified} />
    <button type="button" className="min-h-11 mt-3 underline text-sm text-blue-800" onClick={() => { setForgotPassword(false); setResetRequested(false); setError(''); }}>Back to sign in</button>
  </section></main>;
  return <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 sm:p-8 w-full max-w-md">
      <p className="text-xs font-semibold text-blue-900">Synesis HRIS 360°</p>
      <h1 className="text-2xl font-bold mt-2">Sign in to your workspace</h1>
      <p className="text-sm text-slate-600 mt-2">Use an existing authorized Supabase account. Live records are restricted by the database permissions.</p>
      <form onSubmit={submit} className="space-y-4 mt-6">
        <div><label className="block text-sm font-medium mb-1" htmlFor="hris-email">Email</label><input required id="hris-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} className="w-full min-h-11 px-3 rounded-md border border-slate-300 focus:outline-2 focus:outline-blue-700" /></div>
        <div><label className="block text-sm font-medium mb-1" htmlFor="hris-password">Password</label><input required id="hris-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full min-h-11 px-3 rounded-md border border-slate-300 focus:outline-2 focus:outline-blue-700" /></div>
        {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
        <button type="submit" disabled={busy} className="min-h-11 w-full rounded-md bg-[#085587] hover:bg-[#074770] text-white font-semibold disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <button type="button" className="min-h-11 text-blue-800 underline text-sm mt-3" onClick={() => { setForgotPassword(true); setError(''); }}>Forgot password?</button>
    </div>
  </main>;
}

function PasswordUpdate({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 12) { setError('Please use at least 12 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      const changed = await supabase.auth.updateUser({ password });
      if (changed.error) throw changed.error;
      const ended = await supabase.auth.signOut();
      if (ended.error) throw ended.error;
      window.history.replaceState(null, '', new URL(import.meta.env.BASE_URL || '/', window.location.origin).pathname);
      onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update password.');
    } finally { setBusy(false); }
  }
  return <main className="min-h-screen grid place-items-center p-4 bg-slate-50"><section className="rounded-xl border p-6 bg-white max-w-md w-full"><h1 className="text-2xl font-bold">Choose a new password</h1>
    <form onSubmit={update} className="mt-5 space-y-4">
      <div><label htmlFor="new-password" className="block text-sm">New password</label><input id="new-password" type="password" autoComplete="new-password" required minLength={12} className="min-h-11 border rounded-md px-3 w-full" value={password} onChange={e=>setPassword(e.target.value)}/></div>
      <div><label htmlFor="confirm-new-password" className="block text-sm">Confirm password</label><input id="confirm-new-password" type="password" autoComplete="new-password" required minLength={12} className="min-h-11 border rounded-md px-3 w-full" value={confirm} onChange={e=>setConfirm(e.target.value)}/></div>
      {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
      <button disabled={busy} className="w-full min-h-11 rounded-md bg-[#085587] text-white" type="submit">{busy?'Updating…':'Update password'}</button>
    </form>
  </section></main>;
}

export function LiveApp({ preview }: { preview: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [recoveryLinkError, setRecoveryLinkError] = useState('');
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [adminAllowed, setAdminAllowed] = useState(false);
  const [recruitmentAllowed, setRecruitmentAllowed] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  // Legacy permissions are globally stored, therefore valid for Synesis only.
  const canAdminSelectedTenant = adminAllowed && tenants.some(t => t.id === tenantId && t.slug === 'synesis-it');
  const canUseSystemWorkspace = canAdminSelectedTenant || (recruitmentAllowed && tenants.some(t => t.id === tenantId && t.slug === 'synesis-it'));
  const previewEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_PREVIEW === 'true';
  const [view, setView] = useState<View>('system');
  const currentView = (view === 'admin' && !canAdminSelectedTenant) || (view === 'system' && !canUseSystemWorkspace) ? 'employee' : view;
  const [records, setRecords] = useState<Records>(empty);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const lastAccessUserId = useRef<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data, error: authError }) => {
      if (active) setUser(authError ? null : data.user);
    }).catch(() => { if (active) setUser(null); }).finally(() => {
      if (active) setChecking(false);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') { setUser(null); setPasswordRecovery(false); }
      else if (session?.user) {
        setUser(session.user);
        // Refresh effective roles when the authentication session rotates.
        if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'USER_UPDATED') setRefreshKey(key => key + 1);
      }
    });
    return () => { active = false; authListener.subscription.unsubscribe(); };
  }, []);

  // The original Supabase email template currently redirects to localhost.
  // Our fragment-based fallback uses a one-time recovery token without sending it to GitHub Pages.
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const code = query.get('error_code') || hash.get('error_code');
    if (code) {
      setRecoveryLinkError('Your recovery email link has expired or was already used. Request a new recovery email.');
      window.history.replaceState(null, '', new URL(import.meta.env.BASE_URL || '/', window.location.origin).pathname);
    }
    const token = hash.get('recover_token');
    if (token) {
      window.history.replaceState(null, '', new URL(import.meta.env.BASE_URL || '/', window.location.origin).pathname);
      if (token.length < 16 || token.length > 2048 || !/^[A-Za-z0-9._~-]+$/.test(token)) {
        setRecoveryLinkError('This recovery link is invalid. Request a new email.');
      } else {
        void redeemRecoveryToken(token).then(account => {
          if (active) { setUser(account); setRecoveryLinkError(''); setPasswordRecovery(true); }
        }).catch(() => {
          if (active) setRecoveryLinkError('This recovery link is expired or invalid. Request a fresh recovery email.');
        });
      }
    }
    return () => { active = false; };
  }, []);

  // Recheck access when a user returns to the workspace after permissions change.
  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === 'visible') setRefreshKey(key => key + 1);
    };
    document.addEventListener('visibilitychange', revalidate);
    return () => document.removeEventListener('visibilitychange', revalidate);
  }, []);

  useEffect(() => {
    if (!user) {
      lastAccessUserId.current = null;
      setTenants([]);
      setMemberships([]);
      setTenantId('');
      setAdminAllowed(false);
      setRecruitmentAllowed(false);
      setIsSuperAdmin(false);
      setRecords(empty());
      setMembershipLoading(false);
      setLoading(false);
      return;
    }
    let active = true;
    const switchedIdentity = lastAccessUserId.current !== user.id;
    lastAccessUserId.current = user.id;
    setMembershipLoading(true);
    setTenants([]);
    setRecords(empty());
    setAdminAllowed(false);
    setRecruitmentAllowed(false);
    setIsSuperAdmin(false);
    if (switchedIdentity) {
      setTenantId('');
      // Start each authenticated identity in the authorized system workspace.
      // Non-admin sessions are still restricted to Employee View by currentView.
      setView('system');
    }
    setError('');
    async function load() {
      try {
        const [memberResult, employeeResult, adminResult] = await Promise.all([
          supabase.from('tenant_memberships').select('tenant_id,role,status').eq('user_id', user!.id),
          supabase.from('employees').select('tenant_id,employment_status').eq('user_id', user!.id),
          supabase.from('admin_users').select('active,is_super_admin').eq('user_id', user!.id).maybeSingle(),
        ]);
        if (memberResult.error) throw memberResult.error;
        if (employeeResult.error) throw employeeResult.error;
        if (adminResult.error) throw adminResult.error;

        const mine = (memberResult.data || []).filter(m => m.status.toLowerCase() === 'active');
        const ownedTenantIds = (employeeResult.data || [])
          .filter(e => !['resigned','terminated'].includes(e.employment_status))
          .map(e => e.tenant_id);
        const permissions = await Promise.all(
          ['employees.view','employees.manage','organization.view','organization.manage','roles.manage','recruitment.view','recruitment.manage']
            .map(id => supabase.rpc('has_permission', { p_permission_id: id }))
        );
        const isLegacyAdmin = adminResult.data?.active === true &&
          permissions.slice(0, 5).some(right => !right.error && right.data === true);
        // Recruiter access is limited to active legacy admins with an explicit
        // recruitment permission; the recruiter RPCs enforce this again in SQL.
        const recruitmentWorkspaceAllowed = adminResult.data?.active === true &&
          permissions.slice(5).some(right => !right.error && right.data === true);
        // Existing admin_users grants are specific to the legacy Synesis tenant:
        // global roles are NOT valid for any other tenant.
        const legacyTenant = isLegacyAdmin || recruitmentWorkspaceAllowed
          ? await supabase.from('tenants').select('id').eq('slug','synesis-it').eq('is_active', true).maybeSingle()
          : { data: null, error: null };
        if (legacyTenant.error) throw legacyTenant.error;

        const tenantIds = Array.from(new Set([
          ...mine.map(m => m.tenant_id),
          ...ownedTenantIds,
          ...(legacyTenant.data?.id ? [legacyTenant.data.id] : []),
        ]));
        const found = tenantIds.length
          ? await supabase.from('tenants').select('id,name,slug,timezone')
              .eq('is_active', true).in('id', tenantIds)
          : { data: [] as Tenant[], error: null };
        if (found.error) throw found.error;
        if (!active) return;
        setMemberships(mine);
        setTenants((found.data || []) as Tenant[]);
        setTenantId(previous => (found.data || []).some(t => t.id === previous)
          ? previous : (found.data?.[0]?.id || ''));
        setAdminAllowed(isLegacyAdmin);
        setRecruitmentAllowed(recruitmentWorkspaceAllowed);
        setIsSuperAdmin(isLegacyAdmin && adminResult.data?.is_super_admin === true);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load your tenant membership.');
      } finally { if (active) setMembershipLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [user?.id, refreshKey]);

  useEffect(() => {
    setRecords(empty()); // Never reuse another tenant's data after switching.
    if (!user || !tenantId || membershipLoading || !tenants.some(t => t.id === tenantId)) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    async function loadRecords() {
      try {
        const timeZone = tenants.find(tenant => tenant.id === tenantId)?.timezone || 'UTC';
        const attendanceDate = tenantAttendanceDate(new Date(), timeZone);
        const leaveContext = currentView === 'employee'
          ? supabase.rpc('employee_get_leave_context')
          : Promise.resolve({ data: null, error: null });
        const scheduleContext = currentView === 'employee'
          ? supabase.rpc('employee_get_dashboard_schedule')
          : Promise.resolve({ data: null, error: null });
        const performanceContext = currentView === 'employee'
          ? supabase.rpc('employee_get_my_performance_context')
          : Promise.resolve({ data: null, error: null });
        const noticesContext = currentView === 'employee'
          ? supabase.rpc('employee_get_notice_context')
          : Promise.resolve({ data: null, error: null });
        const expenseContext = currentView === 'employee'
          ? supabase.rpc('employee_get_expense_context')
          : Promise.resolve({ data: null, error: null });
        const travelContext = currentView === 'employee'
          ? supabase.rpc('employee_get_travel_context')
          : Promise.resolve({ data: null, error: null });
        const selfServiceContext = currentView === 'employee'
          ? supabase.rpc('employee_get_self_service_context')
          : Promise.resolve({ data: null, error: null });
        const payslipContext = currentView === 'employee'
          ? supabase.rpc('employee_get_my_payslips')
          : Promise.resolve({ data: null, error: null });
        const attendance = (async () => {
          // Resolve only the authenticated user's minimized profile. RLS applies
          // to this read; the attendance query is additionally constrained by
          // this row's tenant and employee IDs.
          const linkedEmployee = await supabase.from('employees').select('id,full_name,preferred_name,employee_number,official_email,personal_email,phone,official_phone,gender,date_of_birth,nationality,marital_status,employment_status')
            .eq('tenant_id', tenantId).eq('user_id', user!.id).limit(1).maybeSingle();
          if (linkedEmployee.error) return { data: null, profile: null, error: linkedEmployee.error, pendingCorrections: [], pendingCorrectionsError: true };
          if (!linkedEmployee.data) return { data: null, profile: null, error: null, pendingCorrections: [], pendingCorrectionsError: false };
          const [today, corrections] = await Promise.all([
            supabase.from('attendance_records')
              .select('status,work_mode,check_in,check_out')
              .eq('tenant_id', tenantId)
              .eq('employee_id', linkedEmployee.data.id)
              .eq('attendance_date', attendanceDate)
              .maybeSingle(),
            currentView === 'employee'
              ? supabase.from('attendance_corrections')
                  .select('id,attendance_date,status,requested_at')
                  .eq('tenant_id', tenantId)
                  .eq('employee_id', linkedEmployee.data.id)
                  .eq('status', 'pending')
                  .order('requested_at', { ascending: false })
                  .limit(20)
              : Promise.resolve({ data: [], error: null }),
          ]);
          return { data: today.data, profile: linkedEmployee.data, error: today.error, pendingCorrections: corrections.data || [], pendingCorrectionsError: Boolean(corrections.error) };
        })();
        const [leaves, types, employees, departments, attendanceResult, leaveContextResult, scheduleContextResult, performanceContextResult, noticesContextResult, expenseContextResult, travelContextResult, selfServiceContextResult, payslipContextResult] = await Promise.all([
          supabase.from('leave_requests').select('id,from_date,to_date,requested_days,status').eq('tenant_id', tenantId).order('submitted_at', { ascending: false }).limit(50),
          supabase.from('leave_types').select('id,name,annual_entitlement').eq('tenant_id', tenantId).eq('active', true).limit(50),
          canAdminSelectedTenant ? supabase.from('employees').select('id,full_name,employee_number,employment_status').eq('tenant_id', tenantId).order('full_name').limit(100) : Promise.resolve({ data: [], error: null }),
          canAdminSelectedTenant ? supabase.from('departments').select('id,name,code').eq('tenant_id', tenantId).order('name').limit(100) : Promise.resolve({ data: [], error: null }),
          attendance,
          leaveContext,
          scheduleContext,
          performanceContext,
          noticesContext,
          expenseContext,
          travelContext,
          selfServiceContext,
          payslipContext,
        ]);
        const denied = [leaves, types, employees, departments, attendanceResult, leaveContextResult].find(result => result.error);
        if (denied?.error) throw denied.error;
        if (active) setRecords({
          leaves: (leaves.data || []) as Leave[],
          leaveTypes: (types.data || []) as LeaveType[],
          leaveBalances: ((leaveContextResult.data as { balances?: LeaveBalance[] } | null)?.balances || []),
          holidays: ((leaveContextResult.data as { holidays?: Holiday[] } | null)?.holidays || []),
          dashboardSchedule: normalizeDashboardSchedule(scheduleContextResult.data),
          scheduleError: Boolean(scheduleContextResult.error),
          goals: normalizeDashboardGoals(performanceContextResult.data),
          goalsError: Boolean(performanceContextResult.error),
          notices: normalizeDashboardNotices(noticesContextResult.data).slice(0, 8),
          noticesError: Boolean(noticesContextResult.error),
          pendingRequests: [
            ...normalizePendingRequests(contextRows(leaveContextResult.data, 'requests'), 'Leave', ['pending'], row => typeof row.leave_type_name === 'string' ? `${row.leave_type_name} request` : 'Leave request'),
            ...normalizePendingRequests(attendanceResult.pendingCorrections, 'Attendance', ['pending'], () => 'Attendance correction'),
            ...normalizePendingRequests(contextRows(expenseContextResult.data, 'claims'), 'Expense', ['submitted'], () => 'Expense claim'),
            ...normalizePendingRequests(contextRows(travelContextResult.data, 'requests'), 'Travel', ['submitted'], () => 'Travel request'),
            ...normalizePendingRequests(contextRows(selfServiceContextResult.data, 'requests'), 'Service', ['pending', 'in_progress'], row => typeof row.request_type === 'string' ? `${row.request_type.replace(/_/g, ' ')} request` : 'Service request'),
          ],
          pendingRequestErrors: [
            ...(attendanceResult.pendingCorrectionsError ? ['Attendance'] : []),
            ...(expenseContextResult.error ? ['Expense'] : []),
            ...(travelContextResult.error ? ['Travel'] : []),
            ...(selfServiceContextResult.error ? ['Service'] : []),
          ],
          employees: (employees.data || []) as Employee[],
          departments: (departments.data || []) as Department[],
          attendanceToday: (attendanceResult.data || null) as AttendanceToday | null,
          employeeProfile: attendanceResult.profile as DashboardProfile | null,
          payslips: normalizeDashboardPayslips(payslipContextResult.data),
          payslipsError: Boolean(payslipContextResult.error),
        });
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Database read failed.');
      } finally { if (active) setLoading(false); }
    }
    void loadRecords();
    return () => { active = false; };
  }, [user?.id, tenantId, canAdminSelectedTenant, currentView, refreshKey, membershipLoading, tenants]);

  async function signOut() {
    setView('employee');
    setRecords(empty());
    const result = await supabase.auth.signOut();
    if (result.error) setError(result.error.message);
    else setUser(null);
  }

  if (checking) return <main className="min-h-screen grid place-items-center"><p>Checking session…</p></main>;
  if (passwordRecovery) return <PasswordUpdate onComplete={() => { setPasswordRecovery(false); setUser(null); }} />;
  if (!user) {
    const isDirectPreviewRequested = Boolean(
      previewEnabled &&
      typeof window !== 'undefined' &&
      (window.location.search.includes('preview=true') ||
       window.location.search.includes('view=preview') ||
       window.location.hash === '#preview')
    );
    if (isDirectPreviewRequested) {
      return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
          <header className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-semibold flex flex-wrap items-center justify-between gap-2 border-b border-amber-600">
            <span>Design Preview &amp; E2E Testing Mode — Browser Layout &amp; Accessibility Sandbox</span>
            <a href="/" className="underline text-xs hover:text-white">Live Sign-in</a>
          </header>
          {preview}
        </div>
      );
    }
    return <SignIn onSuccess={setUser} recoveryLinkError={recoveryLinkError} onRecoveryVerified={account => { setUser(account); setRecoveryLinkError(''); setPasswordRecovery(true); }} />;
  }
  const current = tenants.find(t => t.id === tenantId);
  const dashboardToday = tenantAttendanceDate(new Date(), current?.timezone || 'UTC');
  const activeMembership = memberships.find(m => m.tenant_id === tenantId);

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap justify-between items-center gap-3">
        <div><p className="font-bold">Synesis HRIS 360°</p><p className="text-xs text-slate-500">Authenticated · {user.email || 'HRIS user'}</p></div>
        <button onClick={() => void signOut()} className="min-h-10 px-3 inline-flex items-center gap-2 border rounded-md text-sm"><LogOut className="w-4 h-4" /> Sign out</button>
      </div>
    </header>
    <main className="max-w-7xl mx-auto p-4 sm:p-6">
      <div className="flex flex-wrap justify-between items-start gap-4 mb-5">
        <div><p className="text-xs uppercase tracking-wide font-semibold text-blue-900">{currentView === 'system' ? 'Authenticated HRIS system workspace' : 'Supabase-connected foundation · read only'}</p><h1 className="text-2xl sm:text-3xl font-bold mt-1">{current?.name || 'Your organization'}</h1><p className="text-sm text-slate-600 mt-2">{currentView === 'system' ? 'System navigation with RLS-authorized live records. Modules without verified production workflows are clearly identified.' : 'Authorized live data from Supabase. HRIS business write operations are not yet integrated.'}</p></div>
        {tenants.length > 1 && <div><label className="text-xs font-medium block mb-1" htmlFor="hris-tenant">Organization</label><select id="hris-tenant" value={tenantId} onChange={e => { setTenantId(e.target.value); setView('employee'); setRecords(empty()); }} className="border rounded-md px-3 min-h-11">{tenants.map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select></div>}
      </div>
      {membershipLoading && <p role="status" className="text-sm mb-4">Loading permitted organizations…</p>}
      {error && <p role="alert" className="p-3 mb-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">{error}</p>}
      {!membershipLoading && !tenants.length && <section className="bg-white rounded-lg border p-6"><ShieldAlert className="w-6 h-6 text-amber-700 mb-3" /><h2 className="text-lg font-semibold">No authorized HRIS organization</h2><p className="text-sm text-slate-600 mt-2">Sign-in succeeded, but no active tenant membership, linked employee, or authorized Synesis administrator scope was found. Contact your system administrator. No sample organization is substituted.</p></section>}
      {current && <>
        <nav aria-label="Workspace views" className="flex flex-wrap items-center gap-2 mb-5 pb-3 border-b">
          {canUseSystemWorkspace && <button onClick={() => setView('system')} className={currentView === 'system' ? 'min-h-10 px-3 rounded-md bg-[#085587] text-white' : 'min-h-10 px-3 rounded-md border'}>System Workspace</button>}
          <button onClick={() => setView('employee')} className={currentView === 'employee' ? 'min-h-10 px-3 rounded-md bg-[#085587] text-white' : 'min-h-10 px-3 rounded-md border'}>Employee View</button>
          {canAdminSelectedTenant && <button onClick={() => setView('admin')} className={currentView === 'admin' ? 'min-h-10 px-3 rounded-md bg-[#085587] text-white' : 'min-h-10 px-3 rounded-md border'}>Admin View</button>}
          {previewEnabled && <button onClick={() => setView('preview')} className={currentView === 'preview' ? 'min-h-10 px-3 rounded-md bg-[#085587] text-white' : 'min-h-10 px-3 rounded-md border'} >Design preview (sample)</button>}
          {currentView !== 'preview' && <button disabled={loading || membershipLoading} onClick={() => setRefreshKey(n => n + 1)} className="min-h-10 px-3 ml-auto rounded-md border inline-flex gap-2 items-center disabled:opacity-50"><RefreshCw className="w-4 h-4" /> Refresh</button>}
        </nav>
        {currentView === 'system' ? <LiveSystemWorkspace tenantId={tenantId} tenantName={current.name} /> : currentView === 'preview' ? <>
          <section role="status" className="p-4 bg-amber-50 border border-amber-300 rounded-lg mb-4"><h2 className="font-semibold text-amber-900">Design preview — NOT connected to SQL</h2><p className="text-sm text-amber-900 mt-1">All tenants, employees, roles, actions, audit logs, and security tests in the preview are simulated browser-only fixtures. Do not use for real HR administration.</p></section>
          <div className="border rounded-lg overflow-hidden">{preview}</div>
        </> : <>
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="bg-white border rounded-lg p-4"><Database className="w-5 h-5 text-blue-800 mb-2" /><p className="text-xs text-slate-500">SQL project</p><p className="font-semibold">hrmis-saas</p><p className="text-xs text-slate-500">Existing production schema, unchanged</p></div>
            <div className="bg-white border rounded-lg p-4"><LockKeyhole className="w-5 h-5 text-blue-800 mb-2" /><p className="text-xs text-slate-500">Authorized access</p><p className="font-semibold">{activeMembership?.role || (canAdminSelectedTenant ? (isSuperAdmin ? 'Super Administrator' : 'Synesis administrator') : 'Linked employee')}</p><p className="text-xs text-slate-500">{current.name}</p></div>
            <div className="bg-white border rounded-lg p-4"><ShieldAlert className="w-5 h-5 text-blue-800 mb-2" /><p className="text-xs text-slate-500">Access model</p><p className="font-semibold">Supabase Auth + RLS</p><p className="text-xs text-slate-500">No service-role token in browser</p></div>
          </section>
          {loading ? <p role="status" className="text-sm">Reading authorized data…</p> : currentView === 'employee' ? <div className="space-y-4">
            <nav aria-label="Employee quick access" className="bg-white border rounded-lg p-4">
              <h2 className="font-semibold">Quick access</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {[
                  ['#today-attendance', 'Attendance'],
                  ['#leave-balances', 'Leave'],
                  ['#my-payslips', 'Payslips'],
                  ['#employee-profile', 'Profile'],
                  ['#pending-requests', 'Requests'],
                ].map(([href, label]) => <li key={href}><a href={href} className="inline-flex min-h-10 items-center rounded-md border border-blue-200 px-3 text-sm font-medium text-blue-900 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800">{label}</a></li>)}
              </ul>
            </nav>
            <section id="today-attendance" aria-label="Today's attendance" className="scroll-mt-24 bg-white border rounded-lg overflow-hidden">
              <div className="border-b p-4">
                <h2 className="font-semibold">Today's attendance</h2>
                <p className="text-xs text-slate-500">{attendanceDateLabel(new Date(), current.timezone)}</p>
              </div>
              {records.attendanceToday ? <div className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-medium" role="status">{attendanceStatusLabel(records.attendanceToday.status)}</p>
                  {['present', 'late', 'partial'].includes(records.attendanceToday.status) && attendanceWorkModeLabel(records.attendanceToday.work_mode) &&
                    <p className="text-sm text-slate-600">{attendanceWorkModeLabel(records.attendanceToday.work_mode)}</p>}
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-slate-500">Check-in</dt><dd className="font-medium">{tenantAttendanceTime(records.attendanceToday.check_in, current.timezone || 'UTC') || 'Not recorded'}</dd></div>
                  <div><dt className="text-xs text-slate-500">Check-out</dt><dd className="font-medium">{tenantAttendanceTime(records.attendanceToday.check_out, current.timezone || 'UTC') || (records.attendanceToday.check_in ? 'Not checked out' : 'Not recorded')}</dd></div>
                </dl>
              </div> : <p className="p-4 text-sm text-slate-600">No attendance record is available for today.</p>}
            </section>
            <section id="pending-requests" aria-label="Requests awaiting action" className="scroll-mt-24 bg-white border rounded-lg overflow-hidden">
              <div className="border-b p-4"><h2 className="font-semibold">Requests awaiting action</h2><p className="text-xs text-slate-500">Your unresolved leave, attendance, expense, travel, and service requests</p></div>
              {records.pendingRequestErrors.length > 0 && <p role="status" className="border-b p-4 text-sm text-slate-600">Some request categories are temporarily unavailable: {records.pendingRequestErrors.join(', ')}. Refresh to try again.</p>}
              {records.pendingRequests.length ? <ul className="divide-y">{records.pendingRequests.map(request => <li key={`${request.category}-${request.id}`} className="p-4 flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-sm font-medium">{request.title}</p><p className="text-xs text-slate-500">{request.category}</p></div>
                <div className="text-sm sm:text-right"><p className="font-medium capitalize">{request.status.replace(/_/g, ' ')}</p>{request.requestDate && <p className="text-xs text-slate-600">For {request.requestDate}</p>}{request.submittedAt && <p className="text-xs text-slate-500">Submitted {tenantAttendanceDateTime(request.submittedAt, current.timezone || 'UTC') || 'date unavailable'}</p>}</div>
              </li>)}</ul> : <p className="p-4 text-sm text-slate-500">{records.pendingRequestErrors.length ? 'No requests are visible in the categories that loaded.' : 'You have no unresolved requests.'}</p>}
            </section>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="bg-white border rounded-lg overflow-hidden"><div className="border-b p-4"><h2 className="font-semibold">My visible leave requests</h2><p className="text-xs text-slate-500">Last 50 RLS-visible requests</p></div>{records.leaves.length ? <ul className="divide-y">{records.leaves.map(item => <li key={item.id} className="p-4 flex justify-between gap-3"><p className="text-sm">{item.from_date} – {item.to_date} ({item.requested_days} days)</p><p className="text-xs font-medium">{item.status}</p></li>)}</ul> : <p className="p-4 text-sm text-slate-500">No visible requests, or access is restricted.</p>}</section>
            <section className="bg-white border rounded-lg overflow-hidden"><div className="border-b p-4"><h2 className="font-semibold">Authorized leave types</h2><p className="text-xs text-slate-500">Current tenant policy records</p></div>{records.leaveTypes.length ? <ul className="divide-y">{records.leaveTypes.map(item => <li key={item.id} className="p-4 flex justify-between gap-3 text-sm"><p>{item.name}</p><p>{item.annual_entitlement == null ? 'Policy-defined' : String(item.annual_entitlement) + ' days'}</p></li>)}</ul> : <p className="p-4 text-sm text-slate-500">No visible leave types.</p>}</section>
            <section id="leave-balances" aria-label="Remaining leave balances" className="scroll-mt-24 bg-white border rounded-lg overflow-hidden"><div className="border-b p-4"><h2 className="font-semibold">Remaining leave balances</h2><p className="text-xs text-slate-500">Available days after used and pending leave</p></div>{records.leaveBalances.length ? <ul className="divide-y">{records.leaveBalances.map(item => <li key={item.leave_type_id} className="p-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">{item.leave_type_name}</p><p className="text-xs text-slate-500">{item.balance_year} · {item.used_days} used · {item.pending_days} pending</p></div><p className="text-sm font-semibold">{item.available_days} days available</p></li>)}</ul> : <p className="p-4 text-sm text-slate-500">No leave balances are available for this year.</p>}</section>
            <section aria-label="Upcoming holidays" className="bg-white border rounded-lg overflow-hidden"><div className="border-b p-4"><h2 className="font-semibold">Upcoming holidays</h2><p className="text-xs text-slate-500">Current tenant calendar</p></div>{records.holidays.length ? <ul className="divide-y">{records.holidays.map(item => <li key={item.id} className="p-4"><p className="text-sm font-medium">{item.name}</p><p className="text-xs text-slate-600">{item.start_date === item.end_date ? item.start_date : `${item.start_date} – ${item.end_date}`}{item.holiday_type ? ` · ${item.holiday_type}` : ''}</p>{item.description && <p className="text-xs text-slate-500 mt-1">{item.description}</p>}</li>)}</ul> : <p className="p-4 text-sm text-slate-500">No upcoming holidays are scheduled.</p>}</section>
            </div>
            <section id="my-payslips" aria-label="My payslips" className="scroll-mt-24 bg-white border rounded-lg overflow-hidden">
              <div className="border-b p-4"><h2 className="font-semibold">My payslips</h2><p className="text-xs text-slate-500">Released payslips for your linked employee record</p></div>
              {records.payslipsError ? <p role="status" className="p-4 text-sm text-slate-600">Payslip information is temporarily unavailable. Refresh to try again.</p> : records.payslips.length ? <ul className="divide-y">{records.payslips.map(payslip => <li key={payslip.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-medium">{payslip.pay_period_name}</p><p className="text-xs text-slate-500">Pay date: {payslip.pay_date || 'Not listed'}</p></div><p className="text-sm font-semibold">Net pay: {formatPayslipAmount(payslip.net_salary, payslip.currency)}</p></div>
                <details className="mt-3 text-sm"><summary className="min-h-10 flex cursor-pointer items-center font-medium text-blue-900">View pay details</summary><dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 border-t pt-3">
                  {([
                    ['Gross earnings', payslip.gross_earnings], ['Basic salary', payslip.basic_salary], ['House rent allowance', payslip.house_rent_allowance], ['Medical allowance', payslip.medical_allowance], ['Transport allowance', payslip.transport_allowance], ['Special allowance', payslip.special_allowance], ['Overtime pay', payslip.overtime_pay], ['Bonus', payslip.bonus], ['Total deductions', payslip.total_deductions], ['Tax deduction', payslip.tax_deduction], ['Provident fund deduction', payslip.provident_fund_deduction], ['Leave without pay deduction', payslip.leave_without_pay_deduction], ['Other deductions', payslip.other_deductions],
                  ] as Array<[string, number | null]>).filter(([, amount]) => amount !== null).map(([label, amount]) => <div key={label} className="flex justify-between gap-3"><dt className="text-slate-600">{label}</dt><dd className="font-medium">{formatPayslipAmount(amount!, payslip.currency)}</dd></div>)}
                </dl></details>
              </li>)}</ul> : <p className="p-4 text-sm text-slate-500">No released payslips are available.</p>}
            </section>
            {records.employeeProfile ? <EmployeeProfileSection profile={records.employeeProfile} onSaved={() => setRefreshKey(n => n + 1)} /> : <section id="employee-profile" aria-label="My profile" className="scroll-mt-24 bg-white border rounded-lg overflow-hidden"><div className="border-b p-4"><h2 className="font-semibold">My profile</h2><p className="text-xs text-slate-500">Personal information from your linked employee record</p></div><p className="p-4 text-sm text-slate-500">No linked employee profile is available.</p></section>}
            <section aria-label="Upcoming schedule" className="bg-white border rounded-lg overflow-hidden">
              <div className="border-b p-4"><h2 className="font-semibold">Upcoming schedule</h2><p className="text-xs text-slate-500">Assigned interviews, training, and review dates</p></div>
              {records.scheduleError ? <p role="status" className="p-4 text-sm text-slate-600">Schedule information is temporarily unavailable. Refresh to try again.</p> : <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                <section aria-label="Upcoming interviews" className="rounded-md border p-3">
                  <h3 className="text-sm font-semibold">Interviews</h3>
                  {records.dashboardSchedule.interviews.length ? <ul className="mt-2 divide-y">{records.dashboardSchedule.interviews.map(item => <li key={item.id} className="py-2"><p className="text-sm font-medium">{item.job_title} · {item.interview_type}</p><p className="text-xs text-slate-600">{tenantAttendanceDateTime(item.scheduled_at, current.timezone || 'UTC') || 'Date not available'}</p>{item.location_or_link && <p className="text-xs text-slate-500">{item.location_or_link}</p>}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No assigned interviews are scheduled.</p>}
                </section>
                <section aria-label="Upcoming training" className="rounded-md border p-3">
                  <h3 className="text-sm font-semibold">Training</h3>
                  {records.dashboardSchedule.learning_sessions.length || records.dashboardSchedule.training.length ? <ul className="mt-2 divide-y">
                    {records.dashboardSchedule.learning_sessions.map(item => <li key={`session-${item.id}`} className="py-2"><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-slate-600">{tenantAttendanceDateTime(item.start_at, current.timezone || 'UTC') || 'Date not available'}{item.end_at ? ` – ${tenantAttendanceDateTime(item.end_at, current.timezone || 'UTC') || ''}` : ''}</p>{item.location && <p className="text-xs text-slate-500">{item.location}</p>}</li>)}
                    {records.dashboardSchedule.training.map(item => <li key={`training-${item.id}`} className="py-2"><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-slate-600">{item.start_date || item.end_date ? `${item.start_date || ''}${item.start_date && item.end_date && item.start_date !== item.end_date ? ' – ' : ''}${item.end_date || ''}` : 'Dates not listed'}</p>{item.institute_name && <p className="text-xs text-slate-500">{item.institute_name}</p>}</li>)}
                  </ul> : <p className="mt-2 text-sm text-slate-500">No upcoming or in-progress training is scheduled.</p>}
                </section>
                <section aria-label="Upcoming reviews" className="rounded-md border p-3">
                  <h3 className="text-sm font-semibold">Reviews</h3>
                  {records.dashboardSchedule.performance_cycles.length ? <ul className="mt-2 divide-y">{records.dashboardSchedule.performance_cycles.map(item => <li key={item.id} className="py-2"><p className="text-sm font-medium">{item.name}</p><p className="text-xs text-slate-600">{item.start_date} – {item.end_date}</p>{item.self_review_deadline && <p className="text-xs text-slate-500">Self review due {item.self_review_deadline}</p>}{item.manager_review_deadline && <p className="text-xs text-slate-500">Manager review due {item.manager_review_deadline}</p>}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No review dates are currently scheduled.</p>}
                </section>
                <section aria-label="Company events" className="rounded-md border p-3">
                  <h3 className="text-sm font-semibold">Company events</h3>
                  <p className="mt-2 text-sm text-slate-500">Company event dates are not available in this workspace calendar.</p>
                </section>
              </div>}
            </section>
            <section aria-label="My goals and overdue actions" className="bg-white border rounded-lg overflow-hidden">
              <div className="border-b p-4"><h2 className="font-semibold">My goals and overdue actions</h2><p className="text-xs text-slate-500">Goals and due dates assigned to your employee record</p></div>
              {records.goalsError ? <p role="status" className="p-4 text-sm text-slate-600">Goal information is temporarily unavailable. Refresh to try again.</p> : records.goals.length ? <ul className="divide-y">{records.goals.map(goal => {
                const overdue = goalIsOverdue(goal, dashboardToday);
                return <li key={goal.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
                  <div><p className="text-sm font-medium">{goal.title}</p><p className="text-xs text-slate-500">{goal.origin === 'assigned' ? 'Assigned goal' : 'Personal goal'}{goal.category ? ` · ${goal.category}` : ''}</p></div>
                  <div className="text-sm sm:text-right"><p className="font-medium capitalize">{goal.status.replace(/_/g, ' ')} · {goal.current_progress}% complete</p><p className="text-xs text-slate-600">{goal.due_date ? `Due ${goal.due_date}` : 'No due date'}</p>{goal.target_metric && <p className="text-xs text-slate-500">Target: {goal.target_metric}</p>}{overdue && <p role="status" className="text-xs font-semibold text-red-700">Overdue</p>}</div>
                </li>;
              })}</ul> : <p className="p-4 text-sm text-slate-500">No performance goals are currently listed for you.</p>}
              <p className="border-t px-4 py-3 text-xs text-slate-500">This workspace provides performance goals; standalone task assignments are not available here.</p>
            </section>
            <section aria-label="Recent HR announcements" className="bg-white border rounded-lg overflow-hidden">
              <div className="border-b p-4"><h2 className="font-semibold">Recent HR announcements</h2><p className="text-xs text-slate-500">Published notices for your organization and audience</p></div>
              {records.noticesError ? <p role="status" className="p-4 text-sm text-slate-600">Announcements are temporarily unavailable. Refresh to try again.</p> : records.notices.length ? <ul className="divide-y">{records.notices.map(notice => <li key={notice.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{notice.title}</p>{notice.pinned && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">Pinned</span>}</div>
                <p className="text-xs text-slate-500 mt-1">{notice.category} · {tenantAttendanceDateTime(notice.published_at, current.timezone || 'UTC') || 'Date not available'}</p>
                <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{notice.body}</p>
              </li>)}</ul> : <p className="p-4 text-sm text-slate-500">No recent announcements are available for your audience.</p>}
            </section>
          </div> : <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="bg-white border rounded-lg overflow-hidden"><div className="border-b p-4"><h2 className="font-semibold">Authorized employee directory</h2><p className="text-xs text-slate-500">Up to 100 RLS-visible employees</p></div>{records.employees.length ? <ul className="divide-y">{records.employees.map(item => <li key={item.id} className="p-4"><p className="font-medium text-sm">{item.full_name}</p><p className="text-xs text-slate-500">{item.employee_number} · {item.employment_status}</p></li>)}</ul> : <p className="p-4 text-sm text-slate-500">No employee records visible.</p>}</section>
            <section className="bg-white border rounded-lg overflow-hidden"><div className="border-b p-4"><h2 className="font-semibold">Authorized departments</h2></div>{records.departments.length ? <ul className="divide-y">{records.departments.map(item => <li key={item.id} className="p-4"><p className="font-medium text-sm">{item.name}</p><p className="text-xs text-slate-500">{item.code}</p></li>)}</ul> : <p className="p-4 text-sm text-slate-500">No departments visible.</p>}</section>
          </div>}
          <p className="mt-5 text-xs text-slate-500">Read-only integration foundation; full SQL synchronization and write testing remain future work.</p>
        </>}
      </>}
    </main>
  </div>;
}

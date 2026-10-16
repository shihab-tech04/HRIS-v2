import React, { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { Database, LockKeyhole, LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { RecoveryLinkFallback, redeemRecoveryToken } from './RecoveryLinkFallback';
import { LiveHrisWorkspace } from './LiveHrisWorkspace';
import { platformTenantFeatureAvailable } from './platformTenantApi';

type Membership = { tenant_id: string; role: string; status: string };
type Tenant = { id: string; name: string; slug: string; timezone: string | null };
type Employee = { id: string; full_name: string; employee_number: string; employment_status: string };
type Department = { id: string; name: string; code: string };
type Leave = { id: string; from_date: string; to_date: string; requested_days: number; status: string };
type LeaveType = { id: string; name: string; annual_entitlement: number | null };
type Records = { employees: Employee[]; departments: Department[]; leaves: Leave[]; leaveTypes: LeaveType[] };
type View = 'employee' | 'preview' | 'system';
type WorkspacePermissions = {
  dashboard: boolean; attendance: boolean; attendanceView: boolean; attendanceManage: boolean;
  attendanceReport: boolean; leave: boolean; leaveManage: boolean; organization: boolean;
  organizationManage: boolean; employees: boolean; employeesManage: boolean; performance: boolean; recruitment: boolean; recruitmentManage: boolean;
  referrals: boolean; referralsManage: boolean;
  holidayManage: boolean;
  learningManage: boolean;
  travel: boolean; travelView: boolean; travelManage: boolean;
  expenses: boolean; expensesView: boolean; expensesManage: boolean;
  payroll: boolean; payrollManage: boolean;
};
const noWorkspacePermissions: WorkspacePermissions = {
  dashboard: false, attendance: false, attendanceView: false, attendanceManage: false,
  attendanceReport: false, leave: false, leaveManage: false, organization: false,
  organizationManage: false, employees: false, employeesManage: false, performance: false, recruitment: false, recruitmentManage: false,
  referrals: false, referralsManage: false,
  holidayManage: false,
  learningManage: false,
  travel: false, travelView: false, travelManage: false,
  expenses: false, expensesView: false, expensesManage: false,
  payroll: false, payrollManage: false,
};
const empty = (): Records => ({ employees: [], departments: [], leaves: [], leaveTypes: [] });

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
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [employeeTenantIds, setEmployeeTenantIds] = useState<string[]>([]);
  const [tenantWorkspacePermissions, setTenantWorkspacePermissions] = useState<Record<string, WorkspacePermissions>>({});
  const workspacePermissions = tenantWorkspacePermissions[tenantId] || noWorkspacePermissions;
  const canAdminSelectedTenant = tenants.some(t => t.id === tenantId) && (
    isSuperAdmin || workspacePermissions.dashboard || workspacePermissions.attendance || workspacePermissions.leave
    || workspacePermissions.organization || workspacePermissions.employees || workspacePermissions.performance || workspacePermissions.recruitment
    || workspacePermissions.learningManage
    || workspacePermissions.travel
    || workspacePermissions.payroll
  );
  const canReadAdminDirectories = tenants.some(t => t.id === tenantId) && (
    isSuperAdmin || workspacePermissions.dashboard || workspacePermissions.organization
    || workspacePermissions.performance || workspacePermissions.attendance || workspacePermissions.leave
  );
  const previewEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_PREVIEW === 'true';
  const [view, setView] = useState<View>('system');
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
      setIsSuperAdmin(false);
      setEmployeeTenantIds([]);
      setTenantWorkspacePermissions({});
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
    setIsSuperAdmin(false);
    setEmployeeTenantIds([]);
    setTenantWorkspacePermissions({});
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
        const permissionIds = [
          'dashboard.view', 'attendance.view', 'attendance.manage', 'reports.view',
          'leave.view', 'leave.manage', 'organization.view', 'organization.manage', 'performance.view', 'performance.manage',
          'employees.view', 'employees.manage',
          'recruitment.view', 'recruitment.manage',
          'referrals.view', 'referrals.manage',
          'holidays.manage',
          'learning.manage',
          'travel.view', 'travel.manage',
          'expenses.view', 'expenses.manage',
          'payroll.view', 'payroll.manage',
        ];
        const tenantPermissionEntries = await Promise.all(mine.map(async membership => {
          const checks = await Promise.all(permissionIds.map(p_permission_id => supabase.rpc('has_tenant_permission', {
            p_tenant_id: membership.tenant_id,
            p_permission_id,
          })));
          const grants = new Map(permissionIds.map((id, index) => [
            id, !checks[index]?.error && checks[index]?.data === true,
          ]));
          return [membership.tenant_id, {
            dashboard: grants.get('dashboard.view') === true,
            attendance: grants.get('attendance.view') === true || grants.get('attendance.manage') === true
              || grants.get('reports.view') === true,
            attendanceView: grants.get('attendance.view') === true,
            attendanceManage: grants.get('attendance.manage') === true,
            attendanceReport: grants.get('reports.view') === true,
            leave: grants.get('leave.view') === true || grants.get('leave.manage') === true,
            leaveManage: grants.get('leave.manage') === true,
            organization: grants.get('organization.view') === true || grants.get('organization.manage') === true,
            organizationManage: grants.get('organization.manage') === true,
            employees: grants.get('employees.view') === true || grants.get('employees.manage') === true,
            employeesManage: grants.get('employees.manage') === true,
            performance: grants.get('performance.view') === true || grants.get('performance.manage') === true,
            recruitment: grants.get('recruitment.view') === true || grants.get('recruitment.manage') === true,
            recruitmentManage: grants.get('recruitment.manage') === true,
            referrals: grants.get('referrals.view') === true || grants.get('referrals.manage') === true,
            referralsManage: grants.get('referrals.manage') === true,
            holidayManage: grants.get('holidays.manage') === true,
            learningManage: grants.get('learning.manage') === true,
            travel: grants.get('travel.view') === true || grants.get('travel.manage') === true,
            travelView: grants.get('travel.view') === true,
            travelManage: grants.get('travel.manage') === true,
            expenses: grants.get('expenses.view') === true || grants.get('expenses.manage') === true,
            expensesView: grants.get('expenses.view') === true,
            expensesManage: grants.get('expenses.manage') === true,
            payroll: grants.get('payroll.view') === true || grants.get('payroll.manage') === true,
            payrollManage: grants.get('payroll.manage') === true,
          } satisfies WorkspacePermissions] as const;
        }));
        const tenantPermissions = Object.fromEntries(tenantPermissionEntries);

        const tenantIds = Array.from(new Set([...mine.map(m => m.tenant_id), ...ownedTenantIds]));
        const activeSuperAdmin = adminResult.data?.active === true && adminResult.data?.is_super_admin === true;
        const found = activeSuperAdmin
          ? await supabase.from('tenants').select('id,name,slug,timezone').eq('is_active', true).order('name')
          : tenantIds.length
          ? await supabase.from('tenants').select('id,name,slug,timezone')
              .eq('is_active', true).in('id', tenantIds)
          : { data: [] as Tenant[], error: null };
        if (found.error) throw found.error;
        if (!active) return;
        setMemberships(mine);
        setTenants((found.data || []) as Tenant[]);
        setEmployeeTenantIds(ownedTenantIds);
        setTenantWorkspacePermissions(tenantPermissions);
        setTenantId(previous => (found.data || []).some(t => t.id === previous)
          ? previous : (found.data?.[0]?.id || ''));
        setIsSuperAdmin(activeSuperAdmin);
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
        const [leaves, types, employees, departments] = await Promise.all([
          supabase.from('leave_requests').select('id,from_date,to_date,requested_days,status').eq('tenant_id', tenantId).order('submitted_at', { ascending: false }).limit(50),
          supabase.from('leave_types').select('id,name,annual_entitlement').eq('tenant_id', tenantId).eq('active', true).limit(50),
          canReadAdminDirectories ? supabase.from('employees').select('id,full_name,employee_number,employment_status').eq('tenant_id', tenantId).order('full_name').limit(100) : Promise.resolve({ data: [], error: null }),
          canReadAdminDirectories ? supabase.from('departments').select('id,name,code').eq('tenant_id', tenantId).order('name').limit(100) : Promise.resolve({ data: [], error: null }),
        ]);
        const denied = [leaves, types, employees, departments].find(result => result.error);
        if (denied?.error) throw denied.error;
        if (active) setRecords({
          leaves: (leaves.data || []) as Leave[],
          leaveTypes: (types.data || []) as LeaveType[],
          employees: (employees.data || []) as Employee[],
          departments: (departments.data || []) as Department[],
        });
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Database read failed.');
      } finally { if (active) setLoading(false); }
    }
    void loadRecords();
    return () => { active = false; };
  }, [user?.id, tenantId, canReadAdminDirectories, refreshKey, membershipLoading, tenants]);

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
  const activeMembership = memberships.find(m => m.tenant_id === tenantId);
  const currentView = view === 'system' && !canAdminSelectedTenant ? 'employee' : view;
  const opensAdminWorkspace = currentView === 'system' && canAdminSelectedTenant;
  const opensEmployeeWorkspace = currentView === 'employee'
    && employeeTenantIds.includes(tenantId);

  if (current && (opensAdminWorkspace || opensEmployeeWorkspace)) {
    return <LiveHrisWorkspace
      userId={user.id}
      userEmail={user.email || 'HRIS user'}
      tenantId={tenantId}
      tenantName={current.name}
      tenants={tenants}
      onTenantChange={nextTenantId => {
        setTenantId(nextTenantId);
        setRecords(empty());
      }}
      onSignOut={() => { void signOut(); }}
      isSuperAdmin={opensAdminWorkspace && isSuperAdmin}
      isEmployee={employeeTenantIds.includes(tenantId)}
      permissions={opensAdminWorkspace ? workspacePermissions : noWorkspacePermissions}
    />;
  }

  if (platformTenantFeatureAvailable && isSuperAdmin) {
    return <LiveHrisWorkspace
      userId={user.id}
      userEmail={user.email || 'HRIS user'}
      tenantId=""
      tenantName="Platform administration"
      tenants={[]}
      onTenantChange={() => {}}
      onSignOut={() => { void signOut(); }}
      isSuperAdmin
      isEmployee={false}
      permissions={noWorkspacePermissions}
    />;
  }

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
          {canAdminSelectedTenant && <button onClick={() => setView('system')} className={currentView === 'system' ? 'min-h-10 px-3 rounded-md bg-[#085587] text-white' : 'min-h-10 px-3 rounded-md border'}>System Workspace</button>}
          <button onClick={() => setView('employee')} className={currentView === 'employee' ? 'min-h-10 px-3 rounded-md bg-[#085587] text-white' : 'min-h-10 px-3 rounded-md border'}>Employee View</button>
          {previewEnabled && <button onClick={() => setView('preview')} className={currentView === 'preview' ? 'min-h-10 px-3 rounded-md bg-[#085587] text-white' : 'min-h-10 px-3 rounded-md border'} >Design preview (sample)</button>}
          {currentView !== 'preview' && <button disabled={loading || membershipLoading} onClick={() => setRefreshKey(n => n + 1)} className="min-h-10 px-3 ml-auto rounded-md border inline-flex gap-2 items-center disabled:opacity-50"><RefreshCw className="w-4 h-4" /> Refresh</button>}
        </nav>
        {currentView === 'system' ? <p role="status" className="rounded-lg border bg-white p-5 text-sm">Loading your authorized HRIS workspace…</p> : currentView === 'preview' ? <>
          <section role="status" className="p-4 bg-amber-50 border border-amber-300 rounded-lg mb-4"><h2 className="font-semibold text-amber-900">Design preview — NOT connected to SQL</h2><p className="text-sm text-amber-900 mt-1">All tenants, employees, roles, actions, audit logs, and security tests in the preview are simulated browser-only fixtures. Do not use for real HR administration.</p></section>
          <div className="border rounded-lg overflow-hidden">{preview}</div>
        </> : <>
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="bg-white border rounded-lg p-4"><Database className="w-5 h-5 text-blue-800 mb-2" /><p className="text-xs text-slate-500">SQL project</p><p className="font-semibold">hrmis-saas</p><p className="text-xs text-slate-500">Existing production schema, unchanged</p></div>
            <div className="bg-white border rounded-lg p-4"><LockKeyhole className="w-5 h-5 text-blue-800 mb-2" /><p className="text-xs text-slate-500">Authorized access</p><p className="font-semibold">{activeMembership?.role || (canAdminSelectedTenant ? (isSuperAdmin ? 'Super Administrator' : 'Synesis administrator') : 'Linked employee')}</p><p className="text-xs text-slate-500">{current.name}</p></div>
            <div className="bg-white border rounded-lg p-4"><ShieldAlert className="w-5 h-5 text-blue-800 mb-2" /><p className="text-xs text-slate-500">Access model</p><p className="font-semibold">Supabase Auth + RLS</p><p className="text-xs text-slate-500">No service-role token in browser</p></div>
          </section>
          {loading ? <p role="status" className="text-sm">Reading authorized data…</p> : currentView === 'employee' ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="bg-white border rounded-lg overflow-hidden"><div className="border-b p-4"><h2 className="font-semibold">My visible leave requests</h2><p className="text-xs text-slate-500">Last 50 RLS-visible requests</p></div>{records.leaves.length ? <ul className="divide-y">{records.leaves.map(item => <li key={item.id} className="p-4 flex justify-between gap-3"><p className="text-sm">{item.from_date} – {item.to_date} ({item.requested_days} days)</p><p className="text-xs font-medium">{item.status}</p></li>)}</ul> : <p className="p-4 text-sm text-slate-500">No visible requests, or access is restricted.</p>}</section>
            <section className="bg-white border rounded-lg overflow-hidden"><div className="border-b p-4"><h2 className="font-semibold">Authorized leave types</h2><p className="text-xs text-slate-500">Current tenant policy records</p></div>{records.leaveTypes.length ? <ul className="divide-y">{records.leaveTypes.map(item => <li key={item.id} className="p-4 flex justify-between gap-3 text-sm"><p>{item.name}</p><p>{item.annual_entitlement == null ? 'Policy-defined' : String(item.annual_entitlement) + ' days'}</p></li>)}</ul> : <p className="p-4 text-sm text-slate-500">No visible leave types.</p>}</section>
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

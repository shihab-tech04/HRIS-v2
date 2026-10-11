import React, { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { Database, LockKeyhole, LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Membership = { tenant_id: string; role: string; status: string };
type Tenant = { id: string; name: string; slug: string; timezone: string | null };
type Employee = { id: string; full_name: string; employee_number: string; employment_status: string };
type Department = { id: string; name: string; code: string };
type Leave = { id: string; from_date: string; to_date: string; requested_days: number; status: string };
type LeaveType = { id: string; name: string; annual_entitlement: number | null };
type Records = { employees: Employee[]; departments: Department[]; leaves: Leave[]; leaveTypes: LeaveType[] };
type View = 'employee' | 'admin' | 'preview';
const empty = (): Records => ({ employees: [], departments: [], leaves: [], leaveTypes: [] });

function SignIn({ onSuccess }: { onSuccess: (value: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (authError) { setError(authError.message); return; }
    if (!data.user) { setError('No authenticated user was returned.'); return; }
    setPassword('');
    onSuccess(data.user);
  }
  return <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 sm:p-8 w-full max-w-md">
      <p className="text-xs font-semibold text-blue-900">Synesis HRIS 360°</p>
      <h1 className="text-2xl font-bold mt-2">Sign in to your workspace</h1>
      <p className="text-sm text-slate-600 mt-2">Use an existing authorized Supabase account. Live records are restricted by the database permissions.</p>
      <form onSubmit={submit} className="space-y-4 mt-6">
        <div><label className="block text-sm font-medium mb-1" htmlFor="hris-email">Email</label><input required id="hris-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} className="w-full min-h-11 px-3 rounded-md border border-slate-300 focus:outline-2 focus:outline-blue-700" /></div>
        <div><label className="block text-sm font-medium mb-1" htmlFor="hris-password">Password</label><input required id="hris-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full min-h-11 px-3 rounded-md border border-slate-300 focus:outline-2 focus:outline-blue-700" /></div>
        {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
        <button type="submit" disabled={busy} className="min-h-11 w-full rounded-md bg-slate-900 hover:bg-slate-800 text-white font-semibold disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  </main>;
}

export function LiveApp({ preview }: { preview: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [adminAllowed, setAdminAllowed] = useState(false);
  const [view, setView] = useState<View>('employee');
  const [records, setRecords] = useState<Records>(empty);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
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
      if (event === 'SIGNED_OUT') setUser(null);
      else if (session?.user) setUser(session.user);
    });
    return () => { active = false; authListener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user) { setTenants([]); setMemberships([]); setTenantId(''); setAdminAllowed(false); setRecords(empty()); return; }
    let active = true;
    setMembershipLoading(true);
    setError('');
    async function load() {
      try {
        const result = await supabase.from('tenant_memberships').select('tenant_id,role,status').eq('user_id', user!.id);
        if (result.error) throw result.error;
        const mine = (result.data || []).filter(m => m.status.toLowerCase() === 'active');
        const ids = mine.map(m => m.tenant_id);
        const found = ids.length
          ? await supabase.from('tenants').select('id,name,slug,timezone').eq('is_active', true).in('id', ids)
          : { data: [] as Tenant[], error: null };
        if (found.error) throw found.error;
        const rights = await Promise.all(['employees.view','employees.manage','organization.view','organization.manage','roles.manage'].map(
          id => supabase.rpc('has_permission', { p_permission_id: id })
        ));
        if (!active) return;
        setMemberships(mine);
        setTenants((found.data || []) as Tenant[]);
        setTenantId(old => (found.data || []).some(t => t.id === old) ? old : (found.data?.[0]?.id || ''));
        setAdminAllowed(rights.some(right => !right.error && right.data === true));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load your tenant membership.');
      } finally { if (active) setMembershipLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    setRecords(empty()); // Never reuse another tenant's data after switching.
    if (!user || !tenantId) return;
    let active = true;
    setLoading(true);
    setError('');
    async function loadRecords() {
      try {
        const [leaves, types, employees, departments] = await Promise.all([
          supabase.from('leave_requests').select('id,from_date,to_date,requested_days,status').eq('tenant_id', tenantId).order('submitted_at', { ascending: false }).limit(50),
          supabase.from('leave_types').select('id,name,annual_entitlement').eq('tenant_id', tenantId).eq('active', true).limit(50),
          adminAllowed ? supabase.from('employees').select('id,full_name,employee_number,employment_status').eq('tenant_id', tenantId).order('full_name').limit(100) : Promise.resolve({ data: [], error: null }),
          adminAllowed ? supabase.from('departments').select('id,name,code').eq('tenant_id', tenantId).order('name').limit(100) : Promise.resolve({ data: [], error: null }),
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
  }, [user?.id, tenantId, adminAllowed, refreshKey]);

  async function signOut() {
    setView('employee');
    setRecords(empty());
    const result = await supabase.auth.signOut();
    if (result.error) setError(result.error.message);
    else setUser(null);
  }

  if (checking) return <main className="min-h-screen grid place-items-center"><p>Checking session…</p></main>;
  if (!user) return <SignIn onSuccess={setUser} />;
  const current = tenants.find(t => t.id === tenantId);
  const activeMembership = memberships.find(m => m.tenant_id === tenantId);
  const currentView = view === 'admin' && !adminAllowed ? 'employee' : view;

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap justify-between items-center gap-3">
        <div><p className="font-bold">Synesis HRIS 360°</p><p className="text-xs text-slate-500">Authenticated · {user.email || 'HRIS user'}</p></div>
        <button onClick={() => void signOut()} className="min-h-10 px-3 inline-flex items-center gap-2 border rounded-md text-sm"><LogOut className="w-4 h-4" /> Sign out</button>
      </div>
    </header>
    <main className="max-w-7xl mx-auto p-4 sm:p-6">
      <div className="flex flex-wrap justify-between items-start gap-4 mb-5">
        <div><p className="text-xs uppercase tracking-wide font-semibold text-blue-900">Supabase-connected foundation · read only</p><h1 className="text-2xl sm:text-3xl font-bold mt-1">{current?.name || 'Your organization'}</h1><p className="text-sm text-slate-600 mt-2">Only authorized live data is shown. HRIS write operations are not yet integrated.</p></div>
        {tenants.length > 1 && <div><label className="text-xs font-medium block mb-1" htmlFor="hris-tenant">Organization</label><select id="hris-tenant" value={tenantId} onChange={e => { setTenantId(e.target.value); setView('employee'); setRecords(empty()); }} className="border rounded-md px-3 min-h-11">{tenants.map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select></div>}
      </div>
      {membershipLoading && <p role="status" className="text-sm mb-4">Loading permitted organizations…</p>}
      {error && <p role="alert" className="p-3 mb-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">{error}</p>}
      {!membershipLoading && !tenants.length && <section className="bg-white rounded-lg border p-6"><ShieldAlert className="w-6 h-6 text-amber-700 mb-3" /><h2 className="text-lg font-semibold">No active HRIS tenant membership</h2><p className="text-sm text-slate-600 mt-2">Sign-in succeeded, but this account has no active authorized organization. An administrator must provision membership in Supabase. Sample data is not substituted.</p></section>}
      {current && <>
        <nav aria-label="Workspace views" className="flex flex-wrap items-center gap-2 mb-5 pb-3 border-b">
          <button onClick={() => setView('employee')} className={currentView === 'employee' ? 'min-h-10 px-3 rounded-md bg-slate-900 text-white' : 'min-h-10 px-3 rounded-md border'}>Employee View</button>
          {adminAllowed && <button onClick={() => setView('admin')} className={currentView === 'admin' ? 'min-h-10 px-3 rounded-md bg-slate-900 text-white' : 'min-h-10 px-3 rounded-md border'}>Admin View</button>}
          <button onClick={() => setView('preview')} className={currentView === 'preview' ? 'min-h-10 px-3 rounded-md bg-slate-900 text-white' : 'min-h-10 px-3 rounded-md border'}>Design preview (sample)</button>
          {currentView !== 'preview' && <button disabled={loading} onClick={() => setRefreshKey(n => n + 1)} className="min-h-10 px-3 ml-auto rounded-md border inline-flex gap-2 items-center disabled:opacity-50"><RefreshCw className="w-4 h-4" /> Refresh</button>}
        </nav>
        {currentView === 'preview' ? <>
          <section role="status" className="p-4 bg-amber-50 border border-amber-300 rounded-lg mb-4"><h2 className="font-semibold text-amber-900">Design preview — NOT connected to SQL</h2><p className="text-sm text-amber-900 mt-1">All tenants, employees, roles, actions, audit logs, and security tests in the preview are simulated browser-only fixtures. Do not use for real HR administration.</p></section>
          <div className="border rounded-lg overflow-hidden">{preview}</div>
        </> : <>
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="bg-white border rounded-lg p-4"><Database className="w-5 h-5 text-blue-800 mb-2" /><p className="text-xs text-slate-500">SQL project</p><p className="font-semibold">hrmis-saas</p><p className="text-xs text-slate-500">Existing production schema, unchanged</p></div>
            <div className="bg-white border rounded-lg p-4"><LockKeyhole className="w-5 h-5 text-blue-800 mb-2" /><p className="text-xs text-slate-500">Verified membership</p><p className="font-semibold">{activeMembership?.role || 'Active member'}</p><p className="text-xs text-slate-500">{current.name}</p></div>
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

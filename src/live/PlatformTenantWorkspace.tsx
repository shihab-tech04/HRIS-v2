import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Building2, Pencil, Plus, RefreshCw, Save, ShieldCheck, X } from 'lucide-react';
import {
  isPlatformSuperAdmin,
  listPlatformTenants,
  platformTenantFeatureAvailable,
  provisionPlatformTenant,
  setPlatformTenantAdministrator,
  updatePlatformTenantMetadata,
} from './platformTenantApi';
import type { PlatformTenant } from './platformTenantApi';
import { projectText, type Locale } from './project-locale';

type TenantForm = {
  code: string;
  slug: string;
  name: string;
  timezone: string;
  defaultLocale: 'en' | 'bn';
  existingAdminUserId: string;
};

const emptyTenantForm = (): TenantForm => ({
  code: '', slug: '', name: '', timezone: 'Asia/Dhaka', defaultLocale: 'en', existingAdminUserId: '',
});
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorMessage(cause: unknown): string {
  const message = cause && typeof cause === 'object' && 'message' in cause
    ? String((cause as { message: unknown }).message)
    : cause instanceof Error ? cause.message : '';
  if (/duplicate key|unique constraint|already exists/i.test(message)) {
    return 'That tenant code or URL key is already in use. Choose a different value and try again.';
  }
  if (/not authorized|42501/i.test(message)) {
    return 'This account no longer has platform Super Admin access. Refresh the page or sign in again.';
  }
  return message || 'The request could not be completed. Check the fields and try again.';
}

function Field({ id, label, value, onChange, required = true, type = 'text', pattern, maxLength, minLength, placeholder }: {
  id: string; label: string; value: string; onChange: (value: string) => void; required?: boolean;
  type?: string; pattern?: string; maxLength?: number; minLength?: number; placeholder?: string;
}) {
  return <label className="block min-w-0 text-sm font-medium text-slate-700" htmlFor={id}>
    {label}<input id={id} type={type} required={required} value={value} pattern={pattern} maxLength={maxLength} minLength={minLength}
      placeholder={placeholder} onChange={event => onChange(event.target.value)}
      className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 focus:outline-2 focus:outline-[#08558B]" />
  </label>;
}

export function PlatformTenantWorkspace({ locale }: { locale: Locale }) {
  const tx = (text: string) => projectText(locale, text);
  const [authorized, setAuthorized] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<TenantForm>(emptyTenantForm);
  const [editingId, setEditingId] = useState('');
  const [editName, setEditName] = useState('');
  const [editTimezone, setEditTimezone] = useState('');
  const [editLocale, setEditLocale] = useState<'en' | 'bn'>('en');
  const [adminUserIds, setAdminUserIds] = useState<Record<string, string>>({});
  const [confirmRevoke, setConfirmRevoke] = useState<{ tenantId: string; userId: string } | null>(null);

  async function loadTenants(showLoading = true): Promise<boolean> {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const allowed = await isPlatformSuperAdmin();
      setAuthorized(allowed);
      if (!allowed) {
        setTenants([]);
        setError('This account is not authorized to manage platform tenants.');
        return false;
      }
      setTenants(await listPlatformTenants());
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    } finally {
      if (showLoading) setLoading(false);
      setCheckingAccess(false);
    }
  }

  useEffect(() => { void loadTenants(); }, []);

  async function runAction(key: string, success: string, action: () => Promise<void>) {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await action();
      const refreshed = await loadTenants(false);
      setNotice(refreshed ? success : `${success} ${tx('Refresh the tenant list to confirm the latest state.')}`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy('');
    }
  }

  async function createTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uuidPattern.test(createForm.existingAdminUserId.trim())) {
      setError(tx('Enter a valid existing Auth user ID for the first administrator.'));
      return;
    }
    await runAction('create', tx('Tenant created and left inactive pending security certification.'), async () => {
      await provisionPlatformTenant({
        ...createForm,
        code: createForm.code.trim().toUpperCase(),
        slug: createForm.slug.trim().toLowerCase(),
        name: createForm.name.trim(),
        timezone: createForm.timezone.trim(),
        existingAdminUserId: createForm.existingAdminUserId.trim(),
      });
      setCreateForm(emptyTenantForm());
      setCreateOpen(false);
    });
  }

  async function saveMetadata(event: FormEvent<HTMLFormElement>, tenantId: string) {
    event.preventDefault();
    await runAction(`metadata:${tenantId}`, tx('Tenant details saved.'), async () => {
      await updatePlatformTenantMetadata(tenantId, editName.trim(), editTimezone.trim(), editLocale);
      setEditingId('');
    });
  }

  async function assignAdministrator(event: FormEvent<HTMLFormElement>, tenant: PlatformTenant) {
    event.preventDefault();
    const userId = (adminUserIds[tenant.id] || '').trim();
    if (!uuidPattern.test(userId)) {
      setError(tx('Enter a valid existing Auth user ID.'));
      return;
    }
    await runAction(`admin:${tenant.id}`, tx('Administrator assignment saved.'), async () => {
      await setPlatformTenantAdministrator(tenant.id, userId, true);
      setAdminUserIds(values => ({ ...values, [tenant.id]: '' }));
    });
  }

  function requestAdministratorRevocation(tenantId: string) {
    const userId = (adminUserIds[tenantId] || '').trim();
    if (!uuidPattern.test(userId)) {
      setError(tx('Enter a valid existing Auth user ID.'));
      return;
    }
    setError('');
    setConfirmRevoke({ tenantId, userId });
  }

  async function revokeAdministrator() {
    if (!confirmRevoke) return;
    const target = confirmRevoke;
    await runAction(`revoke:${target.tenantId}`, tx('Administrator access revoked.'), async () => {
      await setPlatformTenantAdministrator(target.tenantId, target.userId, false);
      setAdminUserIds(values => ({ ...values, [target.tenantId]: '' }));
      setConfirmRevoke(null);
    });
  }

  if (!platformTenantFeatureAvailable) return <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
    <h2 className="font-semibold">{tx('Platform tenant administration is not enabled.')}</h2>
    <p className="mt-1">{tx('This staging-only workflow is not available in this deployment.')}</p>
  </section>;

  return <section className="space-y-5" aria-labelledby="platform-tenants-heading">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-[#085587]">{tx('Platform administration')}</p>
        <h1 id="platform-tenants-heading" className="mt-1 text-2xl font-semibold text-[#1E1B39]">{tx('Platform tenants')}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">{tx('Only an authorized platform Super Admin can create tenants or appoint tenant administrators. New tenants remain inactive until security certification is complete.')}</p></div>
      <button type="button" onClick={() => void loadTenants()} disabled={loading || Boolean(busy)}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium hover:border-[#08558B] disabled:opacity-50">
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{tx('Refresh')}
      </button>
    </div>

    {!authorized && !checkingAccess && error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <p>{error}</p><button type="button" onClick={() => void loadTenants()} className="mt-3 min-h-10 rounded-md border border-rose-400 px-3 font-medium">{tx('Try again')}</button>
    </div>}
    {authorized && error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p>}
    {checkingAccess || (loading && !tenants.length) ? <p role="status" className="rounded-lg border bg-white p-5 text-sm text-slate-600">{tx('Checking platform access and loading tenant records…')}</p>
      : authorized && <>
        <section className="rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#E6EEF3] text-[#085587]"><Building2 className="h-5 w-5" /></span>
              <div><h2 className="font-semibold text-[#1E1B39]">{tx('Tenant organizations')}</h2><p className="text-xs text-slate-500">{tenants.length} {tx('records returned by the protected platform RPC')}</p></div>
            </div>
            <button type="button" onClick={() => { setCreateOpen(open => !open); setError(''); }} aria-expanded={createOpen}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white hover:bg-[#074770]">
              {createOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{createOpen ? tx('Cancel') : tx('Create tenant')}
            </button>
          </div>

          {createOpen && <form onSubmit={event => void createTenant(event)} className="mt-5 rounded-lg border border-[#DCE8ED] bg-[#F7FAFB] p-4 sm:p-5">
            <div className="mb-4"><h3 className="font-semibold text-[#1E1B39]">{tx('Create tenant')}</h3><p className="mt-1 text-xs text-slate-600">{tx('Provisioning creates an inactive tenant and assigns one already-confirmed Auth account as its first administrator.')}</p></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Field id="platform-tenant-code" label={tx('Tenant code')} value={createForm.code} maxLength={24} pattern="[A-Za-z0-9_]{2,24}" placeholder="ACME_BD" onChange={code => setCreateForm(form => ({ ...form, code }))} />
              <Field id="platform-tenant-slug" label={tx('URL key')} value={createForm.slug} maxLength={80} pattern="[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*" placeholder="acme-bangladesh" onChange={slug => setCreateForm(form => ({ ...form, slug }))} />
              <Field id="platform-tenant-name" label={tx('Organization name')} value={createForm.name} maxLength={180} minLength={2} placeholder="Acme Bangladesh" onChange={name => setCreateForm(form => ({ ...form, name }))} />
              <Field id="platform-tenant-timezone" label={tx('IANA time zone')} value={createForm.timezone} placeholder="Asia/Dhaka" onChange={timezone => setCreateForm(form => ({ ...form, timezone }))} />
              <label className="block text-sm font-medium text-slate-700" htmlFor="platform-tenant-locale">{tx('Default language')}<select id="platform-tenant-locale" value={createForm.defaultLocale} onChange={event => setCreateForm(form => ({ ...form, defaultLocale: event.target.value as 'en' | 'bn' }))} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"><option value="en">English</option><option value="bn">বাংলা</option></select></label>
              <Field id="platform-first-admin-id" label={tx('First administrator Auth user ID')} value={createForm.existingAdminUserId} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" onChange={existingAdminUserId => setCreateForm(form => ({ ...form, existingAdminUserId }))} />
            </div>
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">{tx('Identity lookup and invitations are not part of the approved contract. Enter the UUID of an existing, confirmed account; this screen does not search Auth users.')}</p>
            <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => { setCreateOpen(false); setCreateForm(emptyTenantForm()); setError(''); }} disabled={Boolean(busy)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium disabled:opacity-50">{tx('Cancel')}</button><button type="submit" disabled={Boolean(busy)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />{busy === 'create' ? tx('Creating…') : tx('Create inactive tenant')}</button></div>
          </form>}

          {loading && tenants.length > 0 && <p role="status" className="mt-4 text-sm text-slate-500">{tx('Refreshing tenant records…')}</p>}
          {!loading && tenants.length === 0 ? <div role="status" className="mt-5 rounded-lg bg-slate-50 p-5 text-sm text-slate-600">{tx('No tenant records were returned.')}</div>
            : <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-2">{tenants.map(tenant => <article key={tenant.id} className="min-w-0 rounded-lg border border-[#DEE0E3] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-semibold text-[#1E1B39]">{tenant.name}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tenant.is_active ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{tenant.is_active ? tx('Active') : tx('Inactive')}</span></div>
                <p className="mt-1 break-all text-xs text-slate-500">{tenant.code} · {tenant.slug}</p></div>
                <div className="shrink-0 rounded-lg bg-[#F4F8FA] px-3 py-2 text-center"><span data-testid="tenant-active-admin-count" className="block text-lg font-semibold tabular-nums text-[#1E1B39]">{tenant.active_admin_count}</span><span className="text-[11px] text-slate-500">{tx('active administrators')}</span></div>
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">{tx('Time zone')}</dt><dd className="mt-0.5 break-all">{tenant.timezone}</dd></div><div><dt className="text-xs text-slate-500">{tx('Default language')}</dt><dd className="mt-0.5">{tenant.default_locale === 'bn' ? 'বাংলা' : tenant.default_locale === 'en' ? 'English' : 'Not set'}</dd></div></dl>
              {!tenant.is_active && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950">{tx('Inactive pending broader tenant security certification. Activation is not available in this workflow.')}</p>}

              {editingId === tenant.id ? <form onSubmit={event => void saveMetadata(event, tenant.id)} className="mt-4 space-y-3 rounded-lg bg-[#F7FAFB] p-3">
                <Field id={`tenant-name-${tenant.id}`} label={tx('Organization name')} value={editName} maxLength={180} onChange={setEditName} />
                <Field id={`tenant-timezone-${tenant.id}`} label={tx('IANA time zone')} value={editTimezone} onChange={setEditTimezone} />
                <label className="block text-sm font-medium text-slate-700" htmlFor={`tenant-locale-${tenant.id}`}>{tx('Default language')}<select id={`tenant-locale-${tenant.id}`} value={editLocale} onChange={event => setEditLocale(event.target.value as 'en' | 'bn')} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"><option value="en">English</option><option value="bn">বাংলা</option></select></label>
                <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setEditingId('')} disabled={Boolean(busy)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm">{tx('Cancel')}</button><button type="submit" disabled={Boolean(busy)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#085587] px-3 text-sm font-medium text-white disabled:opacity-50"><Save className="h-4 w-4" />{busy === `metadata:${tenant.id}` ? tx('Saving…') : tx('Save details')}</button></div>
              </form> : <button type="button" onClick={() => { setEditingId(tenant.id); setEditName(tenant.name); setEditTimezone(tenant.timezone); setEditLocale(tenant.default_locale === 'bn' ? 'bn' : 'en'); }} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium hover:border-[#08558B]"><Pencil className="h-4 w-4" />{tx('Edit details')}</button>}

              <details className="mt-3 rounded-lg border border-slate-200"><summary className="min-h-11 cursor-pointer px-3 py-2 text-sm font-medium text-[#085587]">{tx('Manage tenant administrator')}</summary><form onSubmit={event => void assignAdministrator(event, tenant)} className="space-y-3 border-t border-slate-200 p-3">
                <p className="text-xs text-slate-600">{tx('Use an existing, confirmed Auth user UUID. No account directory is exposed.')}</p>
                <Field id={`tenant-admin-user-${tenant.id}`} label={tx('Administrator Auth user ID')} value={adminUserIds[tenant.id] || ''} onChange={value => setAdminUserIds(values => ({ ...values, [tenant.id]: value }))} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                <div className="flex flex-wrap gap-2"><button type="submit" disabled={Boolean(busy)} className="min-h-10 rounded-lg bg-[#085587] px-3 text-sm font-medium text-white disabled:opacity-50">{busy === `admin:${tenant.id}` ? tx('Saving…') : tx('Assign administrator')}</button><button type="button" disabled={Boolean(busy)} onClick={() => requestAdministratorRevocation(tenant.id)} className="min-h-10 rounded-lg border border-rose-300 px-3 text-sm font-medium text-rose-800 disabled:opacity-50">{busy === `revoke:${tenant.id}` ? tx('Revoking…') : tx('Revoke by Auth user ID')}</button></div>
              </form></details>
            </article>)}</div>}
        </section>
        <p className="flex items-start gap-2 text-xs text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#085587]" />{tx('All write actions call tenant-provisioning RPCs that verify the active platform Super Admin session and write an audit record. No service-role credential is used in the browser.')}</p>
      </>}

    {confirmRevoke && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setConfirmRevoke(null); }}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="revoke-admin-title" aria-describedby="revoke-admin-description" className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <h2 id="revoke-admin-title" className="text-lg font-semibold text-slate-900">{tx('Revoke tenant administrator?')}</h2><p id="revoke-admin-description" className="mt-2 break-all text-sm text-slate-600">{tx('This removes active administrator access for')} {confirmRevoke.userId}. {tx('The last active tenant administrator cannot be removed.')}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setConfirmRevoke(null)} disabled={Boolean(busy)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm">{tx('Cancel')}</button><button type="button" onClick={() => void revokeAdministrator()} disabled={Boolean(busy)} className="min-h-11 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy.startsWith('revoke:') ? tx('Revoking…') : tx('Confirm revocation')}</button></div>
      </section>
    </div>}
  </section>;
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { loadRealRoleManagement, saveRealRole } from './realRoleManagementApi';
import type { ManagedPermission, ManagedRole, RealRoleManagement } from './realRoleManagementApi';
import type { Locale } from './project-locale';

const text = {
  en: {
    title: 'Roles and permissions', intro: 'Manage role definitions using the permissions already configured in HRIS.',
    organization: 'Organization', loading: 'Verifying Super Admin access and loading the role catalog…', retry: 'Retry role catalog',
    noRoles: 'No authorized roles are available.', newRole: 'Create role', roles: 'Roles', create: 'New role',
    clone: 'Clone role', inactive: 'Inactive',
    id: 'Role ID', name: 'Role name', description: 'Description', active: 'Role active', system: 'System role · read-only',
    assigned: 'Assigned permissions', none: 'The permission catalog is empty.',
    select: 'Select a role to review or edit its permissions.', save: 'Save role', saving: 'Saving…', cancel: 'Cancel',
    loadingSave: 'Saving role and confirming its stored permissions…', saved: 'Role saved and verified from the server.',
    roleOffConfirm: 'I understand that deactivating this role removes its permissions from users assigned this role.',
    roleOffHint: 'Role deactivation affects access for every account assigned this role.',
    permissionError: 'Select permissions from the loaded HRIS catalog.', roleIdError: 'Role ID uses lowercase letters, numbers, and underscores.',
  },
  bn: {
    title: 'ভূমিকা ও অনুমতি', intro: 'HRIS-এ আগে থেকে কনফিগার করা অনুমতি দিয়ে ভূমিকা পরিচালনা করুন।',
    organization: 'প্রতিষ্ঠান', loading: 'সুপার অ্যাডমিন প্রবেশাধিকার যাচাই ও ভূমিকার তালিকা লোড হচ্ছে…', retry: 'ভূমিকার তালিকা আবার লোড করুন',
    noRoles: 'অনুমোদিত কোনো ভূমিকা নেই।', newRole: 'ভূমিকা তৈরি করুন', roles: 'ভূমিকা', create: 'নতুন ভূমিকা',
    clone: 'ভূমিকা নকল করুন', inactive: 'নিষ্ক্রিয়',
    id: 'ভূমিকা আইডি', name: 'ভূমিকার নাম', description: 'বিবরণ', active: 'ভূমিকা সক্রিয়', system: 'সিস্টেম ভূমিকা · শুধু দেখা যাবে',
    assigned: 'নির্ধারিত অনুমতি', none: 'অনুমতির তালিকা খালি।',
    select: 'অনুমতি পর্যালোচনা বা সম্পাদনার জন্য একটি ভূমিকা বেছে নিন।', save: 'ভূমিকা সংরক্ষণ', saving: 'সংরক্ষণ হচ্ছে…', cancel: 'বাতিল',
    loadingSave: 'ভূমিকা সংরক্ষণ ও সংরক্ষিত অনুমতি যাচাই হচ্ছে…', saved: 'ভূমিকা সংরক্ষণ করে সার্ভার থেকে যাচাই করা হয়েছে।',
    roleOffConfirm: 'আমি বুঝেছি যে এই ভূমিকা নিষ্ক্রিয় করলে সংশ্লিষ্ট ব্যবহারকারীদের কাছ থেকে অনুমতি সরানো হবে।',
    roleOffHint: 'ভূমিকা নিষ্ক্রিয় করলে এতে যুক্ত সব অ্যাকাউন্টের প্রবেশাধিকার প্রভাবিত হবে।',
    permissionError: 'লোড করা HRIS অনুমতির তালিকা থেকে অনুমতি বেছে নিন।', roleIdError: 'ভূমিকা আইডিতে ছোট হাতের অক্ষর, সংখ্যা ও আন্ডারস্কোর ব্যবহার করুন।',
  },
} as const;

export function RealRoleManagement({ tenantId, tenantName, locale }: {
  tenantId: string; tenantName: string; locale: Locale;
}) {
  const copy = text[locale === 'bn' ? 'bn' : 'en'];
  const [data, setData] = useState<RealRoleManagement | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [roleId, setRoleId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [permissionIds, setPermissionIds] = useState<string[]>([]);
  const [deactivationConfirmed, setDeactivationConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [revision, setRevision] = useState(0);
  const saveRef = useRef(false);
  const selectedTenantRef = useRef(tenantId);
  selectedTenantRef.current = tenantId;

  const selectedRole = useMemo(() => data?.roles.find(role => role.id === selectedRoleId) || null, [data, selectedRoleId]);
  const permissionGroups = useMemo(() => {
    const groups = new Map<string, ManagedPermission[]>();
    for (const permission of data?.permissions || []) {
      const group = groups.get(permission.module) || [];
      group.push(permission);
      groups.set(permission.module, group);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  useEffect(() => {
    let current = true;
    setLoading(true); setError(''); setData(null); setSelectedRoleId(null); setCreating(false);
    void loadRealRoleManagement(tenantId).then(result => {
      if (current) setData(result);
    }).catch(cause => {
      if (current) setError(cause instanceof Error ? cause.message : 'Authorized role catalog failed.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [tenantId, revision]);

  function loadRole(role: ManagedRole) {
    setCreating(false); setSelectedRoleId(role.id); setRoleId(role.id); setName(role.name);
    setDescription(role.description); setActive(role.active); setPermissionIds([...role.permissionIds]);
    setDeactivationConfirmed(false); setError(''); setSuccess('');
  }
  function startCreate() {
    setCreating(true); setSelectedRoleId(null); setRoleId(''); setName(''); setDescription('');
    setActive(true); setPermissionIds([]); setDeactivationConfirmed(false); setError(''); setSuccess('');
  }
  function cloneSelectedRole() {
    if (!selectedRole) return;
    const usedIds = new Set(data?.roles.map(role => role.id) || []);
    const base = `${selectedRole.id.slice(0, 57)}_copy`;
    let cloneId = base;
    let suffix = 2;
    while (usedIds.has(cloneId)) {
      const suffixText = `_${suffix++}`;
      cloneId = `${base.slice(0, 64 - suffixText.length)}${suffixText}`;
    }
    setCreating(true); setSelectedRoleId(null); setRoleId(cloneId);
    setName(`${selectedRole.name} copy`.slice(0, 80)); setDescription(selectedRole.description);
    setActive(true); setPermissionIds([...selectedRole.permissionIds]); setDeactivationConfirmed(false);
    setError(''); setSuccess('');
  }
  function togglePermission(id: string, checked: boolean) {
    setPermissionIds(current => checked ? [...new Set([...current, id])] : current.filter(item => item !== id));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveRef.current || !data || selectedRole?.isSystem) return;
    if (!/^[a-z0-9][a-z0-9_]{1,63}$/.test(roleId.trim())) { setError(copy.roleIdError); return; }
    if (selectedRole?.active && !active && !deactivationConfirmed) { setError(copy.roleOffHint); return; }
    if (permissionIds.some(id => !data.permissions.some(permission => permission.id === id))) { setError(copy.permissionError); return; }
    saveRef.current = true; setSaving(true); setError(''); setSuccess('');
    try {
      const saved = await saveRealRole({ tenantId, roleId, originalRoleId: creating ? null : selectedRole?.id, name, description, active, permissionIds });
      if (selectedTenantRef.current !== tenantId) return;
      setData(current => current ? {
        ...current,
        roles: current.roles.some(role => role.id === saved.id)
          ? current.roles.map(role => role.id === saved.id ? saved : role)
          : [...current.roles, saved].sort((a, b) => a.name.localeCompare(b.name)),
      } : current);
      setSelectedRoleId(saved.id); setCreating(false); setSuccess(copy.saved);
    } catch (cause) {
      if (selectedTenantRef.current === tenantId) setError(cause instanceof Error ? cause.message : 'Role could not be saved.');
    } finally {
      saveRef.current = false;
      if (selectedTenantRef.current === tenantId) setSaving(false);
    }
  }

  return <section aria-labelledby="hris-role-management-heading" className="min-w-0 space-y-4">
    <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 id="hris-role-management-heading" className="text-xl font-semibold text-[var(--color-figma-primary-600)]">{copy.title}</h2>
      <p className="mt-2 text-sm text-slate-700">{copy.intro}</p>
      <p className="mt-3 text-sm font-medium">{copy.organization}: {tenantName}</p>
    </header>
    {loading && <p role="status" className="rounded-xl border border-slate-200 bg-white p-4">{copy.loading}</p>}
    {!loading && error && !data && <section role="alert" className="rounded-xl border border-rose-200 bg-white p-4">
      <p className="text-sm text-rose-800">{error}</p>
      <button type="button" onClick={() => setRevision(value => value + 1)} className="mt-3 min-h-11 rounded-lg border border-slate-300 px-4 text-sm">{copy.retry}</button>
    </section>}
    {!loading && data && <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(15rem,0.8fr)_minmax(0,2fr)]">
      <section aria-labelledby="hris-role-list-heading" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 id="hris-role-list-heading" className="font-semibold">{copy.roles}</h3>
          <div className="flex flex-wrap justify-end gap-2">
            {selectedRole && <button type="button" onClick={cloneSelectedRole} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm">{copy.clone}</button>}
            <button type="button" onClick={startCreate} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm">{copy.newRole}</button>
          </div>
        </div>
        {data.roles.length ? <ul className="mt-3 space-y-2">{data.roles.map(role => <li key={role.id}>
          <button type="button" onClick={() => loadRole(role)} aria-pressed={selectedRoleId === role.id}
            className={`min-h-12 w-full rounded-lg border px-3 py-2 text-left text-sm ${selectedRoleId === role.id ? 'border-[var(--color-figma-primary-600)] bg-[#EFF7F8]' : 'border-slate-200 hover:bg-slate-50'}`}>
            <span className="block font-medium">{role.name}</span>
            <span className="mt-1 block text-xs text-slate-600">{role.active ? copy.active : copy.inactive}</span>
          </button>
        </li>)}</ul> : <p className="mt-3 text-sm text-slate-600">{copy.noRoles}</p>}
      </section>
      <section aria-label={creating ? copy.create : selectedRole?.name || copy.title} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        {!creating && !selectedRole ? <p className="text-sm text-slate-600">{copy.select}</p> : <>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-semibold">{creating ? copy.create : selectedRole?.name}</h3>
            {selectedRole?.isSystem && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{copy.system}</span>}
          </div>
          <form onSubmit={event => void submit(event)} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">{copy.id}
                <input required minLength={2} maxLength={64} value={roleId} disabled={!creating || saving || !!selectedRole?.isSystem}
                  onChange={event => setRoleId(event.target.value.toLowerCase())} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm disabled:bg-slate-50" />
              </label>
              <label className="block text-sm font-medium">{copy.name}
                <input required minLength={2} maxLength={80} value={name} disabled={saving || !!selectedRole?.isSystem}
                  onChange={event => setName(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm disabled:bg-slate-50" />
              </label>
            </div>
            <label className="block text-sm font-medium">{copy.description}
              <textarea maxLength={240} rows={3} value={description} disabled={saving || !!selectedRole?.isSystem}
                onChange={event => setDescription(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50" />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={active} disabled={saving || !!selectedRole?.isSystem}
                onChange={event => { setActive(event.target.checked); setDeactivationConfirmed(false); }} className="h-4 w-4 accent-[var(--color-figma-primary-600)]" />
              {copy.active}
            </label>
            {selectedRole?.active && !active && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-900">{copy.roleOffHint}</p>
              <label className="flex items-start gap-2 text-sm text-amber-950">
                <input type="checkbox" checked={deactivationConfirmed} disabled={saving} onChange={event => setDeactivationConfirmed(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-figma-primary-600)]" />
                <span>{copy.roleOffConfirm}</span>
              </label>
            </div>}
            <fieldset disabled={saving || !!selectedRole?.isSystem} className="min-w-0 space-y-3">
              <legend className="mb-2 font-medium">{copy.assigned}</legend>
              {permissionGroups.length ? permissionGroups.map(([module, permissions]) => <details key={module} className="rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer font-medium">{module} <span className="ml-1 text-xs font-normal text-slate-600">({permissions.filter(permission => permissionIds.includes(permission.id)).length}/{permissions.length})</span></summary>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {permissions.map(permission => <label key={permission.id} title={permission.description || undefined} className="flex min-h-10 items-center gap-2 rounded-md px-2 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={permissionIds.includes(permission.id)} onChange={event => togglePermission(permission.id, event.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--color-figma-primary-600)]" />
                    <span>{permission.action}</span>
                  </label>)}
                </div>
              </details>) : <p className="text-sm text-slate-600">{copy.none}</p>}
            </fieldset>
            {!selectedRole?.isSystem && <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={saving || !roleId.trim() || name.trim().length < 2 || (selectedRole?.active === true && !active && !deactivationConfirmed)}
                className="min-h-11 rounded-lg bg-[var(--color-figma-primary-600)] px-5 text-sm font-medium text-white disabled:opacity-50">
                {saving ? copy.saving : copy.save}
              </button>
              <button type="button" disabled={saving} onClick={() => { setCreating(false); setSelectedRoleId(null); setError(''); }}
                className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm">{copy.cancel}</button>
            </div>}
          </form>
        </>}
      </section>
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-white p-4 text-sm text-rose-800 xl:col-span-2">{error}</p>}
      {saving && <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm xl:col-span-2">{copy.loadingSave}</p>}
      {success && <p role="status" className="rounded-xl border border-emerald-200 bg-white p-4 text-sm text-emerald-900 xl:col-span-2">{success}</p>}
    </div>}
  </section>;
}

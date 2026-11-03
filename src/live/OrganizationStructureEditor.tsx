import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { readAllOrganizationPages } from './organizationTeamsPages.mjs';
import { departmentSavePayload, mayWriteSelectedTenant, teamSavePayload } from './organizationStructureContract.mjs';
import type { Locale } from './project-locale';

type Department = { id: string; name: string; code: string; description: string | null; location_id: string | null; active: boolean };
type Team = { id: string; name: string; code: string; department_id: string; active: boolean };
type Location = { id: string; name: string };
type Kind = 'department' | 'team';
type Draft = {
  kind: Kind; id: string | null; name: string; code: string;
  description: string; locationId: string; departmentId: string;
  active: boolean; originallyActive: boolean;
};
const fieldClass = 'mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-[#085587]';
const secondaryClass = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[#085587] disabled:opacity-50';
const primaryClass = 'min-h-11 rounded-lg bg-[#085587] px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-[#085587] disabled:opacity-50';

const copy = {
  en: {
    heading: 'Manage departments and teams', info: 'Save organization changes to the authorized tenant. Existing records are updated in place.',
    addDepartment: 'New department', addTeam: 'New team', department: 'Department', team: 'Team',
    name: 'Name', code: 'Code', description: 'Description', location: 'Office / location',
    noLocation: 'No location', selectDepartment: 'Select department', active: 'Active',
    edit: 'Edit', save: 'Save changes', saving: 'Saving…', cancel: 'Cancel',
    loading: 'Checking organization management access…',
    loadingRecords: 'Loading organization structure…',
    noTeams: 'No teams have been created.', noDepartments: 'No departments have been created.',
    noTeamCreation: 'Create a department before creating a team.',
    accessBlocked: 'Editing is unavailable: the signed-in account does not resolve to exactly this organization. Ask an administrator to review tenant access.',
    cannotLoad: 'Unable to verify organization management access or load records. Refresh and retry.',
    retry: 'Retry', duplicate: 'This code already exists in this organization.',
    invalidLink: 'The selected department or location is unavailable to this organization.',
    permissionError: 'Organization management permission is required.',
    missing: 'This record was not found in the signed-in organization.',
    invalidFields: 'Enter the required name, code, and department where applicable.',
    saveFailed: 'Changes could not be confirmed. Refresh before retrying to avoid duplicate records.',
    readbackFailed: 'The save response was received, but the persisted record could not be verified. Refresh before making another change.',
    saved: 'Changes saved and verified in this organization.',
    confirmInactive: 'I confirm this record should become inactive. Its historical references will remain.',
    loadCount: 'Records loaded', noPermission: 'Only users with organization management permission can edit these records.',
    inactive: 'Inactive', closeEditor: 'Close editor',
  },
  bn: {
    heading: 'বিভাগ ও দল পরিচালনা', info: 'অনুমোদিত প্রতিষ্ঠানে পরিবর্তন সংরক্ষণ করুন। বিদ্যমান রেকর্ড একই পরিচয়ে হালনাগাদ হবে।',
    addDepartment: 'নতুন বিভাগ', addTeam: 'নতুন দল', department: 'বিভাগ', team: 'দল',
    name: 'নাম', code: 'কোড', description: 'বিবরণ', location: 'অফিস / অবস্থান',
    noLocation: 'কোনো অবস্থান নয়', selectDepartment: 'বিভাগ নির্বাচন করুন', active: 'সক্রিয়',
    edit: 'সম্পাদনা', save: 'পরিবর্তন সংরক্ষণ', saving: 'সংরক্ষণ হচ্ছে…', cancel: 'বাতিল',
    loading: 'প্রতিষ্ঠান পরিচালনার অনুমতি যাচাই হচ্ছে…',
    loadingRecords: 'প্রতিষ্ঠানের কাঠামো লোড হচ্ছে…',
    noTeams: 'এখনও কোনো দল তৈরি করা হয়নি।', noDepartments: 'এখনও কোনো বিভাগ তৈরি করা হয়নি।',
    noTeamCreation: 'দল তৈরির আগে একটি বিভাগ তৈরি করুন।',
    accessBlocked: 'সম্পাদনা সম্ভব নয়: বর্তমান অ্যাকাউন্টটি এই প্রতিষ্ঠানকে নির্দিষ্টভাবে শনাক্ত করতে পারছে না। প্রশাসকের সঙ্গে যোগাযোগ করুন।',
    cannotLoad: 'প্রতিষ্ঠান পরিচালনার অনুমতি বা রেকর্ড যাচাই করা যায়নি। রিফ্রেশ করে আবার চেষ্টা করুন।',
    retry: 'আবার চেষ্টা', duplicate: 'এই প্রতিষ্ঠানে কোডটি ইতিমধ্যে আছে।',
    invalidLink: 'নির্বাচিত বিভাগ বা অবস্থান এই প্রতিষ্ঠানে পাওয়া যায়নি।',
    permissionError: 'প্রতিষ্ঠান পরিচালনার অনুমতি প্রয়োজন।',
    missing: 'বর্তমান প্রতিষ্ঠানে রেকর্ডটি পাওয়া যায়নি।',
    invalidFields: 'প্রয়োজনীয় নাম, কোড এবং প্রযোজ্য ক্ষেত্রে বিভাগ দিন।',
    saveFailed: 'পরিবর্তন নিশ্চিত করা যায়নি। একই রেকর্ড পুনরায় তৈরির ঝুঁকি এড়াতে আগে রিফ্রেশ করুন।',
    readbackFailed: 'সংরক্ষণের উত্তর পাওয়া গেছে, কিন্তু রেকর্ড যাচাই করা যায়নি। আরেকটি পরিবর্তনের আগে রিফ্রেশ করুন।',
    saved: 'এই প্রতিষ্ঠানে পরিবর্তন সংরক্ষিত ও যাচাই করা হয়েছে।',
    confirmInactive: 'রেকর্ডটি নিষ্ক্রিয় করতে নিশ্চিত করছি। পূর্বের সম্পর্কগুলো অক্ষত থাকবে।',
    loadCount: 'লোড হওয়া রেকর্ড', noPermission: 'শুধু প্রতিষ্ঠান পরিচালনার অনুমতি পাওয়া ব্যবহারকারী রেকর্ড সম্পাদনা করতে পারবেন।',
    inactive: 'নিষ্ক্রিয়', closeEditor: 'সম্পাদক বন্ধ করুন',
  },
};

function blank(kind: Kind, defaultDepartmentId = ''): Draft {
  return { kind, id: null, name: '', code: '', description: '', locationId: '',
    departmentId: defaultDepartmentId, active: true, originallyActive: true };
}

export function OrganizationStructureEditor({
  tenantId, locale = 'en', onSaved,
}: { tenantId: string; locale?: Locale; onSaved: () => void }) {
  const t = copy[locale === 'bn' ? 'bn' : 'en'];
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [scopeBlocked, setScopeBlocked] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmInactive, setConfirmInactive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const activeTenant = useRef(tenantId);
  activeTenant.current = tenantId;

  useEffect(() => {
    let current = true;
    const requestId = ++generation.current;
    const isCurrent = () => current && generation.current === requestId && activeTenant.current === tenantId;
    setLoading(true);
    setCanManage(false);
    setScopeBlocked(false);
    setLoadError(false);
    setDepartments([]);
    setTeams([]);
    setLocations([]);
    setDraft(null);
    setFormError('');
    setSaving(false);
    void (async () => {
      const [permission, resolved] = await Promise.all([
        supabase.rpc('has_tenant_permission', { p_tenant_id: tenantId, p_permission_id: 'organization.manage' }),
        supabase.rpc('synesis_tenant_id'),
      ]);
      if (!isCurrent()) return;
      if (permission.error || resolved.error) throw new Error('Could not verify organization access.');
      if (permission.data !== true) return;
      if (!mayWriteSelectedTenant(permission.data, resolved.data, tenantId)) {
        setScopeBlocked(true);
        return;
      }
      const [dep, team, loc] = await Promise.all([
        readAllOrganizationPages(async (from, to) => {
          const r = await supabase.from('departments')
            .select('id,name,code,description,location_id,active').eq('tenant_id', tenantId)
            .order('name', { ascending: true }).order('id', { ascending: true }).range(from, to);
          return { data: r.data, error: r.error };
        }, isCurrent),
        readAllOrganizationPages(async (from, to) => {
          const r = await supabase.from('teams')
            .select('id,name,code,department_id,active').eq('tenant_id', tenantId)
            .order('name', { ascending: true }).order('id', { ascending: true }).range(from, to);
          return { data: r.data, error: r.error };
        }, isCurrent),
        readAllOrganizationPages(async (from, to) => {
          const r = await supabase.from('org_locations')
            .select('id,name').eq('tenant_id', tenantId)
            .order('name', { ascending: true }).order('id', { ascending: true }).range(from, to);
          return { data: r.data, error: r.error };
        }, isCurrent),
      ]);
      if (!isCurrent()) return;
      setDepartments(dep as Department[]);
      setTeams(team as Team[]);
      setLocations(loc as Location[]);
      setCanManage(true);
    })().catch(() => { if (isCurrent()) setLoadError(true); })
      .finally(() => { if (isCurrent()) setLoading(false); });
    return () => { current = false; generation.current += 1; };
  }, [tenantId, revision]);

  function openCreate(kind: Kind) {
    if (!canManage) return;
    setDraft(blank(kind, departments[0]?.id || ''));
    setConfirmInactive(false);
    setFormError('');
    setNotice('');
  }
  function openDepartment(item: Department) {
    if (!canManage) return;
    setDraft({ ...blank('department'), id: item.id, name: item.name, code: item.code,
      description: item.description || '', locationId: item.location_id || '',
      active: item.active, originallyActive: item.active });
    setConfirmInactive(false); setFormError(''); setNotice('');
  }
  function openTeam(item: Team) {
    if (!canManage) return;
    setDraft({ ...blank('team'), id: item.id, name: item.name, code: item.code,
      departmentId: item.department_id, active: item.active, originallyActive: item.active });
    setConfirmInactive(false); setFormError(''); setNotice('');
  }
  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(previous => previous ? { ...previous, [key]: value } : previous);
    setFormError('');
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !canManage || saving || activeTenant.current !== tenantId) return;
    if (draft.id && draft.originallyActive && !draft.active && !confirmInactive) {
      setFormError(t.confirmInactive);
      return;
    }
    const requestId = generation.current;
    const stillCurrent = () => generation.current === requestId && activeTenant.current === tenantId;
    let payload: ReturnType<typeof departmentSavePayload> | ReturnType<typeof teamSavePayload>;
    try {
      payload = draft.kind === 'department' ? departmentSavePayload(draft) : teamSavePayload(draft);
    } catch {
      setFormError(t.invalidFields);
      return;
    }
    setSaving(true);
    setFormError('');
    setNotice('');
    try {
      // Recheck both server-authorized role and unambiguous tenant before every mutation.
      const [permission, resolved] = await Promise.all([
        supabase.rpc('has_tenant_permission', { p_tenant_id: tenantId, p_permission_id: 'organization.manage' }),
        supabase.rpc('synesis_tenant_id'),
      ]);
      if (!stillCurrent()) return;
      if (permission.error || resolved.error || !mayWriteSelectedTenant(permission.data, resolved.data, tenantId)) {
        setFormError(t.permissionError);
        return;
      }
      const result = draft.kind === 'department'
        ? await supabase.rpc('admin_save_department', { p_id: draft.id, p_payload: payload })
        : await supabase.rpc('admin_save_team', { p_id: draft.id, p_payload: payload });
      if (!stillCurrent()) return;
      if (result.error || typeof result.data !== 'string') {
        const code = result.error?.code;
        setFormError(code === '23505' ? t.duplicate : code === '23503' ? t.invalidLink
          : code === '42501' ? t.permissionError : code === 'P0002' ? t.missing : t.saveFailed);
        return;
      }
      const readback = draft.kind === 'department'
        ? await supabase.from('departments').select('id,tenant_id').eq('tenant_id', tenantId)
          .eq('id', result.data).maybeSingle()
        : await supabase.from('teams').select('id,tenant_id').eq('tenant_id', tenantId)
          .eq('id', result.data).maybeSingle();
      if (!stillCurrent()) return;
      if (readback.error || readback.data?.id !== result.data || readback.data?.tenant_id !== tenantId) {
        setFormError(t.readbackFailed);
        return;
      }
      setDraft(null);
      setNotice(t.saved);
      setRevision(value => value + 1);
      onSaved();
    } catch {
      if (stillCurrent()) setFormError(t.saveFailed);
    } finally {
      if (stillCurrent()) setSaving(false);
    }
  }

  if (loading) return <p role="status" className="text-sm text-slate-600">{t.loading}</p>;
  if (loadError) return <p role="alert" className="text-sm text-red-700">{t.cannotLoad}
    <button type="button" className={secondaryClass} onClick={() => setRevision(value => value + 1)}>{t.retry}</button>
  </p>;
  if (scopeBlocked) return <p role="status" className="text-sm text-slate-600">{t.accessBlocked}</p>;
  if (!canManage) return null;

  return <section aria-label={t.heading} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-medium text-slate-900">{t.heading}</h3>
        <p className="text-sm text-slate-600">{t.info}</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => openCreate('department')} className={secondaryClass}>{t.addDepartment}</button>
        <button type="button" disabled={departments.length === 0} onClick={() => openCreate('team')} className={secondaryClass}>{t.addTeam}</button>
      </div>
    </div>
    {notice && <p role="status" className="text-sm text-[#085587]">{notice}</p>}
    {draft && <form onSubmit={event => void save(event)} aria-label={t.heading} className="space-y-4 rounded-lg border border-slate-200 p-3">
      <h4 className="font-semibold text-slate-900">{draft.id ? t.edit : draft.kind === 'team' ? t.addTeam : t.addDepartment}</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">{t.name}
          <input className={fieldClass} maxLength={180} required disabled={saving}
            value={draft.name} onChange={event => update('name', event.target.value)}/></label>
        <label className="text-sm font-medium">{t.code}
          <input className={fieldClass} maxLength={60} required disabled={saving}
            value={draft.code} onChange={event => update('code', event.target.value)}/></label>
        {draft.kind === 'department' ? <>
          <label className="text-sm font-medium">{t.location}
            <select className={fieldClass} disabled={saving} value={draft.locationId}
              onChange={event => update('locationId', event.target.value)}>
              <option value="">{t.noLocation}</option>
              {draft.locationId && !locations.some(item => item.id === draft.locationId) &&
                <option value={draft.locationId}>{t.location}</option>}
              {locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
          <label className="text-sm font-medium">{t.description}
            <input className={fieldClass} disabled={saving} value={draft.description}
              onChange={event => update('description', event.target.value)}/></label>
        </> : <label className="text-sm font-medium">{t.department}
          <select className={fieldClass} required disabled={saving} value={draft.departmentId}
            onChange={event => update('departmentId', event.target.value)}>
            <option value="">{t.selectDepartment}</option>
            {departments.map(item => <option key={item.id} value={item.id}>{item.name}{item.active ? '' : ' (' + t.inactive + ')'}</option>)}
          </select></label>}
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" disabled={saving} checked={draft.active}
          onChange={event => { update('active', event.target.checked); setConfirmInactive(false); }}/>
        {t.active}
      </label>
      {draft.id && draft.originallyActive && !draft.active &&
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" disabled={saving} required checked={confirmInactive}
            onChange={event => setConfirmInactive(event.target.checked)}/>
          {t.confirmInactive}
        </label>}
      {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={primaryClass}>{saving ? t.saving : t.save}</button>
        <button type="button" disabled={saving} className={secondaryClass} onClick={() => { setDraft(null); setFormError(''); }}>{t.cancel}</button>
      </div>
    </form>}
    <div className="grid gap-4 md:grid-cols-2">
      <section aria-label={t.department} className="space-y-2">
        <h4 className="font-medium">{t.department} ({departments.length.toLocaleString()})</h4>
        {departments.length === 0 ? <p className="text-sm text-slate-600">{t.noDepartments}</p>
          : <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100">
            {departments.map(item => <li key={item.id} className="flex items-center justify-between gap-2 py-2">
              <p className="text-sm">{item.name} · {item.code}{item.active ? '' : ' · ' + t.inactive}</p>
              <button type="button" className={secondaryClass} onClick={() => openDepartment(item)}
                aria-label={t.edit + ' ' + item.name}>{t.edit}</button>
            </li>)}
          </ul>}
      </section>
      <section aria-label={t.team} className="space-y-2">
        <h4 className="font-medium">{t.team} ({teams.length.toLocaleString()})</h4>
        {teams.length === 0 ? <p className="text-sm text-slate-600">{t.noTeams}</p>
          : <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100">
            {teams.map(item => <li key={item.id} className="flex items-center justify-between gap-2 py-2">
              <p className="text-sm">{item.name} · {item.code}{item.active ? '' : ' · ' + t.inactive}</p>
              <button type="button" className={secondaryClass} onClick={() => openTeam(item)}
                aria-label={t.edit + ' ' + item.name}>{t.edit}</button>
            </li>)}
          </ul>}
      </section>
    </div>
  </section>;
}

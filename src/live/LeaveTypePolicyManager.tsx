import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Pencil, Plus, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { projectText, type Locale } from './project-locale';

type LeaveType = {
  id: string;
  name: string;
  code: string;
  applicable_gender: string | null;
  min_days_notice: number | null;
  requires_document_proof: boolean;
  annual_entitlement: number;
  active: boolean;
};
type LeaveTypeDraft = Omit<LeaveType, 'id'> & { id: string };

function row(value: Record<string, unknown>): LeaveType {
  return {
    id: String(value.id || ''), name: String(value.name || ''), code: String(value.code || ''),
    applicable_gender: value.applicable_gender == null ? null : String(value.applicable_gender),
    min_days_notice: value.min_days_notice == null ? null : Number(value.min_days_notice),
    requires_document_proof: value.requires_document_proof === true,
    annual_entitlement: Number(value.annual_entitlement || 0), active: value.active === true,
  };
}

const blank = (): LeaveTypeDraft => ({
  id: crypto.randomUUID(), name: '', code: '', applicable_gender: null,
  min_days_notice: null, requires_document_proof: false, annual_entitlement: 0, active: true,
});

function expected(item: LeaveType) {
  return {
    name: item.name, code: item.code, applicable_gender: item.applicable_gender,
    min_days_notice: item.min_days_notice, annual_entitlement: item.annual_entitlement,
    requires_document_proof: item.requires_document_proof, active: item.active,
  };
}

export function LeaveTypePolicyManager({
  tenantId, leaveTypes, locale, onRefresh,
}: {
  tenantId: string;
  leaveTypes: Record<string, unknown>[];
  locale: Locale;
  onRefresh: () => Promise<void>;
}) {
  const tx = (value: string) => projectText(locale, value);
  const types = useMemo(() => leaveTypes.map(row).filter(item => item.id), [leaveTypes]);
  const [draft, setDraft] = useState<LeaveTypeDraft | null>(null);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return types.filter(item => (filter === 'all' || item.active === (filter === 'active'))
      && (!needle || `${item.name} ${item.code} ${item.applicable_gender || ''}`.toLocaleLowerCase().includes(needle)));
  }, [filter, search, types]);

  function startCreate() {
    setError(''); setMessage(''); setEditing(null); setDraft(blank());
  }

  function startEdit(item: LeaveType) {
    setError(''); setMessage(''); setEditing(item);
    setDraft({ ...item });
    window.setTimeout(() => document.getElementById('leave-type-name')?.focus(), 0);
  }

  function cancel() {
    setDraft(null); setEditing(null); setError('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) return;
    const entitlement = Number(draft.annual_entitlement);
    const notice = draft.min_days_notice == null || Number.isNaN(Number(draft.min_days_notice))
      ? null : Number(draft.min_days_notice);
    if (!Number.isFinite(entitlement) || entitlement < 0) {
      setError(tx('Enter a zero or positive annual entitlement.'));
      return;
    }
    if (notice != null && (!Number.isInteger(notice) || notice < 0)) {
      setError(tx('Minimum advance notice must be a whole number of days.'));
      return;
    }
    const payload = {
      name: draft.name.trim(), code: draft.code.trim(),
      applicable_gender: draft.applicable_gender?.trim() || null,
      min_days_notice: notice, annual_entitlement: entitlement,
      requires_document_proof: draft.requires_document_proof, active: draft.active,
    };
    setSaving(true); setError(''); setMessage('');
    try {
      const result = await supabase.rpc('hris_save_leave_type', {
        p_tenant_id: tenantId, p_leave_type_id: draft.id, p_payload: payload,
        p_expected: editing ? expected(editing) : null,
      });
      if (result.error) throw result.error;
      const saved = result.data && typeof result.data === 'object' ? row(result.data as Record<string, unknown>) : null;
      if (!saved?.id || saved.id !== draft.id) throw new Error(tx('The leave policy response could not be verified. Refresh and check the leave type list.'));
      setMessage(editing ? tx('Leave type updated.') : tx('Leave type added.'));
      setDraft(null); setEditing(null);
      await onRefresh();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : tx('Unable to save this leave type. Refresh and retry.');
      setError(detail);
      if (detail.includes('changed since it was opened')) await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function setActive(item: LeaveType) {
    if (saving || savingId) return;
    if (item.active && !window.confirm(`${tx('Deactivate')} “${item.name}”? ${tx('It will no longer be available for new employee requests.')}`)) return;
    setSavingId(item.id); setError(''); setMessage('');
    try {
      const result = await supabase.rpc('hris_save_leave_type', {
        p_tenant_id: tenantId, p_leave_type_id: item.id,
        p_payload: { ...expected(item), active: !item.active }, p_expected: expected(item),
      });
      if (result.error) throw result.error;
      setMessage(item.active ? tx('Leave type deactivated.') : tx('Leave type activated.'));
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tx('Unable to update this leave type. Refresh and retry.'));
      await onRefresh();
    } finally {
      setSavingId('');
    }
  }

  const fieldClass = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
  const labelClass = 'block min-w-0 text-xs font-medium text-slate-600';

  return <section aria-labelledby="leave-policy-title" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h3 id="leave-policy-title" className="font-semibold text-[#08263D]">{tx('Leave type policies')}</h3>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{tx('Configure the existing leave types and request requirements for this organization.')}</p>
        <p className="mt-1 max-w-3xl text-xs text-slate-500">{tx('Annual entitlement is the default used when an employee balance is first created. Existing employee balance records are preserved.')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" aria-label={tx('Refresh leave type policies')} onClick={() => { setError(''); setMessage(''); void onRefresh(); }} disabled={saving || Boolean(savingId)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true"/>{tx('Refresh')}</button>
        <button type="button" onClick={startCreate} disabled={saving || Boolean(savingId)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50"><Plus className="h-4 w-4" aria-hidden="true"/>{tx('Add leave type')}</button>
      </div>
    </div>

    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p role="alert">{tx(error)}</p><button type="button" onClick={() => void onRefresh()} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">{tx('Retry')}</button></div>}
    {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}

    {draft && <form onSubmit={save} aria-labelledby="leave-type-form-heading" className="rounded-xl border border-[#B9DCE2] bg-[#FBFDFD] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3"><div><h4 id="leave-type-form-heading" className="font-semibold text-[#1E1B39]">{tx(editing ? 'Edit leave type' : 'Add a leave type')}</h4><p className="mt-1 text-xs text-slate-600">{tx('Only the existing leave policy fields are changed.')}</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className={labelClass}>{tx('Leave type name')} *<input id="leave-type-name" required maxLength={160} value={draft.name} onChange={event => setDraft(value => value && ({ ...value, name: event.target.value }))} className={fieldClass}/></label>
        <label className={labelClass}>{tx('Code')} *<input required maxLength={64} value={draft.code} onChange={event => setDraft(value => value && ({ ...value, code: event.target.value }))} className={fieldClass}/></label>
        <label className={labelClass}>{tx('Gender applicability')}<input maxLength={80} value={draft.applicable_gender || ''} onChange={event => setDraft(value => value && ({ ...value, applicable_gender: event.target.value || null }))} className={fieldClass}/><span className="mt-1 block font-normal">{tx('Leave blank for no gender restriction.')}</span></label>
        <label className={labelClass}>{tx('Default annual entitlement (days)')} *<input type="number" required min="0" step="any" value={draft.annual_entitlement} onChange={event => setDraft(value => value && ({ ...value, annual_entitlement: Number(event.target.value) }))} className={fieldClass}/></label>
        <label className={labelClass}>{tx('Minimum advance notice (days)')}<input type="number" min="0" step="1" value={draft.min_days_notice ?? ''} onChange={event => setDraft(value => value && ({ ...value, min_days_notice: event.target.value === '' ? null : Number(event.target.value) }))} className={fieldClass}/></label>
        <div className="flex flex-col justify-end gap-2 pb-1 text-sm text-slate-700">
          <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={draft.requires_document_proof} onChange={event => setDraft(value => value && ({ ...value, requires_document_proof: event.target.checked }))} className="h-4 w-4 accent-[#08558B]"/>{tx('Supporting evidence required')}</label>
          <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={draft.active} onChange={event => setDraft(value => value && ({ ...value, active: event.target.checked }))} className="h-4 w-4 accent-[#08558B]"/>{tx('Available for new requests')}</label>
        </div>
      </div>
      {editing && <p className="mt-3 text-xs text-slate-500">{tx('Changing the default entitlement does not rewrite existing employee balance records.')}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={cancel} disabled={saving} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm disabled:opacity-50">{tx('Cancel')}</button><button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50"><Check className="h-4 w-4" aria-hidden="true"/>{saving ? tx('Saving…') : tx(editing ? 'Save changes' : 'Add leave type')}</button></div>
    </form>}

    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
      <label className={labelClass}>{tx('Search leave types')}<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={tx('Name, code, or applicability')} className={fieldClass}/></label>
      <label className={labelClass}>{tx('Show')}<select value={filter} onChange={event => setFilter(event.target.value as typeof filter)} className={fieldClass}><option value="active">{tx('Active leave types')}</option><option value="inactive">{tx('Inactive leave types')}</option><option value="all">{tx('All leave types')}</option></select></label>
    </div>

    {!filtered.length ? <div role="status" className="rounded-lg border border-dashed border-[#B9DCE2] bg-white p-6 text-center"><h4 className="font-semibold text-slate-800">{search ? tx('No leave types match this search.') : filter === 'active' ? tx('No active leave types.') : tx('No leave types found.')}</h4><p className="mt-1 text-sm text-slate-600">{tx('Add a leave type or change the filters to view existing policy records.')}</p></div>
      : <div className="overflow-x-auto rounded-lg border border-slate-200" role="region" aria-label={tx('Leave type policy table')} tabIndex={0}>
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[#EFF7F8] text-xs text-slate-600"><tr>{['Leave type name','Code','Gender applicability','Annual entitlement','Minimum notice','Evidence','Status','Actions'].map(label => <th key={label} scope="col" className="px-3 py-3 font-medium">{tx(label)}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{filtered.map(item => <tr key={item.id}>
            <td className="px-3 py-3 font-medium text-slate-900">{item.name}</td><td className="px-3 py-3">{item.code}</td><td className="px-3 py-3">{item.applicable_gender || tx('Any')}</td>
            <td className="px-3 py-3">{item.annual_entitlement}</td><td className="px-3 py-3">{item.min_days_notice == null ? '—' : item.min_days_notice}</td>
            <td className="px-3 py-3">{tx(item.requires_document_proof ? 'Required' : 'Optional')}</td><td className="px-3 py-3">{tx(item.active ? 'Active' : 'Inactive')}</td>
            <td className="px-3 py-3"><div className="flex gap-2"><button type="button" onClick={() => startEdit(item)} disabled={saving || Boolean(savingId)} aria-label={`${tx('Edit')} ${item.name}`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium disabled:opacity-50"><Pencil className="h-3.5 w-3.5" aria-hidden="true"/>{tx('Edit')}</button><button type="button" onClick={() => void setActive(item)} disabled={saving || Boolean(savingId)} aria-label={`${tx(item.active ? 'Deactivate' : 'Activate')} ${item.name}`} className="min-h-10 rounded-md border border-slate-300 px-3 text-xs font-medium disabled:opacity-50">{savingId === item.id ? tx('Saving…') : tx(item.active ? 'Deactivate' : 'Activate')}</button></div></td>
          </tr>)}</tbody>
        </table>
      </div>}
    <p className="text-xs text-slate-500">{filtered.length} {tx('leave types shown.')}</p>
  </section>;
}

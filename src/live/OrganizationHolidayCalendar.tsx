import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarDays, Check, Pencil, Plus, RefreshCw, Search, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Holiday = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  holiday_type: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};
type HolidayDraft = Omit<Holiday, 'id' | 'created_at' | 'updated_at'>;
type HolidayFilter = 'all' | 'active' | 'inactive';

const blankHoliday = (): HolidayDraft => ({
  name: '', start_date: '', end_date: '', holiday_type: 'general', description: '', active: true,
});

function holidayRows(value: unknown): Holiday[] {
  if (!Array.isArray(value)) throw new Error('The holiday calendar returned an invalid response.');
  return value.map((row): Holiday => {
    if (!row || typeof row !== 'object') throw new Error('The holiday calendar returned an invalid response.');
    const item = row as Partial<Holiday>;
    if (typeof item.id !== 'string' || typeof item.name !== 'string'
        || typeof item.start_date !== 'string' || typeof item.end_date !== 'string'
        || typeof item.holiday_type !== 'string' || typeof item.active !== 'boolean') {
      throw new Error('The holiday calendar returned an invalid response.');
    }
    return item as Holiday;
  });
}

function readableDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function dates(holiday: Pick<HolidayDraft, 'start_date' | 'end_date'>): string {
  return holiday.start_date === holiday.end_date
    ? readableDate(holiday.start_date)
    : `${readableDate(holiday.start_date)} – ${readableDate(holiday.end_date)}`;
}

export function OrganizationHolidayCalendar({ tenantId }: { tenantId: string }) {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [draft, setDraft] = useState<HolidayDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<HolidayFilter>('active');
  const [revision, setRevision] = useState(0);
  const requestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  const previousTenantId = useRef(tenantId);
  activeTenantId.current = tenantId;

  useEffect(() => {
    const requestId = ++requestSequence.current;
    const requestedTenant = tenantId;
    const current = () => requestSequence.current === requestId && activeTenantId.current === requestedTenant;
    setHolidays([]);
    setDraft(null);
    setEditingId(null);
    setError('');
    if (previousTenantId.current !== requestedTenant) {
      previousTenantId.current = requestedTenant;
      setMessage('');
    }
    setLoading(true);
    void (async () => {
      try {
        const result = await supabase.rpc('hris_get_org_holiday_calendar', { p_tenant_id: requestedTenant });
        if (!current()) return;
        if (result.error) throw result.error;
        setHolidays(holidayRows(result.data));
      } catch (cause) {
        if (current()) setError(cause instanceof Error ? cause.message : 'Unable to load the holiday calendar.');
      } finally {
        if (current()) setLoading(false);
      }
    })();
    return () => { if (requestId === requestSequence.current) requestSequence.current += 1; };
  }, [tenantId, revision]);

  const visibleHolidays = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return holidays.filter(holiday => (filter === 'all' || holiday.active === (filter === 'active'))
      && (!query || [holiday.name, holiday.holiday_type, holiday.description || '']
        .some(value => value.toLocaleLowerCase().includes(query))));
  }, [filter, holidays, search]);

  function startCreate() {
    setError('');
    setMessage('');
    setEditingId(null);
    setDraft(blankHoliday());
  }

  function startEdit(holiday: Holiday) {
    setError('');
    setMessage('');
    setEditingId(holiday.id);
    setDraft({
      name: holiday.name, start_date: holiday.start_date, end_date: holiday.end_date,
      holiday_type: holiday.holiday_type, description: holiday.description || '', active: holiday.active,
    });
    window.setTimeout(() => document.getElementById('holiday-name')?.focus(), 0);
  }

  function cancelForm() {
    setDraft(null);
    setEditingId(null);
    setError('');
  }

  async function saveHoliday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving) return;
    if (draft.end_date < draft.start_date) {
      setError('The end date must be the same as or later than the start date.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result = await supabase.rpc('hris_save_org_holiday', {
        p_tenant_id: tenantId,
        p_holiday_id: editingId,
        p_name: draft.name.trim(),
        p_start_date: draft.start_date,
        p_end_date: draft.end_date,
        p_holiday_type: draft.holiday_type.trim() || 'general',
        p_description: draft.description?.trim() || null,
        p_active: draft.active,
      });
      if (result.error) throw result.error;
      setMessage(editingId ? 'Holiday updated.' : 'Holiday added to the organization calendar.');
      setDraft(null);
      setEditingId(null);
      setRevision(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this holiday. Check the details and retry.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(holiday: Holiday) {
    if (saving || savingId) return;
    if (holiday.active && !window.confirm(`Deactivate “${holiday.name}”? It will no longer appear in employee holiday calendars.`)) return;
    setSavingId(holiday.id);
    setError('');
    setMessage('');
    try {
      const result = await supabase.rpc('hris_save_org_holiday', {
        p_tenant_id: tenantId,
        p_holiday_id: holiday.id,
        p_name: holiday.name,
        p_start_date: holiday.start_date,
        p_end_date: holiday.end_date,
        p_holiday_type: holiday.holiday_type,
        p_description: holiday.description,
        p_active: !holiday.active,
      });
      if (result.error) throw result.error;
      setMessage(holiday.active ? 'Holiday deactivated.' : 'Holiday activated.');
      setRevision(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update this holiday. Retry or refresh the calendar.');
    } finally {
      setSavingId(null);
    }
  }

  const fieldClass = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
  const labelClass = 'block min-w-0 text-xs font-medium text-slate-600';

  return <section aria-labelledby="organization-holidays-title" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><h2 id="organization-holidays-title" className="text-2xl font-medium text-[#49454F]">Holiday calendar</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">Manage the dates shown across your organization. Deactivated holidays remain in the calendar history.</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" aria-label="Refresh holiday calendar" onClick={() => { setMessage(''); setRevision(value => value + 1); }} disabled={loading || saving || Boolean(savingId)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true"/>Refresh</button>
        <button type="button" onClick={startCreate} disabled={saving || Boolean(savingId)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50"><Plus className="h-4 w-4" aria-hidden="true"/>Add holiday</button>
      </div>
    </div>

    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p role="alert">{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">Retry</button></div>}
    {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}

    {draft && <form onSubmit={saveHoliday} aria-labelledby="holiday-form-heading" className="rounded-xl border border-[#B9DCE2] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3"><div><h3 id="holiday-form-heading" className="font-semibold text-[#1E1B39]">{editingId ? 'Edit holiday' : 'Add an organization holiday'}</h3><p className="mt-1 text-xs text-slate-600">The selected dates are stored as calendar dates for this organization.</p></div><button type="button" onClick={cancelForm} disabled={saving} aria-label="Cancel holiday form" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50"><X className="h-4 w-4" aria-hidden="true"/></button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className={labelClass}>Holiday name *<input id="holiday-name" required maxLength={160} value={draft.name} onChange={event => setDraft(value => value && ({ ...value, name: event.target.value }))} className={fieldClass}/></label>
        <label className={labelClass}>Type<input maxLength={80} value={draft.holiday_type} onChange={event => setDraft(value => value && ({ ...value, holiday_type: event.target.value }))} className={fieldClass}/></label>
        <label className="flex min-h-11 items-center gap-2 self-end pb-2 text-sm text-slate-700"><input type="checkbox" checked={draft.active} onChange={event => setDraft(value => value && ({ ...value, active: event.target.checked }))} className="h-4 w-4 accent-[#08558B]"/>Active and visible to employees</label>
        <label className={labelClass}>Start date *<input type="date" required value={draft.start_date} onChange={event => setDraft(value => value && ({ ...value, start_date: event.target.value }))} className={fieldClass}/></label>
        <label className={labelClass}>End date *<input type="date" required min={draft.start_date || undefined} value={draft.end_date} onChange={event => setDraft(value => value && ({ ...value, end_date: event.target.value }))} className={fieldClass}/></label>
        <label className={`${labelClass} sm:col-span-2 xl:col-span-1`}>Description<textarea rows={2} maxLength={2000} value={draft.description || ''} onChange={event => setDraft(value => value && ({ ...value, description: event.target.value }))} className={`${fieldClass} resize-y`}/></label>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={cancelForm} disabled={saving} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50">Cancel</button><button type="submit" disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50"><Check className="h-4 w-4" aria-hidden="true"/>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add holiday'}</button></div>
    </form>}

    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
      <label className="block w-full min-w-0 sm:max-w-xl"><span className="text-xs font-medium text-slate-600">Search holiday calendar</span><span className="relative mt-1 block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true"/><input value={search} onChange={event => setSearch(event.target.value)} aria-label="Search holiday calendar" placeholder="Name, type, or description" className="min-h-11 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm"/></span></label>
      <label className="block w-full sm:w-52"><span className="text-xs font-medium text-slate-600">Show</span><select aria-label="Filter holiday status" value={filter} onChange={event => setFilter(event.target.value as HolidayFilter)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="active">Active holidays</option><option value="inactive">Inactive holidays</option><option value="all">All holidays</option></select></label>
    </div>

    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading holiday calendar…</p>
      : visibleHolidays.length === 0 ? <div role="status" className="rounded-xl border border-dashed border-[#B9DCE2] bg-white p-6 text-center"><CalendarDays className="mx-auto h-7 w-7 text-[#08558B]" aria-hidden="true"/><h3 className="mt-2 font-semibold text-slate-800">{search ? 'No holidays match this search' : filter === 'active' ? 'No active holidays' : 'No holidays found'}</h3><p className="mt-1 text-sm text-slate-600">{search ? 'Try a different name, type, or description.' : 'Add a holiday to make it available in the organization calendar.'}</p></div>
        : <ul className="grid min-w-0 gap-3 xl:grid-cols-2">{visibleHolidays.map(holiday => <li key={holiday.id} className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wide text-[#615E83]">{holiday.holiday_type || 'general'} · {dates(holiday)}</p><h3 className="mt-1 break-words text-lg font-semibold text-[#1E1B39]">{holiday.name}</h3></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${holiday.active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{holiday.active ? 'Active' : 'Inactive'}</span></div>
          {holiday.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{holiday.description}</p>}
          <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => startEdit(holiday)} disabled={Boolean(savingId) || saving} aria-label={`Edit ${holiday.name}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium disabled:opacity-50"><Pencil className="h-4 w-4" aria-hidden="true"/>Edit</button><button type="button" onClick={() => void toggleActive(holiday)} disabled={Boolean(savingId) || saving} aria-label={`${holiday.active ? 'Deactivate' : 'Activate'} ${holiday.name}`} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium disabled:opacity-50">{savingId === holiday.id ? 'Updating…' : holiday.active ? 'Deactivate' : 'Activate'}</button></div>
        </li>)}</ul>}
    <p className="text-xs text-slate-500">{visibleHolidays.length} {visibleHolidays.length === 1 ? 'holiday' : 'holidays'} shown. Deactivated records remain available in the inactive filter.</p>
  </section>;
}

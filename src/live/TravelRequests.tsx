import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarDays, Check, MapPin, RefreshCw, Send, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { activateModalFocusTrap } from './modal-focus';
import type { Locale } from './project-locale';
import { travelRequestError, travelRequestText } from './travel-request-locale';

type TravelHistory = {
  previous_status: string | null;
  new_status: string;
  note: string | null;
  created_at: string;
};
type PersonalTravelRequest = {
  id: string;
  destination: string | null;
  from_date: string | null;
  to_date: string | null;
  purpose: string | null;
  estimated_cost: number | null;
  estimated_currency: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled';
  submitted_at: string | null;
  review_note: string | null;
  history: TravelHistory[];
};
type Draft = {
  id: string | null;
  destination: string;
  fromDate: string;
  toDate: string;
  purpose: string;
  estimatedCost: string;
  currency: string;
};
type QueueRequest = {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_number: string;
  destination: string;
  from_date: string;
  to_date: string;
  purpose: string;
  estimated_cost: number | null;
  estimated_currency: string | null;
  status: 'submitted';
  submitted_at: string | null;
  review_note: string | null;
};
type Decision = 'approved' | 'rejected';

const emptyDraft = (): Draft => ({
  id: null, destination: '', fromDate: '', toDate: '', purpose: '', estimatedCost: '', currency: 'BDT',
});

function showDate(value: string | null, locale: Locale, tx: (text: string) => string): string {
  if (!value) return tx('Not set');
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function showTimestamp(value: string | null, locale: Locale, tx: (text: string) => string): string {
  if (!value) return tx('Time not recorded');
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function statusLabel(status: string, tx: (text: string) => string): string {
  const labels: Record<string, string> = {
    draft: 'Draft', submitted: 'Submitted', approved: 'Approved', rejected: 'Returned for changes', cancelled: 'Cancelled',
  };
  return tx(labels[status] || status);
}

type TravelLocaleProps = { locale: Locale };

export function MyTravelRequests({ tenantId, locale, focusRequestId, onFocusHandled }: {
  tenantId: string;
  focusRequestId?: string | null;
  onFocusHandled?: (requestId: string) => void;
} & TravelLocaleProps) {
  const tx = (text: string, values?: Record<string, string | number>) => travelRequestText(locale, text, values);
  const currentLocale = useRef(locale);
  currentLocale.current = locale;
  const [requests, setRequests] = useState<PersonalTravelRequest[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [focusMessage, setFocusMessage] = useState('');
  const [expandedHistoryRequestId, setExpandedHistoryRequestId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const requestSequence = useRef(0);
  const requestCards = useRef(new Map<string, HTMLElement>());
  const editorDialogRef = useRef<HTMLDivElement>(null);
  const destinationInputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(saving);
  const focusHandled = useRef(onFocusHandled);
  focusHandled.current = onFocusHandled;
  savingRef.current = saving;
  const activeTenantId = useRef(tenantId);
  const previousTenantId = useRef(tenantId);
  activeTenantId.current = tenantId;
  const closeEditor = () => { if (!saving) { setEditorOpen(false); setDraft(emptyDraft()); setActionError(''); } };
  useEffect(() => {
    if (!editorOpen) return;
    return activateModalFocusTrap(editorDialogRef.current, {
      initialFocus: destinationInputRef.current,
      onEscape: () => { if (!savingRef.current) closeEditor(); },
    });
  }, [editorOpen]);

  useEffect(() => {
    if (previousTenantId.current !== tenantId) setMessage('');
    previousTenantId.current = tenantId;
    const requestId = ++requestSequence.current;
    const requestedTenant = tenantId;
    const current = () => requestId === requestSequence.current && activeTenantId.current === requestedTenant;
    setRequests([]); setLoading(true); setError(''); setActionError('');
    void (async () => {
      try {
        const result = await supabase.rpc('hris_get_my_travel_context', { p_tenant_id: requestedTenant });
        if (!current()) return;
        if (result.error) throw result.error;
        const data = result.data as { employee_id?: string; requests?: PersonalTravelRequest[] } | null;
        if (!data || typeof data.employee_id !== 'string' || !Array.isArray(data.requests)) {
          throw new Error('Your travel requests returned an invalid response.');
        }
        setRequests(data.requests);
      } catch (cause) {
        if (current()) setError(travelRequestError(currentLocale.current, cause instanceof Error ? cause.message : '', 'Unable to load your travel requests.'));
      } finally {
        if (current()) setLoading(false);
      }
    })();
    return () => { requestSequence.current += 1; };
  }, [tenantId, revision]);

  useEffect(() => {
    if (!focusRequestId) return;
    setFocusMessage('');
    setExpandedHistoryRequestId(null);
  }, [focusRequestId]);

  useEffect(() => {
    if (!focusRequestId || loading || error) return;
    const card = requestCards.current.get(focusRequestId);
    if (!card) {
      setFocusMessage(tx('The request linked to this notification is not in your travel history. Refresh your requests and try again.'));
      return;
    }
    setFocusMessage('');
    setExpandedHistoryRequestId(focusRequestId);
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.focus({ preventScroll: true });
    focusHandled.current?.(focusRequestId);
  }, [focusRequestId, loading, error, requests, locale]);

  function startDraft(request?: PersonalTravelRequest) {
    setActionError(''); setMessage('');
    setDraft(request ? {
      id: request.id, destination: request.destination || '', fromDate: request.from_date || '',
      toDate: request.to_date || '', purpose: request.purpose || '',
      estimatedCost: request.estimated_cost === null ? '' : String(request.estimated_cost),
      currency: request.estimated_currency || 'BDT',
    } : emptyDraft());
    setEditorOpen(true);
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (draft.fromDate && draft.toDate && draft.toDate < draft.fromDate) {
      setActionError(tx('The return date must be the same as or after the departure date.')); return;
    }
    const cost = draft.estimatedCost.trim() ? Number(draft.estimatedCost) : null;
    const currency = cost === null ? null : draft.currency.trim().toUpperCase();
    if (cost !== null && (!Number.isFinite(cost) || cost <= 0 || !/^[A-Z]{3}$/.test(currency || ''))) {
      setActionError(tx('Enter a positive estimated cost and a three-letter currency code, or leave both blank.')); return;
    }
    setSaving(true); setActionError(''); setMessage('');
    try {
      const result = await supabase.rpc('hris_save_my_travel_request', {
        p_tenant_id: tenantId, p_id: draft.id,
        p_destination: draft.destination.trim() || null,
        p_from_date: draft.fromDate || null, p_to_date: draft.toDate || null,
        p_purpose: draft.purpose.trim() || null, p_estimated_cost: cost,
        p_estimated_currency: currency,
      });
      if (result.error) throw result.error;
      if (typeof result.data !== 'string' || !result.data) {
        throw new Error('The draft save was not confirmed. Refresh your travel requests and try again.');
      }
      setEditorOpen(false); setDraft(emptyDraft()); setMessage(tx('Travel request draft saved.'));
      setRevision(value => value + 1);
    } catch (cause) {
      setActionError(travelRequestError(locale, cause instanceof Error ? cause.message : '', 'Unable to save this travel draft.'));
    } finally { setSaving(false); }
  }

  async function submitRequest(request: PersonalTravelRequest) {
    if (saving) return;
    setSaving(true); setActionError(''); setMessage('');
    try {
      const result = await supabase.rpc('hris_submit_my_travel_request', { p_tenant_id: tenantId, p_id: request.id });
      if (result.error) throw result.error;
      if (result.data !== request.id) throw new Error('Submission was not confirmed. Refresh and check the request status.');
      setMessage(tx('Travel request submitted for review.')); setRevision(value => value + 1);
    } catch (cause) {
      setActionError(travelRequestError(locale, cause instanceof Error ? cause.message : '', 'Unable to submit this travel request.'));
    } finally { setSaving(false); }
  }

  const submittedCount = requests.filter(request => request.status === 'submitted').length;
  const draftCount = requests.filter(request => request.status === 'draft').length;

  return <section aria-labelledby="my-travel-heading" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="my-travel-heading" className="text-2xl font-medium text-[#49454F]">{tx('My Travel Requests')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{tx('Save a draft, submit it for review, and update a request if it is returned.')}</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" aria-label={tx('Refresh my travel requests')} onClick={() => setRevision(value => value + 1)} disabled={loading || saving} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true"/>{tx('Refresh')}</button>
        <button type="button" onClick={() => startDraft()} disabled={loading || saving} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white shadow-[0_3px_0_#02395c] disabled:opacity-50"><MapPin className="h-4 w-4" aria-hidden="true"/>{tx('New travel request')}</button>
      </div>
    </div>

    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p role="alert">{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">{tx('Retry')}</button></div>}
    {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
    {focusMessage && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{focusMessage}</p>}
    {actionError && !editorOpen && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{actionError}</p>}

    <div className="grid gap-3 sm:grid-cols-3">
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">{tx('Requests')}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{requests.length.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')}</p></article>
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">{tx('Awaiting review')}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{submittedCount.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')}</p></article>
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">{tx('Drafts')}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{draftCount.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')}</p></article>
    </div>

    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{tx('Loading your travel requests…')}</p>
      : requests.length === 0 ? <div role="status" className="rounded-xl border border-dashed border-[#B9DCE2] bg-white p-6 text-center"><MapPin className="mx-auto h-7 w-7 text-[#08558B]" aria-hidden="true"/><h3 className="mt-2 font-semibold text-slate-800">{tx('No travel requests yet')}</h3><p className="mt-1 text-sm text-slate-600">{tx('Start a draft when you need to request business travel.')}</p></div>
      : <div className="grid min-w-0 gap-3 xl:grid-cols-2">{requests.map(request => <article key={request.id} tabIndex={-1} ref={node => {
        if (node) requestCards.current.set(request.id, node);
        else requestCards.current.delete(request.id);
      }} data-travel-request={request.id} className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wide text-[#615E83]">{request.id.slice(0, 8)}</p><h3 className="mt-1 break-words text-lg font-semibold text-[#1E1B39]">{request.destination || tx('Destination not set')}</h3></div><span className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-medium ${request.status === 'submitted' ? 'bg-amber-50 text-amber-800' : request.status === 'approved' ? 'bg-emerald-50 text-emerald-800' : request.status === 'rejected' ? 'bg-rose-50 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>{statusLabel(request.status, tx)}</span></div>
        <p className="mt-3 flex items-start gap-2 text-sm text-slate-600"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true"/>{showDate(request.from_date, locale, tx)} – {showDate(request.to_date, locale, tx)}</p>
        {request.purpose && <p className="mt-2 break-words text-sm text-slate-700">{request.purpose}</p>}
        {request.estimated_cost !== null && <p className="mt-2 text-sm text-slate-600">{tx('Estimated cost:')} {Number(request.estimated_cost).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')} {request.estimated_currency}</p>}
        {request.review_note && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><span className="font-medium">{tx('Reviewer note:')}</span> {request.review_note}</p>}
        {request.history?.length > 0 && <details className="mt-3 text-sm" open={expandedHistoryRequestId === request.id} onToggle={event => {
          setExpandedHistoryRequestId(event.currentTarget.open ? request.id : currentId => currentId === request.id ? null : currentId);
        }}><summary className="min-h-10 cursor-pointer py-2 font-medium text-[#08558B]">{tx('Request history')}</summary><ol className="space-y-2 border-l border-slate-200 pl-3">{request.history.map((item, index) => <li key={`${item.created_at}-${index}`}><p className="font-medium text-slate-700">{item.previous_status ? `${statusLabel(item.previous_status, tx)} → ` : ''}{statusLabel(item.new_status, tx)}</p><p className="text-xs text-slate-500">{showTimestamp(item.created_at, locale, tx)}</p>{item.note && <p className="mt-1 break-words text-xs text-slate-600">{item.note}</p>}</li>)}</ol></details>}
        {(request.status === 'draft' || request.status === 'rejected') && <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" disabled={saving} onClick={() => startDraft(request)} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-medium disabled:opacity-50">{tx(request.status === 'rejected' ? 'Revise request' : 'Edit draft')}</button><button type="button" disabled={saving} onClick={() => void submitRequest(request)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50"><Send className="h-4 w-4" aria-hidden="true"/>{tx(saving ? 'Submitting…' : 'Submit for review')}</button></div>}
      </article>)}</div>}

    {editorOpen && <div ref={editorDialogRef} role="dialog" aria-modal="true" aria-labelledby="travel-editor-heading" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-3 sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) closeEditor(); }}>
      <form onSubmit={saveDraft} className="my-auto w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-5"><div><h3 id="travel-editor-heading" className="text-lg font-semibold text-slate-900">{tx(draft.id ? 'Edit travel request' : 'New travel request')}</h3><p className="mt-1 text-sm text-slate-600">{tx('Save partial details as a draft. A destination, dates, and purpose are required before submission.')}</p></div><button type="button" onClick={closeEditor} disabled={saving} aria-label={tx('Close travel request editor')} className="min-h-11 min-w-11 rounded-lg border border-slate-300 disabled:opacity-50"><X className="mx-auto h-4 w-4" aria-hidden="true"/></button></header>
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <div className="sm:col-span-2"><label htmlFor="travel-destination" className="mb-1 block text-sm font-medium text-slate-700">{tx('Destination')}</label><input ref={destinationInputRef} id="travel-destination" maxLength={300} value={draft.destination} onChange={event => setDraft(value => ({ ...value, destination: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#085587]" /></div>
          <div><label htmlFor="travel-from-date" className="mb-1 block text-sm font-medium text-slate-700">{tx('Departure date')}</label><input id="travel-from-date" type="date" value={draft.fromDate} onChange={event => setDraft(value => ({ ...value, fromDate: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#085587]" /></div>
          <div><label htmlFor="travel-to-date" className="mb-1 block text-sm font-medium text-slate-700">{tx('Return date')}</label><input id="travel-to-date" type="date" min={draft.fromDate || undefined} value={draft.toDate} onChange={event => setDraft(value => ({ ...value, toDate: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#085587]" /></div>
          <div className="sm:col-span-2"><label htmlFor="travel-purpose" className="mb-1 block text-sm font-medium text-slate-700">{tx('Purpose')}</label><textarea id="travel-purpose" maxLength={2000} rows={3} value={draft.purpose} onChange={event => setDraft(value => ({ ...value, purpose: event.target.value }))} className="min-h-24 w-full resize-y rounded-lg border border-slate-300 p-3 text-sm focus-visible:outline-2 focus-visible:outline-[#085587]" /></div>
          <div><label htmlFor="travel-estimated-cost" className="mb-1 block text-sm font-medium text-slate-700">{tx('Estimated cost')} <span className="font-normal text-slate-500">{tx('(optional)')}</span></label><input id="travel-estimated-cost" type="number" min="0.01" step="0.01" value={draft.estimatedCost} onChange={event => setDraft(value => ({ ...value, estimatedCost: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-[#085587]" /></div>
          <div><label htmlFor="travel-currency" className="mb-1 block text-sm font-medium text-slate-700">{tx('Currency')} <span className="font-normal text-slate-500">{tx('(optional with cost)')}</span></label><input id="travel-currency" maxLength={3} autoCapitalize="characters" value={draft.currency} onChange={event => setDraft(value => ({ ...value, currency: event.target.value.toUpperCase() }))} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm uppercase focus-visible:outline-2 focus-visible:outline-[#085587]" /></div>
        </div>
        {actionError && <p role="alert" className="mx-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 sm:mx-5">{actionError}</p>}
        <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 p-4 sm:p-5"><button type="button" disabled={saving} onClick={closeEditor} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium disabled:opacity-50">{tx('Cancel')}</button><button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50">{tx(saving ? 'Saving…' : 'Save draft')}</button></footer>
      </form>
    </div>}
  </section>;
}

export function TravelRequests({ tenantId, canManage, locale }: { tenantId: string; canManage: boolean } & TravelLocaleProps) {
  const tx = (text: string, values?: Record<string, string | number>) => travelRequestText(locale, text, values);
  const currentLocale = useRef(locale);
  currentLocale.current = locale;
  const [requests, setRequests] = useState<QueueRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<{ request: QueueRequest; decision: Decision } | null>(null);
  const [note, setNote] = useState('');
  const [revision, setRevision] = useState(0);
  const requestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  const previousTenantId = useRef(tenantId);
  const decisionDialogRef = useRef<HTMLDivElement>(null);
  const queueHeadingRef = useRef<HTMLHeadingElement>(null);
  const savingRef = useRef(saving);
  const completedDecisionRef = useRef(false);
  activeTenantId.current = tenantId;
  savingRef.current = saving;
  const closeDialog = () => { if (!saving) { setTarget(null); setNote(''); setActionError(''); } };
  useEffect(() => {
    if (!target) return;
    return activateModalFocusTrap(decisionDialogRef.current, {
      returnFocus: () => completedDecisionRef.current ? queueHeadingRef.current : undefined,
      fallbackFocus: queueHeadingRef.current,
      onEscape: () => { if (!savingRef.current) closeDialog(); },
    });
  }, [Boolean(target)]);

  function openDecision(request: QueueRequest, decision: Decision) {
    completedDecisionRef.current = false;
    setTarget({ request, decision });
    setNote(''); setActionError(''); setMessage('');
  }

  useEffect(() => {
    if (previousTenantId.current !== tenantId) setMessage('');
    previousTenantId.current = tenantId;
    const requestId = ++requestSequence.current;
    const requestedTenant = tenantId;
    const current = () => requestId === requestSequence.current && activeTenantId.current === requestedTenant;
    setRequests([]); setLoading(true); setError(''); setActionError(''); setTarget(null); setNote('');
    void (async () => {
      try {
        const result = await supabase.rpc('hris_get_tenant_travel_requests', { p_tenant_id: requestedTenant });
        if (!current()) return;
        if (result.error) throw result.error;
        if (!Array.isArray(result.data)) throw new Error('The travel review queue returned an invalid response.');
        setRequests(result.data as QueueRequest[]);
      } catch (cause) {
        if (current()) setError(travelRequestError(currentLocale.current, cause instanceof Error ? cause.message : '', 'Unable to load the travel review queue.'));
      } finally { if (current()) setLoading(false); }
    })();
    return () => { requestSequence.current += 1; };
  }, [tenantId, revision]);

  async function resolveRequest() {
    if (!target || !canManage || saving) return;
    setSaving(true); setActionError(''); setMessage('');
    try {
      const result = await supabase.rpc('hris_resolve_travel_request', {
        p_tenant_id: tenantId, p_id: target.request.id,
        p_decision: target.decision, p_note: note.trim() || null,
      });
      if (result.error) throw result.error;
      const data = result.data as { id?: string; status?: string } | null;
      if (data?.id !== target.request.id || data.status !== target.decision) {
        throw new Error('The decision could not be verified. Refresh the queue before trying again.');
      }
      setMessage(tx('{employee}’s travel request was {decision}.', {
        employee: target.request.employee_name,
        decision: tx(target.decision === 'approved' ? 'approved' : 'rejected'),
      }));
      completedDecisionRef.current = true;
      setTarget(null); setNote(''); setRevision(value => value + 1);
    } catch (cause) {
      const code = (cause as { code?: string })?.code;
      const detail = travelRequestError(locale, cause instanceof Error ? cause.message : '', 'The travel decision could not be saved.');
      setActionError(code === 'P0002' ? tx('This request was already resolved or is no longer pending. Refresh the queue.') : detail);
    } finally { setSaving(false); }
  }

  return <section aria-labelledby="travel-queue-heading" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 ref={queueHeadingRef} tabIndex={-1} id="travel-queue-heading" className="text-2xl font-medium text-[#49454F]">{tx('Travel requests')}</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">{tx('Review submitted business travel requests for this organization.')}</p></div>
      <button type="button" aria-label={tx('Refresh travel requests')} onClick={() => setRevision(value => value + 1)} disabled={loading || saving} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true"/>{tx('Refresh')}</button></div>
    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p role="alert">{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">{tx('Retry')}</button></div>}
    {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
    {actionError && !target && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{actionError}</p>}
    <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div><p className="text-xs font-medium text-slate-500">{tx('Waiting for review')}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-[#08263D]">{requests.length.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')}</p></div><p className="max-w-lg text-sm text-slate-600">{tx(canManage ? 'Approval or rejection is recorded against the request with an optional note.' : 'You have view access. A travel manager must make decisions.')}</p></article>
    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{tx('Loading travel requests…')}</p>
      : requests.length === 0 ? <div role="status" className="rounded-xl border border-dashed border-[#B9DCE2] bg-white p-6 text-center"><Check className="mx-auto h-7 w-7 text-emerald-700" aria-hidden="true"/><h3 className="mt-2 font-semibold text-slate-800">{tx('No travel requests waiting')}</h3><p className="mt-1 text-sm text-slate-600">{tx('New submissions from employees will appear here.')}</p></div>
      : <div className="grid min-w-0 gap-3 xl:grid-cols-2">{requests.map(request => <article key={request.id} data-travel-queue-request={request.id} className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wide text-[#615E83]">{request.employee_number || tx('Employee')} · {tx('Submitted {date}', { date: showTimestamp(request.submitted_at, locale, tx) })}</p><h3 className="mt-1 break-words text-lg font-semibold text-[#1E1B39]">{request.destination}</h3><p className="mt-1 text-sm font-medium text-slate-700">{request.employee_name}</p></div><span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">{tx('Submitted')}</span></div>
        <p className="mt-3 flex items-start gap-2 text-sm text-slate-600"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true"/>{showDate(request.from_date, locale, tx)} – {showDate(request.to_date, locale, tx)}</p><p className="mt-2 break-words text-sm text-slate-700">{request.purpose}</p>{request.estimated_cost !== null && <p className="mt-2 text-sm text-slate-600">{tx('Estimated cost:')} {Number(request.estimated_cost).toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')} {request.estimated_currency}</p>}
        {canManage && <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" disabled={saving} onClick={() => openDecision(request, 'rejected')} className="min-h-11 rounded-lg border border-rose-300 px-3 text-sm font-medium text-rose-800 disabled:opacity-50">{tx('Return for changes')}</button><button type="button" disabled={saving} onClick={() => openDecision(request, 'approved')} className="min-h-11 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50">{tx('Approve')}</button></div>}
      </article>)}</div>}
    {target && <div ref={decisionDialogRef} role="alertdialog" aria-modal="true" aria-labelledby="travel-decision-heading" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" onMouseDown={event => { if (!saving && event.target === event.currentTarget) closeDialog(); }}><div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"><h3 id="travel-decision-heading" className="text-lg font-semibold text-slate-900">{tx(target.decision === 'approved' ? 'Approve travel request?' : 'Return travel request for changes?')}</h3><p className="mt-2 break-words text-sm text-slate-600">{target.request.employee_name} · {target.request.destination}</p><label htmlFor="travel-review-note" className="mt-4 block text-sm font-medium text-slate-700">{tx('Note')} <span className="font-normal text-slate-500">{tx('(optional)')}</span><textarea id="travel-review-note" rows={3} maxLength={2000} disabled={saving} value={note} onChange={event => setNote(event.target.value)} className="mt-1 min-h-24 w-full resize-y rounded-lg border border-slate-300 p-3 text-sm" placeholder={tx('Add a note for the employee.')}/></label>{actionError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{actionError}</p>}<div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={closeDialog} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium disabled:opacity-50">{tx('Cancel')}</button><button type="button" disabled={saving} onClick={() => void resolveRequest()} className="min-h-11 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50">{tx(saving ? 'Saving…' : target.decision === 'approved' ? 'Confirm approval' : 'Confirm return')}</button></div></div></div>}
  </section>;
}

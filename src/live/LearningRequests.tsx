import { useEffect, useRef, useState } from 'react';
import { BookOpenCheck, Check, Clock3, RefreshCw, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

type LearningRequest = {
  id: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;
  program_id: string;
  program_title: string;
  session_id: string | null;
  session_start_at: string | null;
  session_end_at: string | null;
  session_location: string | null;
  requested_at: string | null;
  request_note: string | null;
};
type Decision = 'enrolled' | 'rejected';

function dateTime(value: string | null): string {
  if (!value) return 'Time to be confirmed';
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? 'Time to be confirmed' : parsed.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function LearningRequests({ tenantId }: { tenantId: string }) {
  const [requests, setRequests] = useState<LearningRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<{ request: LearningRequest; decision: Decision } | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const requestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  const previousTenantId = useRef(tenantId);
  activeTenantId.current = tenantId;

  async function load(isCurrent: () => boolean = () => true) {
    const requestId = ++requestSequence.current;
    const requestedTenant = tenantId;
    const current = () => requestId === requestSequence.current
      && activeTenantId.current === requestedTenant && isCurrent();
    setLoading(true);
    setError('');
    setActionError('');
    try {
      const result = await supabase.rpc('hris_get_learning_requests', { p_tenant_id: requestedTenant });
      if (!current()) return;
      if (result.error) throw result.error;
      if (!Array.isArray(result.data) || result.data.some(row => !row || typeof row.id !== 'string'
          || typeof row.employee_name !== 'string' || typeof row.program_title !== 'string')) {
        throw new Error('Learning requests returned an invalid response.');
      }
      setRequests(result.data as LearningRequest[]);
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : 'Unable to load learning requests.');
    } finally {
      if (current()) setLoading(false);
    }
  }

  useEffect(() => {
    if (previousTenantId.current !== tenantId) setMessage('');
    previousTenantId.current = tenantId;
    setRequests([]);
    setTarget(null);
    setNote('');
    void load();
    return () => { requestSequence.current += 1; };
    // Revision triggers an explicit retry or refresh after a decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, revision]);

  function openDecision(request: LearningRequest, decision: Decision) {
    setActionError('');
    setMessage('');
    setNote('');
    setTarget({ request, decision });
  }

  async function resolveRequest() {
    if (!target || saving) return;
    setSaving(true);
    setActionError('');
    setMessage('');
    try {
      const result = await supabase.rpc('hris_resolve_learning_request', {
        p_tenant_id: tenantId,
        p_id: target.request.id,
        p_decision: target.decision,
        p_resolution_note: note.trim() || null,
      });
      if (result.error) throw result.error;
      const expectedStatus = target.decision;
      if (!result.data || result.data.id !== target.request.id || result.data.status !== expectedStatus) {
        throw new Error('The learning decision could not be verified. Refresh the queue before retrying.');
      }
      setMessage(target.decision === 'enrolled'
        ? `${target.request.employee_name} is enrolled in ${target.request.program_title}.`
        : `The request from ${target.request.employee_name} was declined.`);
      setTarget(null);
      setNote('');
      setRevision(value => value + 1);
    } catch (cause) {
      const errorCode = (cause as { code?: string })?.code;
      const causeMessage = typeof cause === 'object' && cause !== null && 'message' in cause
        && typeof cause.message === 'string' ? cause.message
        : cause instanceof Error ? cause.message : 'The learning decision could not be saved.';
      setActionError(errorCode === 'P0002'
        ? 'This request was already resolved or is no longer available. Refresh the queue.'
        : errorCode === '22023' && /full/i.test(causeMessage)
          ? 'This learning session is full. The request remains pending; refresh the queue and choose another action.'
          : causeMessage);
    } finally {
      setSaving(false);
    }
  }

  return <section aria-labelledby="learning-requests-heading" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><h2 id="learning-requests-heading" className="text-2xl font-medium text-[#49454F]">Learning requests</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">Review employee requests for learning programs in this organization.</p></div>
      <button type="button" aria-label="Refresh learning requests" onClick={() => { setMessage(''); setRevision(value => value + 1); }} disabled={loading}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />Refresh</button>
    </div>

    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p role="alert">{error}</p><button type="button" onClick={() => { setMessage(''); setRevision(value => value + 1); }} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">Retry</button></div>}
    {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
    {actionError && !target && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{actionError}</p>}

    <div className="grid gap-3 sm:grid-cols-2">
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">Feedback pending</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{requests.length}</p></article>
      <article className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><BookOpenCheck className="h-6 w-6 shrink-0 text-[#08558B]" aria-hidden="true" /><p className="text-sm text-slate-600">Employee requests stay pending until you approve or decline them.</p></article>
    </div>

    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading learning requests…</p>
      : requests.length === 0 ? <div role="status" className="rounded-xl border border-dashed border-[#B9DCE2] bg-white p-6 text-center"><Check className="mx-auto h-7 w-7 text-emerald-700" aria-hidden="true" /><h3 className="mt-2 font-semibold text-slate-800">No learning requests waiting</h3><p className="mt-1 text-sm text-slate-600">New approval requests from employees will appear here.</p></div>
        : <div className="grid min-w-0 gap-3 xl:grid-cols-2">{requests.map(request => <article key={request.id} data-learning-request={request.id} className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-[#615E83]">{request.employee_number || 'Employee'}{request.requested_at ? ` · Requested ${dateTime(request.requested_at)}` : ''}</p><h3 className="mt-1 break-words text-lg font-semibold text-[#1E1B39]">{request.program_title}</h3><p className="mt-1 text-sm font-medium text-slate-800">{request.employee_name}</p></div><span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />Feedback pending</span></div>
          {(request.session_start_at || request.session_location) && <p className="mt-3 break-words text-sm text-slate-600">{request.session_start_at ? dateTime(request.session_start_at) : 'Session time to be confirmed'}{request.session_end_at ? ` – ${dateTime(request.session_end_at)}` : ''}{request.session_location ? ` · ${request.session_location}` : ''}</p>}
          {request.request_note && <div className="mt-3 rounded-lg bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">Employee note</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{request.request_note}</p></div>}
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" disabled={saving} onClick={() => openDecision(request, 'rejected')} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 disabled:opacity-50"><X className="h-4 w-4" aria-hidden="true" />Decline</button><button type="button" disabled={saving} onClick={() => openDecision(request, 'enrolled')} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white hover:bg-[#06466F] disabled:opacity-50"><Check className="h-4 w-4" aria-hidden="true" />Approve</button></div>
        </article>)}</div>}

    {target && <div role="alertdialog" aria-modal="true" aria-labelledby="learning-decision-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" onMouseDown={event => { if (!saving && event.target === event.currentTarget) setTarget(null); }}>
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"><h3 id="learning-decision-title" className="text-lg font-semibold text-slate-900">{target.decision === 'enrolled' ? 'Approve learning request?' : 'Decline learning request?'}</h3><p className="mt-2 break-words text-sm text-slate-600">{target.request.employee_name} · {target.request.program_title}{target.decision === 'enrolled' ? ' will be enrolled in this program.' : ' will be notified that this request was declined.'}</p>
        <label htmlFor="learning-resolution-note" className="mt-4 block text-sm font-medium text-slate-700">Update for the employee <span className="font-normal text-slate-500">(optional)</span><textarea id="learning-resolution-note" value={note} onChange={event => setNote(event.target.value)} maxLength={1000} rows={3} disabled={saving} className="mt-1 min-h-24 w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-sm" placeholder="Add a short note about this decision." /></label>
        {actionError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{actionError}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={() => { setTarget(null); setActionError(''); }} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium disabled:opacity-50">Cancel</button><button type="button" disabled={saving} onClick={() => void resolveRequest()} className="min-h-11 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Saving…' : target.decision === 'enrolled' ? 'Confirm approval' : 'Confirm decline'}</button></div>
      </div>
    </div>}
  </section>;
}

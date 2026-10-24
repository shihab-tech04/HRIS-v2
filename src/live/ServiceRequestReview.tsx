import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ClipboardList, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Locale } from './project-locale';
import { serviceRequestText } from './service-request-locale';

type RequestStatus = 'pending' | 'in_progress' | 'completed' | 'rejected' | 'approved' | 'cancelled';
type RequestType = 'employment_certificate' | 'noc_letter' | 'salary_certificate' | 'other'
  | 'work_from_home' | 'movement' | 'shift_change' | 'shift_swap';
type StatusEvent = {
  id: string;
  previous_status: RequestStatus | null;
  new_status: RequestStatus;
  note: string | null;
  created_at: string;
};
type ServiceRequest = {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_number: string;
  request_type: RequestType;
  reason: string;
  status: RequestStatus;
  submitted_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  result_url: string | null;
  history: StatusEvent[];
};
type QueueFilter = 'all' | 'pending' | 'in_progress' | 'completed' | 'rejected';
type DecisionDraft = { requestId: string; nextStatus: 'completed' | 'rejected'; note: string };

const statusLabels: Record<RequestStatus, string> = {
  pending: 'Pending', in_progress: 'In progress', completed: 'Completed',
  rejected: 'Rejected', approved: 'Approved', cancelled: 'Cancelled',
};

function dateLabel(value: string, locale: Locale, tx: (english: string) => string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? tx('Date unavailable') : new Intl.DateTimeFormat(
    locale === 'bn' ? 'bn-BD' : undefined, { dateStyle: 'medium', timeStyle: 'short' },
  ).format(date);
}

function statusClass(status: RequestStatus) {
  if (status === 'completed' || status === 'approved') return 'bg-emerald-50 text-emerald-800';
  if (status === 'rejected' || status === 'cancelled') return 'bg-rose-50 text-rose-800';
  if (status === 'in_progress') return 'bg-blue-50 text-blue-800';
  return 'bg-amber-50 text-amber-800';
}

function safeResultHref(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export function ServiceRequestReview({ tenantId, locale }: { tenantId: string; locale: Locale }) {
  const tx = useCallback((english: string) => serviceRequestText(locale, english), [locale]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [decision, setDecision] = useState<DecisionDraft | null>(null);

  const loadRequests = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError('');
    try {
      const { data, error } = await supabase.rpc('hris_get_tenant_service_requests', { p_tenant_id: tenantId });
      if (error) throw error;
      setRequests(Array.isArray(data) ? data as ServiceRequest[] : []);
    } catch {
      setLoadError(tx('Unable to load service requests. Try refreshing the queue.'));
      if (!isRefresh) setRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, tx]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  const visibleRequests = useMemo(() => filter === 'all'
    ? requests
    : requests.filter(request => request.status === filter), [filter, requests]);

  async function changeStatus(request: ServiceRequest, nextStatus: 'in_progress' | 'completed' | 'rejected', note?: string) {
    setSavingId(request.id);
    setActionError('');
    setSuccessMessage('');
    try {
      const { error } = await supabase.rpc('hris_resolve_tenant_service_request', {
        p_tenant_id: tenantId,
        p_request_id: request.id,
        p_expected_status: request.status,
        p_next_status: nextStatus,
        p_note: note ?? null,
      });
      if (error) throw error;
      setDecision(null);
      setSuccessMessage(nextStatus === 'in_progress'
        ? tx('The request is now in progress.')
        : nextStatus === 'completed' ? tx('The request was completed.') : tx('The request was rejected.'));
      await loadRequests(true);
    } catch {
      setActionError(tx('This action could not be saved. Refresh the queue and try again.'));
    } finally {
      setSavingId(null);
    }
  }

  function submitDecision(event: FormEvent<HTMLFormElement>, request: ServiceRequest) {
    event.preventDefault();
    if (!decision || decision.requestId !== request.id || !decision.note.trim()) return;
    void changeStatus(request, decision.nextStatus, decision.note);
  }

  const requestType = (value: RequestType) => tx(({
    employment_certificate: 'Employment certificate', noc_letter: 'No objection certificate (NOC)',
    salary_certificate: 'Salary certificate', other: 'Other', work_from_home: 'Work from home',
    movement: 'Movement request', shift_change: 'Shift change', shift_swap: 'Shift swap',
  } as const)[value] || value);

  return <section aria-labelledby="service-request-review-heading" className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-[#08558B]">{tx('Employee services')}</p>
        <h2 id="service-request-review-heading" className="mt-1 text-2xl font-semibold text-[#1E1B39]">{tx('Service Requests')}</h2>
        <p className="mt-1 text-sm text-slate-600">{tx('Review employee requests and record the decision outcome.')}</p>
      </div>
      <button type="button" onClick={() => void loadRequests(true)} disabled={refreshing || loading}
        aria-label={tx('Refresh service request queue')}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-60">
        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" /> {tx('Refresh')}
      </button>
    </header>

    {loadError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <p>{loadError}</p><button type="button" onClick={() => void loadRequests()} className="mt-2 min-h-10 rounded-md border border-rose-300 px-3 font-medium">{tx('Try again')}</button>
    </div>}
    {actionError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <p>{actionError}</p><button type="button" onClick={() => void loadRequests(true)} className="mt-2 min-h-10 rounded-md border border-rose-300 px-3 font-medium">{tx('Refresh before retrying')}</button>
    </div>}
    {successMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{successMessage}</p>}

    <section aria-label={tx('Service request queue')} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-900">{tx('Employee requests')} <span className="text-sm font-normal text-slate-500">({requests.length})</span></h3>
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-slate-700">
          {tx('Filter by status')}
          <select aria-label={tx('Filter by status')} value={filter} onChange={event => setFilter(event.target.value as QueueFilter)}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 focus:outline-2 focus:outline-[#08558B]">
            {(['all', 'pending', 'in_progress', 'completed', 'rejected'] as const).map(value => <option key={value} value={value}>
              {tx(value === 'all' ? 'All requests' : statusLabels[value])}
            </option>)}
          </select>
        </label>
      </div>

      {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{tx('Loading service requests…')}</p>
        : !requests.length && !loadError ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <ClipboardList className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" />
          <p className="mt-2 font-medium text-slate-800">{tx('No service requests yet')}</p>
          <p className="mt-1 text-sm text-slate-600">{tx('Employee requests will appear here.')}</p>
        </div>
        : requests.length > 0 && !visibleRequests.length ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{tx('No requests match this status.')}</p>
        : <ul className="grid gap-3 lg:grid-cols-2">
          {visibleRequests.map(request => <li key={request.id} data-service-request={request.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="break-words font-semibold text-slate-900">{requestType(request.request_type)}</h4>
                <p className="mt-1 break-words text-sm text-slate-600">{request.employee_name} · {tx('Employee ID')} {request.employee_number}</p>
                <p className="mt-1 text-xs text-slate-500">{tx('Submitted')} {dateLabel(request.submitted_at, locale, tx)}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(request.status)}`}>{tx(statusLabels[request.status])}</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700">{request.reason}</p>
            {request.resolution_note && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-800">{tx(request.status === 'rejected' ? 'Rejection reason' : 'Resolution outcome')}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{request.resolution_note}</p>
            </div>}

            {request.history?.length > 0 && <details className="mt-3 rounded-lg border border-slate-200 px-3 py-2">
              <summary className="cursor-pointer py-1 text-sm font-medium text-slate-700">{tx('Status history')} ({request.history.length})</summary>
              <ol className="mt-2 space-y-2 border-l border-slate-200 pl-3">
                {request.history.map(event => <li key={event.id} className="text-xs text-slate-600">
                  <p className="font-medium text-slate-800">{event.previous_status ? `${tx(statusLabels[event.previous_status])} → ` : ''}{tx(statusLabels[event.new_status])}</p>
                  <p>{dateLabel(event.created_at, locale, tx)}</p>
                  {event.note && <p className="mt-1 whitespace-pre-wrap break-words">{event.note}</p>}
                </li>)}
              </ol>
            </details>}

            {safeResultHref(request.result_url) && <a className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-[#08558B] underline" href={safeResultHref(request.result_url) || undefined} target="_blank" rel="noreferrer">{tx('Open attached result')}</a>}

            {request.status === 'pending' && <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <button type="button" disabled={savingId === request.id} onClick={() => void changeStatus(request, 'in_progress')}
                className="min-h-11 rounded-lg bg-[#08558B] px-4 text-sm font-semibold text-white disabled:opacity-60">{savingId === request.id ? tx('Saving…') : tx('Start review')}</button>
              <button type="button" disabled={savingId === request.id} onClick={() => { setDecision({ requestId: request.id, nextStatus: 'rejected', note: '' }); setActionError(''); }}
                className="min-h-11 rounded-lg border border-rose-300 px-4 text-sm font-semibold text-rose-800 disabled:opacity-60">{tx('Reject')}</button>
            </div>}
            {request.status === 'in_progress' && <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <button type="button" disabled={savingId === request.id} onClick={() => { setDecision({ requestId: request.id, nextStatus: 'completed', note: '' }); setActionError(''); }}
                className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-60">{tx('Complete request')}</button>
              <button type="button" disabled={savingId === request.id} onClick={() => { setDecision({ requestId: request.id, nextStatus: 'rejected', note: '' }); setActionError(''); }}
                className="min-h-11 rounded-lg border border-rose-300 px-4 text-sm font-semibold text-rose-800 disabled:opacity-60">{tx('Reject')}</button>
            </div>}

            {decision?.requestId === request.id && <form onSubmit={event => submitDecision(event, request)} className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h5 className="font-semibold text-slate-900">{tx(decision.nextStatus === 'rejected' ? 'Rejection reason' : 'Resolution outcome')}</h5>
              <label className="block space-y-1.5 text-sm font-medium text-slate-800">
                {tx(decision.nextStatus === 'rejected' ? 'Reason for rejection' : 'Record the resolution outcome')}
                <textarea required value={decision.note} onChange={event => setDecision(current => current?.requestId === request.id ? { ...current, note: event.target.value } : current)}
                  rows={3} aria-label={tx(decision.nextStatus === 'rejected' ? 'Reason for rejection' : 'Record the resolution outcome')}
                  className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal focus:outline-2 focus:outline-[#08558B]" />
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setDecision(null)} disabled={savingId === request.id}
                  className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700">{tx('Cancel')}</button>
                <button type="submit" disabled={savingId === request.id || !decision.note.trim()}
                  className="min-h-11 rounded-lg bg-[#08558B] px-4 text-sm font-semibold text-white disabled:opacity-60">{savingId === request.id ? tx('Saving…') : tx('Save decision')}</button>
              </div>
            </form>}
          </li>)}
        </ul>}
    </section>
  </section>;
}

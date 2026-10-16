import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ClipboardList, RefreshCw, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Locale } from './project-locale';
import { serviceRequestText } from './service-request-locale';

type RequestType = 'employment_certificate' | 'noc_letter' | 'salary_certificate' | 'other'
  | 'work_from_home' | 'movement' | 'shift_change' | 'shift_swap';
type ServiceRequestEvent = {
  id: string;
  previous_status: string | null;
  new_status: string;
  note: string | null;
  created_at: string;
};
type ServiceRequest = {
  id: string;
  request_type: RequestType;
  reason: string;
  status: string;
  submitted_at: string;
  resolved_at?: string | null;
  resolution_note?: string | null;
  history?: ServiceRequestEvent[];
};

const requestTypes: { value: RequestType; label: string }[] = [
  { value: 'employment_certificate', label: 'Employment certificate' },
  { value: 'noc_letter', label: 'No objection certificate (NOC)' },
  { value: 'salary_certificate', label: 'Salary certificate' },
  { value: 'work_from_home', label: 'Work from home' },
  { value: 'movement', label: 'Movement request' },
  { value: 'shift_change', label: 'Shift change' },
  { value: 'shift_swap', label: 'Shift swap' },
  { value: 'other', label: 'Other' },
];

const statusLabels: Record<string, string> = {
  draft: 'Draft', submitted: 'Submitted', pending: 'Pending', in_progress: 'In progress', completed: 'Completed',
  approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled',
};

function requestLabel(type: string, tx: (english: string) => string) {
  return tx(requestTypes.find(item => item.value === type)?.label || type.replaceAll('_', ' '));
}

function errorMessage(error: unknown, tx: (english: string) => string, locale: Locale) {
  const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message : '';
  if (locale === 'en' && message) return message;
  if (message && tx(message) !== message) return tx(message);
  return tx('Unable to complete this service request. Try again.');
}

function submittedLabel(value: string, locale: Locale, tx: (english: string) => string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? tx('Date unavailable') : new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(date);
}

function statusClass(status: string) {
  if (status === 'approved' || status === 'completed') return 'bg-emerald-50 text-emerald-800';
  if (status === 'rejected' || status === 'cancelled') return 'bg-rose-50 text-rose-800';
  if (status === 'in_progress') return 'bg-blue-50 text-blue-800';
  return 'bg-amber-50 text-amber-800';
}

export function MyServiceRequests({ tenantId, locale, focusRequestId, onFocusHandled }: {
  tenantId: string;
  locale: Locale;
  focusRequestId?: string | null;
  onFocusHandled?: (requestId: string) => void;
}) {
  const tx = useCallback((english: string) => serviceRequestText(locale, english), [locale]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [requestType, setRequestType] = useState<RequestType>('employment_certificate');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadRequests = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError('');
    try {
      const { data, error } = await supabase.rpc('hris_get_my_service_requests', { p_tenant_id: tenantId });
      if (error) throw error;
      const rows = Array.isArray(data?.requests) ? data.requests as ServiceRequest[] : [];
      setRequests(rows);
    } catch (error) {
      setLoadError(errorMessage(error, tx, locale));
      setRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, locale, tx]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  useEffect(() => {
    if (!focusRequestId || loading || loadError) return;
    if (!requests.some(request => request.id === focusRequestId)) {
      onFocusHandled?.(focusRequestId);
      return;
    }
    const target = document.querySelector<HTMLElement>(`[data-service-request="${focusRequestId}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.focus({ preventScroll: true });
      onFocusHandled?.(focusRequestId);
    }
  }, [focusRequestId, requests, loading, loadError, onFocusHandled]);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    setSuccessMessage('');
    try {
      const { error } = await supabase.rpc('hris_submit_my_service_request', {
        p_tenant_id: tenantId,
        p_request_type: requestType,
        p_reason: reason,
      });
      if (error) throw error;
      setReason('');
      setSuccessMessage('Your request was submitted and is now pending.');
      await loadRequests(true);
    } catch (error) {
      setSubmitError(errorMessage(error, tx, locale));
    } finally {
      setSubmitting(false);
    }
  }

  return <section aria-labelledby="my-service-requests-heading" className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-[#08558B]">{tx('Self service')}</p>
        <h2 id="my-service-requests-heading" className="mt-1 text-2xl font-semibold text-[#1E1B39]">{tx('My Service Requests')}</h2>
        <p className="mt-1 text-sm text-slate-600">{tx('Submit a request to HR and check its current status here.')}</p>
      </div>
      <button type="button" onClick={() => void loadRequests(true)} disabled={refreshing || loading}
        aria-label={tx('Refresh my service requests')}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-60">
        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" /> {tx('Refresh')}
      </button>
    </header>

    <form onSubmit={event => void submitRequest(event)} className="space-y-4 rounded-xl border border-[#DEE0E3] bg-white p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-[#08558B]" aria-hidden="true" />
        <h3 className="font-semibold text-slate-900">{tx('Create a service request')}</h3>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium text-slate-800">
          {tx('Request type')}
          <select aria-label={tx('Request type')} required value={requestType} onChange={event => setRequestType(event.target.value as RequestType)}
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal focus:outline-2 focus:outline-[#08558B]">
            {requestTypes.map(item => <option key={item.value} value={item.value}>{tx(item.label)}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-medium text-slate-800 md:col-span-2">
          {tx('Reason or details')}
          <textarea aria-label={tx('Reason or details')} required value={reason} onChange={event => setReason(event.target.value)}
            rows={4} className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal focus:outline-2 focus:outline-[#08558B]" />
        </label>
      </div>
      {submitError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{submitError}</p>}
      {successMessage && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{tx(successMessage)}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" onClick={() => { setReason(''); setSubmitError(''); setSuccessMessage(''); }} disabled={submitting || !reason}
          className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 disabled:opacity-50">{tx('Clear')}</button>
        <button type="submit" disabled={submitting || !reason.trim()}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#08558B] px-4 text-sm font-semibold text-white disabled:opacity-60">
          <Send className="h-4 w-4" aria-hidden="true" />{submitting ? tx('Submitting…') : tx('Submit request')}
        </button>
      </div>
    </form>

    <section aria-label={tx('My submitted service requests')} className="space-y-3">
      <h3 className="text-lg font-semibold text-slate-900">{tx('Request history')}</h3>
      {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{tx('Loading your requests…')}</p>
        : loadError ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p>{loadError}</p><button type="button" onClick={() => void loadRequests()} className="mt-3 min-h-10 rounded-md border border-rose-300 px-3 font-medium">{tx('Try again')}</button>
        </div>
        : requests.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <ClipboardList className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" />
          <p className="mt-2 font-medium text-slate-800">{tx('No service requests yet')}</p>
          <p className="mt-1 text-sm text-slate-600">{tx('Your submitted requests will appear here.')}</p>
        </div>
        : <ul className="grid gap-3 lg:grid-cols-2">
          {requests.map(request => <li key={request.id} data-service-request={request.id} tabIndex={-1} className="rounded-xl border border-slate-200 bg-white p-4 focus:outline-2 focus:outline-[#08558B]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h4 className="font-semibold text-slate-900">{requestLabel(request.request_type, tx)}</h4>
                <p className="mt-1 text-xs text-slate-500">{tx('Submitted')} {submittedLabel(request.submitted_at, locale, tx)}</p></div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(request.status)}`}>{tx(statusLabels[request.status] || request.status)}</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700">{request.reason}</p>
            {request.resolution_note && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-800">{tx('HR response')}</p><p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{request.resolution_note}</p>
            </div>}
            {!!request.history?.length && <details className="mt-3 rounded-lg border border-slate-200 px-3 py-2">
              <summary className="cursor-pointer py-1 text-sm font-medium text-slate-700">{tx('Status history')} ({request.history.length})</summary>
              <ol className="mt-2 space-y-2 border-l border-slate-200 pl-3">
                {request.history.map(event => <li key={event.id} className="text-xs text-slate-600">
                  <p className="font-medium text-slate-800">{event.previous_status ? `${tx(statusLabels[event.previous_status] || event.previous_status)} → ` : ''}{tx(statusLabels[event.new_status] || event.new_status)}</p>
                  <p>{submittedLabel(event.created_at, locale, tx)}</p>
                  {event.note && <p className="mt-1 whitespace-pre-wrap break-words">{event.note}</p>}
                </li>)}
              </ol>
            </details>}
          </li>)}
        </ul>}
    </section>
  </section>;
}

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
type WorkFromHomeDraft = {
  fromDate: string;
  toDate: string;
  startTime: string;
  endTime: string;
  tasksText: string;
  location: string;
};
type ServiceRequest = {
  id: string;
  request_type: RequestType;
  reason: string;
  status: string;
  submitted_at: string;
  resolved_at?: string | null;
  resolution_note?: string | null;
  request_data?: Record<string, unknown> | null;
  history?: ServiceRequestEvent[];
};

const emptyWorkFromHomeDraft: WorkFromHomeDraft = {
  fromDate: '', toDate: '', startTime: '', endTime: '', tasksText: '', location: '',
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

function readWorkFromHomeDraft(request?: ServiceRequest | null): WorkFromHomeDraft {
  const data = request?.request_data || {};
  const tasks = Array.isArray(data.tasks) ? data.tasks.filter((task): task is string => typeof task === 'string') : [];
  return {
    fromDate: typeof data.from_date === 'string' ? data.from_date : '',
    toDate: typeof data.to_date === 'string' ? data.to_date : '',
    startTime: typeof data.start_time === 'string' ? data.start_time.slice(0, 5) : '',
    endTime: typeof data.end_time === 'string' ? data.end_time.slice(0, 5) : '',
    tasksText: tasks.join('\n'),
    location: typeof data.location === 'string' ? data.location : '',
  };
}

function workFromHomePayload(value: WorkFromHomeDraft) {
  return {
    p_from_date: value.fromDate,
    p_to_date: value.toDate,
    p_start_time: value.startTime,
    p_end_time: value.endTime,
    p_tasks: value.tasksText.split(/\r?\n/).map(task => task.trim()).filter(Boolean),
    p_location: value.location.trim() || null,
  };
}

function validWorkFromHomeDraft(value: WorkFromHomeDraft) {
  const tasks = value.tasksText.split(/\r?\n/).map(task => task.trim()).filter(Boolean);
  return Boolean(value.fromDate && value.toDate && value.toDate >= value.fromDate
    && value.startTime && value.endTime && value.endTime > value.startTime && tasks.length);
}

function WorkFromHomeFields({ idPrefix, value, onChange, disabled, tx }: {
  idPrefix: string;
  value: WorkFromHomeDraft;
  onChange: (next: WorkFromHomeDraft) => void;
  disabled: boolean;
  tx: (english: string) => string;
}) {
  const minutes = value.startTime && value.endTime
    ? (Number(value.endTime.slice(0, 2)) * 60 + Number(value.endTime.slice(3, 5)))
      - (Number(value.startTime.slice(0, 2)) * 60 + Number(value.startTime.slice(3, 5)))
    : 0;
  const invalidDates = Boolean(value.fromDate && value.toDate && value.toDate < value.fromDate);
  const invalidTimes = Boolean(value.startTime && value.endTime && value.endTime <= value.startTime);
  const noTasks = !value.tasksText.split(/\r?\n/).some(task => task.trim());
  const duration = minutes > 0
    ? `${Math.floor(minutes / 60)} ${tx('hours')}${minutes % 60 ? ` ${minutes % 60} ${tx('minutes')}` : ''}`
    : tx('Enter a valid time range to see duration.');

  return <div className="grid gap-4 md:grid-cols-2">
    <label htmlFor={`${idPrefix}-from-date`} className="space-y-1.5 text-sm font-medium text-slate-800">
      {tx('From date')}
      <input id={`${idPrefix}-from-date`} type="date" required disabled={disabled} value={value.fromDate}
        onChange={event => onChange({ ...value, fromDate: event.target.value })}
        className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal focus:outline-2 focus:outline-[#08558B] disabled:opacity-60" />
    </label>
    <label htmlFor={`${idPrefix}-to-date`} className="space-y-1.5 text-sm font-medium text-slate-800">
      {tx('To date')}
      <input id={`${idPrefix}-to-date`} type="date" required min={value.fromDate || undefined} disabled={disabled} value={value.toDate}
        onChange={event => onChange({ ...value, toDate: event.target.value })}
        className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal focus:outline-2 focus:outline-[#08558B] disabled:opacity-60" />
    </label>
    <label htmlFor={`${idPrefix}-start-time`} className="space-y-1.5 text-sm font-medium text-slate-800">
      {tx('Start time')}
      <input id={`${idPrefix}-start-time`} type="time" required disabled={disabled} value={value.startTime}
        onChange={event => onChange({ ...value, startTime: event.target.value })}
        className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal focus:outline-2 focus:outline-[#08558B] disabled:opacity-60" />
    </label>
    <label htmlFor={`${idPrefix}-end-time`} className="space-y-1.5 text-sm font-medium text-slate-800">
      {tx('End time')}
      <input id={`${idPrefix}-end-time`} type="time" required disabled={disabled} value={value.endTime}
        onChange={event => onChange({ ...value, endTime: event.target.value })}
        className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal focus:outline-2 focus:outline-[#08558B] disabled:opacity-60" />
    </label>
    <p className="text-sm text-slate-600 md:col-span-2"><span className="font-medium text-slate-800">{tx('Estimated duration')}:</span> {duration}</p>
    {invalidDates && <p role="alert" className="text-sm text-rose-700 md:col-span-2">{tx('Choose a valid date range.')}</p>}
    {invalidTimes && <p role="alert" className="text-sm text-rose-700 md:col-span-2">{tx('End time must be later than start time.')}</p>}
    <label htmlFor={`${idPrefix}-tasks`} className="space-y-1.5 text-sm font-medium text-slate-800 md:col-span-2">
      {tx('Task list')}
      <textarea id={`${idPrefix}-tasks`} required disabled={disabled} value={value.tasksText} rows={3}
        onChange={event => onChange({ ...value, tasksText: event.target.value })}
        aria-describedby={`${idPrefix}-tasks-hint`}
        className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal focus:outline-2 focus:outline-[#08558B] disabled:opacity-60" />
      <span id={`${idPrefix}-tasks-hint`} className="block text-xs font-normal text-slate-500">{tx('List each task or work item on a separate line. At least one task is required.')}</span>
    </label>
    {noTasks && value.tasksText.trim() && <p role="alert" className="text-sm text-rose-700 md:col-span-2">{tx('Add at least one task or work item.')}</p>}
    <label htmlFor={`${idPrefix}-location`} className="space-y-1.5 text-sm font-medium text-slate-800 md:col-span-2">
      {tx('Work location (optional)')}
      <input id={`${idPrefix}-location`} type="text" maxLength={200} disabled={disabled} value={value.location}
        onChange={event => onChange({ ...value, location: event.target.value })}
        className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal focus:outline-2 focus:outline-[#08558B] disabled:opacity-60" />
    </label>
  </div>;
}

export function WorkFromHomeSummary({ request, locale, tx }: {
  request: ServiceRequest;
  locale: Locale;
  tx: (english: string) => string;
}) {
  const details = readWorkFromHomeDraft(request);
  const tasks = details.tasksText.split(/\r?\n/).map(task => task.trim()).filter(Boolean);
  const start = details.startTime ? Number(details.startTime.slice(0, 2)) * 60 + Number(details.startTime.slice(3, 5)) : 0;
  const end = details.endTime ? Number(details.endTime.slice(0, 2)) * 60 + Number(details.endTime.slice(3, 5)) : 0;
  const duration = end > start
    ? `${Math.floor((end - start) / 60)} ${tx('hours')}${(end - start) % 60 ? ` ${(end - start) % 60} ${tx('minutes')}` : ''}`
    : '';
  const formatDate = (value: string) => {
    if (!value) return tx('Not provided');
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    }).format(date);
  };

  return <div className="mt-3 space-y-2 rounded-lg bg-[#EFF7F8] p-3 text-sm text-slate-700">
    <p><span className="font-medium text-slate-900">{tx('Requested dates')}:</span> {formatDate(details.fromDate)} – {formatDate(details.toDate)}</p>
    {(details.startTime || details.endTime) && <p><span className="font-medium text-slate-900">{tx('Requested time')}:</span> {details.startTime || '—'} – {details.endTime || '—'}{duration ? ` · ${duration}` : ''}</p>}
    {details.location && <p><span className="font-medium text-slate-900">{tx('Work location')}:</span> {details.location}</p>}
    {tasks.length > 0 && <div><p className="font-medium text-slate-900">{tx('Task list')}</p><ul className="mt-1 list-disc space-y-1 pl-5">{tasks.map((task, index) => <li key={`${index}-${task}`} className="whitespace-pre-wrap break-words">{task}</li>)}</ul></div>}
  </div>;
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
  const [workFromHomeDraft, setWorkFromHomeDraft] = useState<WorkFromHomeDraft>(emptyWorkFromHomeDraft);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<WorkFromHomeDraft>(emptyWorkFromHomeDraft);
  const [editReason, setEditReason] = useState('');
  const [cancelRequestId, setCancelRequestId] = useState<string | null>(null);
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
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
    if (requestType === 'work_from_home' && !validWorkFromHomeDraft(workFromHomeDraft)) {
      setSubmitError(workFromHomeDraft.endTime && workFromHomeDraft.endTime <= workFromHomeDraft.startTime
        ? tx('End time must be later than start time.')
        : !workFromHomeDraft.fromDate || !workFromHomeDraft.toDate || workFromHomeDraft.toDate < workFromHomeDraft.fromDate
          ? tx('Choose a valid date range.') : tx('Add at least one task or work item.'));
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    setSuccessMessage('');
    try {
      const result = requestType === 'work_from_home'
        ? await supabase.rpc('hris_submit_my_work_from_home_request', {
          p_tenant_id: tenantId, ...workFromHomePayload(workFromHomeDraft), p_reason: reason.trim(),
        })
        : await supabase.rpc('hris_submit_my_service_request', {
          p_tenant_id: tenantId, p_request_type: requestType, p_reason: reason,
        });
      const { error } = result;
      if (error) throw error;
      setReason('');
      setWorkFromHomeDraft(emptyWorkFromHomeDraft);
      setSuccessMessage('Your request was submitted and is now pending.');
      await loadRequests(true);
    } catch (error) {
      setSubmitError(errorMessage(error, tx, locale));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveWorkFromHomeEdit(event: FormEvent<HTMLFormElement>, request: ServiceRequest) {
    event.preventDefault();
    if (!validWorkFromHomeDraft(editDraft) || !editReason.trim()) {
      setSubmitError(tx('Complete all required Work From Home details before saving.'));
      return;
    }
    setRequestActionId(request.id);
    setSubmitError('');
    setSuccessMessage('');
    try {
      const { error } = await supabase.rpc('hris_update_my_work_from_home_request', {
        p_tenant_id: tenantId, p_request_id: request.id,
        ...workFromHomePayload(editDraft), p_reason: editReason.trim(),
      });
      if (error) throw error;
      setEditingRequestId(null);
      setSuccessMessage('Work From Home request updated.');
      await loadRequests(true);
    } catch (error) {
      setSubmitError(errorMessage(error, tx, locale));
    } finally {
      setRequestActionId(null);
    }
  }

  async function cancelWorkFromHomeRequest(request: ServiceRequest) {
    setRequestActionId(request.id);
    setSubmitError('');
    setSuccessMessage('');
    try {
      const { error } = await supabase.rpc('hris_cancel_my_work_from_home_request', {
        p_tenant_id: tenantId, p_request_id: request.id,
      });
      if (error) throw error;
      setCancelRequestId(null);
      setSuccessMessage('Work From Home request cancelled.');
      await loadRequests(true);
    } catch (error) {
      setSubmitError(errorMessage(error, tx, locale));
    } finally {
      setRequestActionId(null);
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
          <select aria-label={tx('Request type')} required value={requestType} onChange={event => { setRequestType(event.target.value as RequestType); setSubmitError(''); }}
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal focus:outline-2 focus:outline-[#08558B]">
            {requestTypes.map(item => <option key={item.value} value={item.value}>{tx(item.label)}</option>)}
          </select>
        </label>
        {requestType === 'work_from_home' ? <>
          <div className="md:col-span-2">
            <WorkFromHomeFields idPrefix="new-wfh" value={workFromHomeDraft} onChange={setWorkFromHomeDraft} disabled={submitting} tx={tx} />
          </div>
          <label className="space-y-1.5 text-sm font-medium text-slate-800 md:col-span-2">
            {tx('Reason')}
            <textarea aria-label={tx('Reason')} required value={reason} onChange={event => setReason(event.target.value)}
              rows={3} className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal focus:outline-2 focus:outline-[#08558B]" />
          </label>
        </> : <label className="space-y-1.5 text-sm font-medium text-slate-800 md:col-span-2">
          {tx('Reason or details')}
          <textarea aria-label={tx('Reason or details')} required value={reason} onChange={event => setReason(event.target.value)}
            rows={4} className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal focus:outline-2 focus:outline-[#08558B]" />
        </label>}
      </div>
      {submitError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{submitError}</p>}
      {successMessage && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{tx(successMessage)}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" onClick={() => { setReason(''); setWorkFromHomeDraft(emptyWorkFromHomeDraft); setSubmitError(''); setSuccessMessage(''); }} disabled={submitting || (!reason && !workFromHomeDraft.tasksText && !workFromHomeDraft.fromDate)}
          className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 disabled:opacity-50">{tx('Clear')}</button>
        <button type="submit" disabled={submitting || !reason.trim() || (requestType === 'work_from_home' && !validWorkFromHomeDraft(workFromHomeDraft))}
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
            {request.request_type === 'work_from_home' && <WorkFromHomeSummary request={request} locale={locale} tx={tx} />}
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
            {request.request_type === 'work_from_home' && request.status === 'pending' && <div className="mt-4 border-t border-slate-100 pt-4">
              {editingRequestId === request.id ? <form onSubmit={event => void saveWorkFromHomeEdit(event, request)} className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <h5 className="font-semibold text-slate-900">{tx('Edit Work From Home request')}</h5>
                <WorkFromHomeFields idPrefix={`edit-wfh-${request.id}`} value={editDraft} onChange={setEditDraft} disabled={requestActionId === request.id} tx={tx} />
                <label className="block space-y-1.5 text-sm font-medium text-slate-800">
                  {tx('Reason')}
                  <textarea required rows={3} value={editReason} disabled={requestActionId === request.id}
                    onChange={event => setEditReason(event.target.value)}
                    className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal focus:outline-2 focus:outline-[#08558B] disabled:opacity-60" />
                </label>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" disabled={requestActionId === request.id} onClick={() => setEditingRequestId(null)}
                    className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700">{tx('Keep request')}</button>
                  <button type="submit" disabled={requestActionId === request.id || !editReason.trim() || !validWorkFromHomeDraft(editDraft)}
                    className="min-h-11 rounded-lg bg-[#08558B] px-4 text-sm font-semibold text-white disabled:opacity-60">{requestActionId === request.id ? tx('Saving…') : tx('Save changes')}</button>
                </div>
              </form> : <div className="flex flex-wrap gap-2">
                <button type="button" disabled={requestActionId === request.id} onClick={() => {
                  setEditDraft(readWorkFromHomeDraft(request)); setEditReason(request.reason); setEditingRequestId(request.id);
                  setCancelRequestId(null); setSubmitError('');
                }} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 disabled:opacity-50">{tx('Edit request')}</button>
                <button type="button" disabled={requestActionId === request.id} onClick={() => {
                  setCancelRequestId(request.id); setEditingRequestId(null); setSubmitError('');
                }} className="min-h-11 rounded-lg border border-rose-300 px-4 text-sm font-medium text-rose-800 disabled:opacity-50">{tx('Cancel request')}</button>
              </div>}
              {cancelRequestId === request.id && <div role="group" aria-label={tx('Confirm cancellation')} className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm text-amber-900">{tx('Cancel this pending Work From Home request?')}</p>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button type="button" disabled={requestActionId === request.id} onClick={() => setCancelRequestId(null)}
                    className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700">{tx('Keep request')}</button>
                  <button type="button" disabled={requestActionId === request.id} onClick={() => void cancelWorkFromHomeRequest(request)}
                    className="min-h-10 rounded-lg bg-rose-700 px-3 text-sm font-semibold text-white disabled:opacity-60">{requestActionId === request.id ? tx('Saving…') : tx('Confirm cancellation')}</button>
                </div>
              </div>}
            </div>}
          </li>)}
        </ul>}
    </section>
  </section>;
}

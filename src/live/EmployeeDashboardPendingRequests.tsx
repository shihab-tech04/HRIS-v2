import { useEffect, useRef, useState } from 'react';
import { ClipboardList, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { projectText, type Locale } from './project-locale';

export type PendingRequestKind = 'leave' | 'attendance' | 'expense' | 'travel' | 'service' | 'learning';
type PendingRequest = { id: string; kind: PendingRequestKind; status: string; requested_at: string | null };

const kindLabels: Record<PendingRequestKind, string> = {
  leave: 'Leave', attendance: 'Attendance', expense: 'Expense',
  travel: 'Travel', service: 'Service', learning: 'Learning',
};
const statusLabels: Record<string, string> = {
  pending: 'Pending', submitted: 'Submitted', in_progress: 'In progress', requested: 'Requested',
};

function tx(locale: Locale, text: string) {
  return projectText(locale, text);
}

function formatDate(value: string | null, locale: Locale) {
  if (!value || !Number.isFinite(Date.parse(value))) return tx(locale, 'Date unavailable');
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    dateStyle: 'medium', timeZone: 'UTC',
  }).format(new Date(value));
}

export function EmployeeDashboardPendingRequests({ tenantId, employeeId, locale, onOpen }: {
  tenantId: string;
  employeeId: string;
  locale: Locale;
  onOpen: (kind: PendingRequestKind) => void;
}) {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);
  const activeTenant = useRef(tenantId);
  activeTenant.current = tenantId;

  useEffect(() => {
    const requestId = ++sequence.current;
    const requestedTenant = tenantId;
    const current = () => requestId === sequence.current && activeTenant.current === requestedTenant;
    setRequests([]);
    setError('');
    setLoading(true);
    if (!employeeId) {
      setLoading(false);
      return () => { sequence.current += 1; };
    }
    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('hris_get_my_pending_requests', {
          p_tenant_id: requestedTenant,
        });
        if (rpcError) throw rpcError;
        const response = data as { tenant_id?: string; employee_id?: string; requests?: unknown } | null;
        if (!response || response.tenant_id !== requestedTenant || response.employee_id !== employeeId
            || !Array.isArray(response.requests)) throw new Error('Pending requests returned an invalid response.');
        const rows = response.requests.filter((value): value is PendingRequest => {
          if (!value || typeof value !== 'object') return false;
          const row = value as Partial<PendingRequest>;
          return typeof row.id === 'string' && row.id.length > 0
            && Object.prototype.hasOwnProperty.call(kindLabels, row.kind || '')
            && Object.prototype.hasOwnProperty.call(statusLabels, row.status || '')
            && (row.requested_at === null || typeof row.requested_at === 'string');
        });
        if (rows.length !== response.requests.length) throw new Error('Pending requests returned an invalid row.');
        if (current()) setRequests(rows);
      } catch {
        if (current()) {
          setRequests([]);
          setError(tx(locale, 'Unable to load your pending requests. Refresh to try again.'));
        }
      } finally {
        if (current()) setLoading(false);
      }
    })();
    return () => { sequence.current += 1; };
  }, [tenantId, employeeId, locale, revision]);

  const count = new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-US').format(requests.length);
  return <section aria-labelledby="employee-pending-requests-heading" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-[#08558B]" aria-hidden="true" />
        <div className="min-w-0">
          <h3 id="employee-pending-requests-heading" className="font-semibold text-[#08263D]">{tx(locale, 'Pending requests')}</h3>
          <p className="mt-1 text-xs text-slate-500">{tx(locale, 'Requests awaiting action or already in progress.')}</p>
        </div>
      </div>
      {!loading && !error && <span aria-label={tx(locale, 'Pending request count')} className="shrink-0 rounded-full bg-[#EFF7F8] px-2.5 py-1 text-xs font-semibold tabular-nums text-[#08558B]">{count}</span>}
      <button type="button" aria-label={tx(locale, 'Refresh pending requests')} disabled={loading}
        onClick={() => setRevision(value => value + 1)}
        className="grid min-h-10 min-w-10 shrink-0 place-items-center rounded-lg border border-slate-300 text-slate-700 disabled:opacity-50">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
    {error && <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
      <p>{error}</p>
      <button type="button" onClick={() => setRevision(value => value + 1)} className="mt-2 min-h-10 rounded-md border border-rose-300 bg-white px-3 font-medium">{tx(locale, 'Retry')}</button>
    </div>}
    {loading ? <p role="status" className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{tx(locale, 'Loading pending requests…')}</p>
      : error ? null
        : requests.length === 0 ? <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{tx(locale, 'No pending requests.')}</p>
          : <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto">
            {requests.map(request => <li key={`${request.kind}:${request.id}`} data-pending-request-kind={request.kind} data-pending-request-id={request.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3 first:pt-1">
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium text-slate-800">{tx(locale, kindLabels[request.kind])} · {tx(locale, statusLabels[request.status])}</p>
                <time className="mt-0.5 block text-xs text-slate-500" dateTime={request.requested_at || undefined}>{formatDate(request.requested_at, locale)}</time>
              </div>
              <button type="button" onClick={() => onOpen(request.kind)} className="min-h-10 shrink-0 rounded-lg px-3 text-sm font-medium text-[#08558B] hover:bg-[#EFF7F8]">{tx(locale, 'View history')}</button>
            </li>)}
          </ul>}
  </section>;
}

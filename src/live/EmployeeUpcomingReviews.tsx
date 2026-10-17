import { useEffect, useRef, useState } from 'react';
import { CalendarClock, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { projectText, type Locale } from './project-locale';

type Appraisal = {
  id: string;
  status: string;
  reviewer_employee_id: string | null;
  cycle_name: string;
  self_review_deadline: string | null;
  manager_review_deadline: string | null;
};
type UpcomingReview = { id: string; cycleName: string; deadline: string; kind: 'self' | 'assigned' };

const tx = (locale: Locale, value: string) => projectText(locale, value);
const isDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};

function formatDeadline(value: string, locale: Locale) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.valueOf())) return tx(locale, 'Date unavailable');
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    dateStyle: 'medium', timeZone: 'UTC',
  }).format(date);
}

export function EmployeeUpcomingReviews({ tenantId, employeeId, dashboardDate, locale, onOpen }: {
  tenantId: string;
  employeeId: string;
  dashboardDate: string;
  locale: Locale;
  onOpen: () => void;
}) {
  const [items, setItems] = useState<UpcomingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);
  const activeTenant = useRef(tenantId);
  activeTenant.current = tenantId;

  useEffect(() => {
    const request = ++sequence.current;
    const requestedTenant = tenantId;
    const isCurrent = () => request === sequence.current && activeTenant.current === requestedTenant;
    setItems([]);
    setError('');
    setLoading(true);
    if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(dashboardDate)) {
      setLoading(false);
      return () => { sequence.current += 1; };
    }

    void (async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('hris_get_my_appraisal_work', {
          p_tenant_id: requestedTenant,
        });
        if (rpcError) throw rpcError;
        const payload = data as { appraisals?: unknown } | null;
        if (!payload || !Array.isArray(payload.appraisals)) throw new Error('Review dates returned an invalid response.');
        const reviews: UpcomingReview[] = [];
        for (const value of payload.appraisals) {
          if (!value || typeof value !== 'object') throw new Error('Review dates returned an invalid row.');
          const row = value as Partial<Appraisal>;
          if (typeof row.id !== 'string' || typeof row.status !== 'string'
              || typeof row.cycle_name !== 'string'
              || !(row.reviewer_employee_id === null || typeof row.reviewer_employee_id === 'string')
              || !(row.self_review_deadline === null || typeof row.self_review_deadline === 'string')
              || !(row.manager_review_deadline === null || typeof row.manager_review_deadline === 'string')) {
            throw new Error('Review dates returned an invalid row.');
          }
          if (row.status === 'draft' && row.reviewer_employee_id !== employeeId
              && isDate(row.self_review_deadline) && row.self_review_deadline > dashboardDate) {
            reviews.push({ id: row.id, cycleName: row.cycle_name, deadline: row.self_review_deadline, kind: 'self' });
          }
          if (row.status === 'submitted_by_employee' && row.reviewer_employee_id === employeeId
              && isDate(row.manager_review_deadline) && row.manager_review_deadline > dashboardDate) {
            reviews.push({ id: row.id, cycleName: row.cycle_name, deadline: row.manager_review_deadline, kind: 'assigned' });
          }
        }
        reviews.sort((left, right) => left.deadline.localeCompare(right.deadline) || left.id.localeCompare(right.id));
        if (isCurrent()) setItems(reviews.slice(0, 3));
      } catch {
        if (isCurrent()) {
          setItems([]);
          setError(tx(locale, 'Unable to load your upcoming reviews. Refresh to try again.'));
        }
      } finally {
        if (isCurrent()) setLoading(false);
      }
    })();
    return () => { sequence.current += 1; };
  }, [tenantId, employeeId, dashboardDate, locale, revision]);

  return <section aria-labelledby="employee-upcoming-reviews-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#E7F1F3] text-[#085587]">
          <CalendarClock className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 id="employee-upcoming-reviews-heading" className="font-semibold text-[#08263D]">{tx(locale, 'Upcoming reviews')}</h3>
          <p className="mt-1 text-xs text-slate-500">{tx(locale, 'Review deadlines assigned to you.')}</p>
        </div>
      </div>
      <button type="button" aria-label={tx(locale, 'Refresh upcoming reviews')} onClick={() => setRevision(value => value + 1)} disabled={loading}
        className="grid min-h-10 min-w-10 shrink-0 place-items-center rounded-lg border border-slate-300 text-slate-600 disabled:opacity-50">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
    {loading && <p role="status" className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{tx(locale, 'Loading upcoming reviews…')}</p>}
    {error && <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
      <p>{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="mt-2 min-h-10 rounded-md border border-rose-300 bg-white px-3 font-medium">{tx(locale, 'Retry')}</button>
    </div>}
    {!loading && !error && (items.length ? <ul className="mt-3 divide-y divide-slate-100">
      {items.map(item => <li key={`${item.kind}:${item.id}`} data-upcoming-review={item.id} className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[#085587]" aria-hidden="true" />
        <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium text-slate-800">{item.cycleName}</p>
          <p className="mt-1 text-xs text-slate-600">{tx(locale, item.kind === 'self' ? 'Self-review due' : 'Assigned review due')}: {formatDeadline(item.deadline, locale)}</p></div>
      </li>)}
    </ul> : !loading && !error ? <p role="status" className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{tx(locale, 'No upcoming review deadlines.')}</p> : null)}
    <button type="button" onClick={onOpen} className="mt-3 inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-medium text-[#085587] hover:bg-[#EFF7F8]">{tx(locale, 'Open My Performance')}</button>
  </section>;
}

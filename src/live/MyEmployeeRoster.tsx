import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { projectText, type Locale } from './project-locale';

type ShiftAssignment = {
  assignment_id: string;
  assignment_date: string;
  assignment_status: string;
  shift_name: string;
  shift_code: string | null;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number | null;
  grace_minutes: number | null;
  weekly_off_days: number[] | null;
};

type RosterResponse = {
  tenant_id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  assignments: ShiftAssignment[];
};

type RangeMode = 'week' | 'month' | 'custom';
const weekDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function tx(locale: Locale, value: string) {
  return projectText(locale, value);
}

function validDate(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(new Date(`${value}T12:00:00`).valueOf()));
}

function localIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(value: string, count: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + count);
  return localIsoDate(date);
}

function monthRange(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const year = date.getFullYear();
  const month = date.getMonth();
  return {
    start: localIsoDate(new Date(year, month, 1, 12)),
    end: localIsoDate(new Date(year, month + 1, 0, 12)),
  };
}

function shiftMonth(value: string, delta: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(1);
  date.setMonth(date.getMonth() + delta);
  return localIsoDate(date);
}

function formatDate(value: string, locale: Locale) {
  if (!validDate(value)) return value;
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    weekday: 'long', year: 'numeric', month: 'short', day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatTime(value: string | null, locale: Locale) {
  if (!value) return '—';
  const short = value.slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(short)) return '—';
  const numberFormat = new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    minimumIntegerDigits: 2, useGrouping: false,
  });
  return `${numberFormat.format(Number(short.slice(0, 2)))}:${numberFormat.format(Number(short.slice(3, 5)))}`;
}

function rangeError(start: string, end: string, locale: Locale) {
  if (!validDate(start) || !validDate(end) || start > end) return tx(locale, 'Choose a valid roster date range.');
  const difference = (new Date(`${end}T12:00:00Z`).valueOf() - new Date(`${start}T12:00:00Z`).valueOf()) / 86_400_000;
  return difference > 30 ? tx(locale, 'Roster ranges can include up to 31 days.') : '';
}

export function MyEmployeeRoster({ tenantId, locale, focusDate }: {
  tenantId: string;
  locale: Locale;
  focusDate: string | null;
}) {
  const initialDate = validDate(focusDate) ? focusDate : localIsoDate(new Date());
  const [rangeStart, setRangeStart] = useState(initialDate);
  const [rangeEnd, setRangeEnd] = useState(validDate(focusDate) ? initialDate : addDays(initialDate, 6));
  const [draftStart, setDraftStart] = useState(initialDate);
  const [draftEnd, setDraftEnd] = useState(validDate(focusDate) ? initialDate : addDays(initialDate, 6));
  const [rangeMode, setRangeMode] = useState<RangeMode>(validDate(focusDate) ? 'custom' : 'week');
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const requestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  activeTenantId.current = tenantId;

  useEffect(() => {
    if (!validDate(focusDate)) return;
    setRangeStart(focusDate);
    setRangeEnd(focusDate);
    setDraftStart(focusDate);
    setDraftEnd(focusDate);
    setRangeMode('custom');
  }, [focusDate]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    const requestedTenant = tenantId;
    const current = () => requestId === requestSequence.current && activeTenantId.current === requestedTenant;
    setAssignments([]);
    setLoading(true);
    setError('');
    const invalidRange = rangeError(rangeStart, rangeEnd, locale);
    if (invalidRange) {
      setError(invalidRange);
      setLoading(false);
      return () => { requestSequence.current += 1; };
    }
    void (async () => {
      try {
        const result = await supabase.rpc('hris_get_my_shift_roster', {
          p_tenant_id: requestedTenant,
          p_start: rangeStart,
          p_end: rangeEnd,
        });
        if (!current()) return;
        if (result.error) throw result.error;
        const data = result.data as RosterResponse | null;
        if (!data || data.tenant_id !== requestedTenant || data.start_date !== rangeStart
            || data.end_date !== rangeEnd || !Array.isArray(data.assignments)
            || data.assignments.some(row => !row || typeof row.assignment_id !== 'string'
              || !validDate(row.assignment_date) || typeof row.shift_name !== 'string')) {
          throw new Error('Roster returned an invalid response.');
        }
        setAssignments(data.assignments);
      } catch {
        if (current()) setError(tx(locale, 'Unable to load your roster. Try again.'));
      } finally {
        if (current()) setLoading(false);
      }
    })();
    return () => { requestSequence.current += 1; };
  }, [tenantId, rangeStart, rangeEnd, revision, locale]);

  function applyRange() {
    const invalidRange = rangeError(draftStart, draftEnd, locale);
    if (invalidRange) {
      setError(invalidRange);
      return;
    }
    setError('');
    setRangeMode('custom');
    setRangeStart(draftStart);
    setRangeEnd(draftEnd);
  }

  function showSevenDays(start: string) {
    const end = addDays(start, 6);
    setRangeMode('week');
    setRangeStart(start);
    setRangeEnd(end);
    setDraftStart(start);
    setDraftEnd(end);
  }

  function showMonth(anchor: string) {
    const range = monthRange(anchor);
    setRangeMode('month');
    setRangeStart(range.start);
    setRangeEnd(range.end);
    setDraftStart(range.start);
    setDraftEnd(range.end);
  }

  function moveRange(delta: number) {
    if (rangeMode === 'month') {
      showMonth(shiftMonth(rangeStart, delta));
      return;
    }
    showSevenDays(addDays(rangeStart, delta * 7));
  }

  const dayNames = weekDayNames.map(name => tx(locale, name));

  return <section aria-labelledby="my-roster-heading" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 id="my-roster-heading" className="text-2xl font-medium text-[#49454F]">{tx(locale, 'My Roster')}</h2>
        <p className="mt-1 text-sm text-slate-600">{tx(locale, 'View your assigned shifts and the weekly off days configured for each shift.')}</p>
      </div>
      <button type="button" aria-label={tx(locale, 'Refresh roster')} disabled={loading}
        onClick={() => setRevision(value => value + 1)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />{tx(locale, 'Refresh')}
      </button>
    </div>

    <section aria-label={tx(locale, 'Roster date controls')} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => moveRange(-1)} aria-label={tx(locale, rangeMode === 'month' ? 'Previous month' : 'Previous seven days')}
          className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => showSevenDays(localIsoDate(new Date()))}
          className={`min-h-11 rounded-lg px-3 text-sm font-medium ${rangeMode === 'week' ? 'bg-[#E7F1F3] text-[#08558B]' : 'border border-slate-300 bg-white'}`}>
          {tx(locale, 'Next 7 days')}
        </button>
        <button type="button" onClick={() => showMonth(localIsoDate(new Date()))}
          className={`min-h-11 rounded-lg px-3 text-sm font-medium ${rangeMode === 'month' ? 'bg-[#E7F1F3] text-[#08558B]' : 'border border-slate-300 bg-white'}`}>
          {tx(locale, 'This month')}
        </button>
        <button type="button" onClick={() => moveRange(1)} aria-label={tx(locale, rangeMode === 'month' ? 'Next month' : 'Next seven days')}
          className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <form className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={event => { event.preventDefault(); applyRange(); }}>
        <div><label htmlFor="my-roster-start" className="mb-1 block text-sm font-medium text-slate-700">{tx(locale, 'From')}</label>
          <input id="my-roster-start" type="date" value={draftStart} onChange={event => setDraftStart(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
        <div><label htmlFor="my-roster-end" className="mb-1 block text-sm font-medium text-slate-700">{tx(locale, 'To')}</label>
          <input id="my-roster-end" type="date" value={draftEnd} onChange={event => setDraftEnd(event.target.value)}
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" /></div>
        <button type="submit" className="min-h-11 rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white hover:bg-[#074770]">{tx(locale, 'Apply dates')}</button>
      </form>
      <p className="mt-3 text-xs text-slate-500">{formatDate(rangeStart, locale)} – {formatDate(rangeEnd, locale)}</p>
    </section>

    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <p>{error}</p><button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}
        className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium disabled:opacity-50">{tx(locale, 'Retry')}</button>
    </div>}
    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{tx(locale, 'Loading your roster…')}</p>
      : error ? null : assignments.length === 0 ? <div role="status" className="rounded-xl border border-dashed border-[#B9DCE2] bg-white p-6 text-center">
        <CalendarDays className="mx-auto h-7 w-7 text-[#08558B]" aria-hidden="true" />
        <h3 className="mt-2 font-semibold text-slate-800">{tx(locale, 'No shift assignments for these dates')}</h3>
        <p className="mt-1 text-sm text-slate-600">{tx(locale, 'No schedule data is substituted for missing assignments.')}</p>
      </div> : <div role="region" aria-label={tx(locale, 'Assigned shift history')} className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
        {assignments.map(assignment => {
          const weeklyOff = Array.isArray(assignment.weekly_off_days)
            ? [...new Set(assignment.weekly_off_days)].filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
              .sort((a, b) => a - b).map(day => dayNames[day]).join(', ')
            : '';
          return <article key={assignment.assignment_id} data-roster-assignment-id={assignment.assignment_id}
            className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><p className="text-xs font-medium text-slate-500">{formatDate(assignment.assignment_date, locale)}</p>
                <h3 className="mt-1 break-words font-semibold text-slate-900">{assignment.shift_name}</h3>
                {assignment.shift_code && <p className="mt-0.5 text-xs text-slate-500">{assignment.shift_code}</p>}
              </div>
              <span className="shrink-0 rounded-full bg-[#E7F1F3] px-3 py-1 text-xs font-medium text-[#08558B]">{tx(locale, assignment.assignment_status === 'scheduled' ? 'Scheduled' : assignment.assignment_status)}</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-100 pt-3 text-sm">
              <div><dt className="text-xs text-slate-500">{tx(locale, 'Shift time')}</dt><dd className="mt-1 font-medium tabular-nums">{formatTime(assignment.start_time, locale)} – {formatTime(assignment.end_time, locale)}</dd></div>
              <div><dt className="text-xs text-slate-500">{tx(locale, 'Break')}</dt><dd className="mt-1 font-medium tabular-nums">{assignment.break_minutes ?? '—'} {tx(locale, 'minutes')}</dd></div>
              <div><dt className="text-xs text-slate-500">{tx(locale, 'Grace period')}</dt><dd className="mt-1 font-medium tabular-nums">{assignment.grace_minutes ?? '—'} {tx(locale, 'minutes')}</dd></div>
              <div><dt className="text-xs text-slate-500">{tx(locale, 'Weekly off days')}</dt><dd className="mt-1 break-words font-medium">{weeklyOff || '—'}</dd></div>
            </dl>
          </article>;
        })}
      </div>}
  </section>;
}

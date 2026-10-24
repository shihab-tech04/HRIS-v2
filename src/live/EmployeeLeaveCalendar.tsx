import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import type { Locale } from './project-locale';
import { projectText } from './project-locale';
import { supabase } from '../lib/supabase';

type CalendarRow = Record<string, unknown>;

type EmployeeLeaveCalendarProps = {
  tenantId: string;
  initialDate: string;
  locale: Locale;
};

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());
}

function monthFor(date: string): string {
  return isIsoDate(date) ? date.slice(0, 7) : new Date().toISOString().slice(0, 7);
}

function cellsFor(month: string): Array<string | null> {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return [];
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return [];
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const mondayFirstOffset = (firstDay.getUTCDay() + 6) % 7;
  const cellCount = Math.ceil((mondayFirstOffset + dayCount) / 7) * 7;
  return Array.from({ length: cellCount }, (_, index) => {
    const day = index - mondayFirstOffset + 1;
    return day < 1 || day > dayCount ? null : `${month}-${String(day).padStart(2, '0')}`;
  });
}

function shiftMonth(month: string, amount: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return monthFor('');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function localizedDate(value: string, locale: Locale, options: Intl.DateTimeFormatOptions = {}): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', ...options,
    timeZone: 'UTC',
  });
}

export function EmployeeLeaveCalendar({ tenantId, initialDate, locale }: EmployeeLeaveCalendarProps) {
  const tx = (value: string) => projectText(locale, value);
  const [month, setMonth] = useState(() => monthFor(initialDate));
  const [selectedDate, setSelectedDate] = useState(() => isIsoDate(initialDate) ? initialDate : `${monthFor(initialDate)}-01`);
  const [approvedLeave, setApprovedLeave] = useState<CalendarRow[]>([]);
  const [holidays, setHolidays] = useState<CalendarRow[]>([]);
  const [loadedKey, setLoadedKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  activeTenantId.current = tenantId;
  const requestedKey = `${tenantId}:${month}`;

  async function loadCalendar(showLoading = true) {
    const requestId = ++requestSequence.current;
    const requestedTenantId = tenantId;
    const monthStart = `${month}-01`;
    const monthEnd = new Date(`${month}-01T12:00:00Z`);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
    const rangeEnd = monthEnd.toISOString().slice(0, 10);
    if (showLoading) setLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('hris_get_my_leave_calendar', {
        p_tenant_id: requestedTenantId,
        p_start_date: monthStart,
        p_end_date: rangeEnd,
      });
      if (rpcError) throw rpcError;
      const value = data && typeof data === 'object' && !Array.isArray(data)
        ? data as Record<string, unknown> : null;
      if (!value || !Array.isArray(value.approved_leave) || !Array.isArray(value.holidays)) {
        throw new Error(tx('The leave calendar returned an invalid response.'));
      }
      if (requestId !== requestSequence.current || activeTenantId.current !== requestedTenantId) return;
      setApprovedLeave(value.approved_leave.filter(row => row && typeof row === 'object' && !Array.isArray(row)) as CalendarRow[]);
      setHolidays(value.holidays.filter(row => row && typeof row === 'object' && !Array.isArray(row)) as CalendarRow[]);
      setLoadedKey(requestedKey);
    } catch (cause) {
      if (requestId !== requestSequence.current || activeTenantId.current !== requestedTenantId) return;
      setApprovedLeave([]);
      setHolidays([]);
      setLoadedKey('');
      setError(cause instanceof Error ? cause.message : tx('Unable to load your leave calendar.'));
    } finally {
      if (requestId === requestSequence.current && activeTenantId.current === requestedTenantId) setLoading(false);
    }
  }

  useEffect(() => {
    setApprovedLeave([]);
    setHolidays([]);
    setLoadedKey('');
    setError('');
    void loadCalendar();
    return () => { requestSequence.current += 1; };
  }, [tenantId, month]);

  const cells = useMemo(() => cellsFor(month), [month]);
  const weekdays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(2024, 0, 1 + index));
    return date.toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', { weekday: 'short', timeZone: 'UTC' });
  });
  const monthLabel = new Date(`${month}-01T12:00:00Z`).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });
  const selectedLabel = localizedDate(selectedDate, locale, { weekday: 'long', year: 'numeric', month: 'long' });
  const visibleLeave = loadedKey === requestedKey ? approvedLeave : [];
  const visibleHolidays = loadedKey === requestedKey ? holidays : [];
  const leaveForMonth = visibleLeave.filter(row => isIsoDate(row.from_date) && isIsoDate(row.to_date)
    && String(row.from_date) <= `${month}-31` && String(row.to_date) >= `${month}-01`);
  const holidaysForMonth = visibleHolidays.filter(row => row.active !== false && isIsoDate(row.start_date) && isIsoDate(row.end_date)
    && String(row.start_date) <= `${month}-31` && String(row.end_date) >= `${month}-01`);
  const selectedLeave = leaveForMonth.filter(row => String(row.from_date) <= selectedDate && String(row.to_date) >= selectedDate);
  const selectedHolidays = holidaysForMonth.filter(row => String(row.start_date) <= selectedDate && String(row.end_date) >= selectedDate);
  const dayNumber = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDate()
    .toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US');

  return <section aria-labelledby="personal-leave-calendar-heading" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h3 id="personal-leave-calendar-heading" className="flex items-center gap-2 font-semibold text-[#08263D]">
          <CalendarDays className="h-5 w-5 text-[#08558B]" aria-hidden="true" />{tx('My leave calendar')}
        </h3>
        <p className="mt-1 text-xs text-slate-600">{tx('Approved leave and tenant-wide holidays. Request reasons stay private.')}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" disabled={loading} onClick={() => void loadCalendar()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50">
          <RefreshCw className="h-4 w-4" />{tx('Refresh')}
        </button>
        <button type="button" aria-label={tx('Previous month')} onClick={() => {
          const next = shiftMonth(month, -1); setMonth(next); setSelectedDate(`${next}-01`);
        }} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg">‹</button>
        <div>
          <label htmlFor="personal-leave-calendar-month" className="mb-1 block text-xs font-medium text-slate-600">{tx('Month')}</label>
          <input id="personal-leave-calendar-month" type="month" value={month} onChange={event => {
            if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) {
              setMonth(event.target.value); setSelectedDate(`${event.target.value}-01`);
            }
          }} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        </div>
        <button type="button" aria-label={tx('Next month')} onClick={() => {
          const next = shiftMonth(month, 1); setMonth(next); setSelectedDate(`${next}-01`);
        }} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-lg">›</button>
        <button type="button" onClick={() => {
          const current = monthFor(initialDate); setMonth(current); setSelectedDate(isIsoDate(initialDate) ? initialDate : `${current}-01`);
        }} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm">{tx('Current month')}</button>
      </div>
    </div>

    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
      <span>{error}</span><button type="button" onClick={() => void loadCalendar()} className="min-h-10 rounded-md border border-rose-300 bg-white px-3 font-medium">{tx('Retry')}</button>
    </div>}
    {loading && <p role="status" className="rounded-lg border bg-[#F8FAFA] p-4 text-sm">{tx('Loading your leave calendar…')}</p>}

    {loadedKey === requestedKey && !loading && <div className="overflow-x-auto rounded-lg border border-slate-200" role="region" aria-label={`${tx('My leave calendar')} ${monthLabel}`} tabIndex={0}>
      <table className="w-full min-w-[336px] table-fixed text-left text-sm" aria-label={`${tx('My leave calendar')} ${monthLabel}`}>
        <thead className="bg-[#EFF7F8] text-xs text-slate-600"><tr>{weekdays.map(day => <th key={day} scope="col" className="px-1 py-2 text-center font-medium">{day}</th>)}</tr></thead>
        <tbody>{Array.from({ length: cells.length / 7 }, (_, week) => <tr key={week} className="divide-x divide-slate-100 border-t border-slate-100">
          {cells.slice(week * 7, week * 7 + 7).map((date, dayIndex) => {
            if (!date) return <td key={`empty-${week}-${dayIndex}`} className="h-[76px] bg-slate-50/60" aria-hidden="true" />;
            const onLeave = leaveForMonth.some(row => String(row.from_date) <= date && String(row.to_date) >= date);
            const dayHolidays = holidaysForMonth.filter(row => String(row.start_date) <= date && String(row.end_date) >= date);
            const accessibleEvents = [onLeave ? tx('Approved leave') : '', ...dayHolidays.map(row => String(row.name || ''))].filter(Boolean);
            const dayLabel = localizedDate(date, locale, { weekday: 'long', year: 'numeric', month: 'long' });
            return <td key={date} className="h-[76px] p-0.5 align-top sm:p-1">
              <button type="button" aria-pressed={selectedDate === date}
                aria-label={`${dayLabel}${accessibleEvents.length ? `, ${accessibleEvents.join(', ')}` : ''}`}
                onClick={() => setSelectedDate(date)}
                className={`flex h-full min-h-[72px] w-full flex-col items-start rounded-md p-1 text-left focus-visible:outline-2 focus-visible:outline-[#085587] sm:p-1.5 ${selectedDate === date ? 'bg-[#E7F1F3] ring-1 ring-[#085587]' : 'hover:bg-slate-50'}`}>
                <span className="font-medium tabular-nums">{dayNumber(date)}</span>
                {onLeave && <span className="mt-1 w-full truncate rounded bg-[#DCEFF4] px-1 py-0.5 text-[9px] font-medium leading-3 text-[#085587] sm:text-[10px]">{tx('Approved leave')}</span>}
                {dayHolidays.length > 0 && <span className="mt-1 w-full truncate rounded bg-amber-50 px-1 py-0.5 text-[9px] leading-3 text-amber-800 sm:text-[10px]">{String(dayHolidays[0].name || tx('Organization holiday'))}</span>}
              </button>
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>}

    {loadedKey === requestedKey && !loading && <div className="grid gap-4 md:grid-cols-2">
      <section aria-labelledby="personal-leave-calendar-day-heading" className="min-w-0 rounded-lg border border-slate-200 p-3">
        <h4 id="personal-leave-calendar-day-heading" className="font-medium text-slate-800">{tx('My approved leave on')} {selectedLabel}</h4>
        {selectedLeave.length ? <ul className="mt-2 divide-y divide-slate-100">{selectedLeave.map((row, index) => <li key={String(row.id || index)} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-2 text-sm">
          <span className="font-medium text-slate-800">{String(row.leave_type_name || tx('Approved leave'))}</span>
          <span className="text-slate-600">{localizedDate(String(row.from_date), locale)} – {localizedDate(String(row.to_date), locale)}</span>
        </li>)}</ul> : <p className="mt-2 text-sm text-slate-600">{tx('No approved leave on this date.')}</p>}
      </section>
      <section aria-labelledby="personal-leave-calendar-holiday-heading" className="min-w-0 rounded-lg border border-slate-200 p-3">
        <h4 id="personal-leave-calendar-holiday-heading" className="font-medium text-slate-800">{tx('Organization holidays on')} {selectedLabel}</h4>
        {selectedHolidays.length ? <ul className="mt-2 divide-y divide-slate-100">{selectedHolidays.map((row, index) => <li key={String(row.id || index)} className="py-2 text-sm text-slate-700">
          {String(row.name || tx('Organization holiday'))} · {localizedDate(String(row.start_date), locale)} – {localizedDate(String(row.end_date), locale)}
        </li>)}</ul> : <p className="mt-2 text-sm text-slate-600">{tx('No organization holidays on this date.')}</p>}
      </section>
    </div>}
  </section>;
}

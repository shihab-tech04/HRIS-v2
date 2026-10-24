import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Amount = number | string | null;
type Period = { id: string; name: string; start_date: string; end_date: string; pay_date: string | null; status: string; currency: string };
type RegisterRow = {
  id: string;
  pay_period_id: string;
  period_name: string;
  period_start_date: string;
  pay_date: string | null;
  employee_id: string;
  employee_name: string;
  employee_number: string;
  currency: string;
  status: 'draft' | 'released' | 'void';
  gross_earnings: Amount;
  total_deductions: Amount;
  net_salary: Amount;
  released_at: string | null;
};
type RegisterContext = { tenant_id: string; periods: Period[]; payslips: RegisterRow[]; total_count: number; limit: number; offset: number };
const PAGE_SIZE = 25;

function dateLabel(value: string | null): string {
  if (!value) return 'Not provided';
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? 'Not provided' : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function amountLabel(value: Amount, currency: string): string {
  if (value === null || value === '') return '—';
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return '—';
  if (/^[A-Z]{3}$/.test(currency)) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount); }
    catch { /* Keep the persisted code and amount visible for unsupported currency codes. */ }
  }
  return `${currency || ''} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

function statusLabel(status: RegisterRow['status']): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function PayrollRegister({ tenantId }: { tenantId: string }) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [periodId, setPeriodId] = useState('');
  const [status, setStatus] = useState('all');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dataTenantId, setDataTenantId] = useState('');
  const requestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  activeTenantId.current = tenantId;

  useEffect(() => {
    const requestId = ++requestSequence.current;
    const requestedTenant = tenantId;
    const current = () => requestId === requestSequence.current && activeTenantId.current === requestedTenant;
    if (dataTenantId !== requestedTenant) {
      setPeriods([]); setRows([]); setTotalCount(0); setDataTenantId('');
    }
    setLoading(true); setError('');
    void (async () => {
      try {
        const result = await supabase.rpc('hris_get_tenant_payroll_register', {
          p_tenant_id: requestedTenant,
          p_pay_period_id: periodId || null,
          p_status: status === 'all' ? null : status,
          p_search: search || null,
          p_limit: PAGE_SIZE,
          p_offset: page * PAGE_SIZE,
        });
        if (!current()) return;
        if (result.error) throw result.error;
        const data = result.data as RegisterContext | null;
        if (!data || data.tenant_id !== requestedTenant || !Array.isArray(data.periods)
            || !Array.isArray(data.payslips) || !Number.isInteger(data.total_count)
            || data.payslips.some(row => !row || typeof row.id !== 'string'
              || typeof row.employee_name !== 'string' || typeof row.employee_number !== 'string'
              || !['draft', 'released', 'void'].includes(row.status))) {
          throw new Error('Payroll register returned an invalid response.');
        }
        setPeriods(data.periods); setRows(data.payslips); setTotalCount(data.total_count); setDataTenantId(requestedTenant);
      } catch (cause) {
        if (current()) {
          setDataTenantId(requestedTenant);
          setError(cause instanceof Error ? cause.message : 'Unable to load the payroll register.');
        }
      } finally {
        if (current()) setLoading(false);
      }
    })();
    return () => { requestSequence.current += 1; };
  }, [tenantId, periodId, status, search, page, revision]);

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(0);
    setSearch(searchDraft.trim());
  }

  function clearFilters() {
    setSearchDraft(''); setSearch(''); setPeriodId(''); setStatus('all'); setPage(0);
  }

  // A tenant switch can render once before the new request effect runs. Keep
  // prior-tenant rows and errors out of that frame while the new scope loads.
  const tenantPending = dataTenantId !== tenantId;
  const viewLoading = loading || tenantPending;
  const viewError = tenantPending ? '' : error;
  const viewTotalCount = tenantPending ? 0 : totalCount;
  const viewRows = tenantPending ? [] : rows;
  const pageCount = Math.max(1, Math.ceil(viewTotalCount / PAGE_SIZE));
  const start = viewTotalCount ? page * PAGE_SIZE + 1 : 0;
  const end = Math.min((page + 1) * PAGE_SIZE, viewTotalCount);
  const hasFilters = Boolean(periodId || search || status !== 'all');

  return <section aria-labelledby="payroll-register-heading" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><h2 id="payroll-register-heading" className="text-2xl font-medium text-[#49454F]">Payroll register</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">Read-only access to employee payslips authorized for this organization. Amounts are displayed as recorded; this page does not calculate or change payroll.</p></div>
      <button type="button" aria-label="Refresh payroll register" onClick={() => setRevision(value => value + 1)} disabled={viewLoading}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true"/>Refresh</button>
    </div>

    <form onSubmit={applySearch} className="grid gap-3 rounded-xl border border-[#DEE0E3] bg-white p-4 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_minmax(200px,0.8fr)_minmax(160px,0.6fr)_auto_auto] xl:items-end">
      <label className="block min-w-0 text-xs font-medium text-slate-600">Search employee
        <span className="relative mt-1 block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true"/><input type="search" value={searchDraft} maxLength={100} onChange={event => setSearchDraft(event.target.value)} placeholder="Name or employee number" aria-label="Search payroll employees" className="min-h-11 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm"/></span>
      </label>
      <label className="block min-w-0 text-xs font-medium text-slate-600">Pay period
        <select value={periodId} onChange={event => { setPeriodId(event.target.value); setPage(0); }} aria-label="Filter payroll by pay period" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
          <option value="">All pay periods</option>{periods.map(period => <option key={period.id} value={period.id}>{period.name} · {dateLabel(period.start_date)}</option>)}
        </select>
      </label>
      <label className="block min-w-0 text-xs font-medium text-slate-600">Payslip status
        <select value={status} onChange={event => { setStatus(event.target.value); setPage(0); }} aria-label="Filter payroll by payslip status" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
          <option value="all">All statuses</option><option value="draft">Draft</option><option value="released">Released</option><option value="void">Void</option>
        </select>
      </label>
      <button type="submit" disabled={viewLoading} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#08558B] px-4 text-sm font-semibold text-white disabled:opacity-50">Apply search</button>
      {hasFilters && <button type="button" onClick={clearFilters} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700">Clear filters</button>}
    </form>

    {viewError && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p role="alert">{viewError}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">Retry</button></div>}
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-slate-600">{viewLoading ? 'Loading payroll records…' : `${viewTotalCount.toLocaleString()} payslips · ${start.toLocaleString()}–${end.toLocaleString()} shown`}</p><p className="text-xs font-medium text-slate-500">Read only</p></div>

    {viewLoading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading payroll register…</p>
      : viewError ? null
        : viewRows.length === 0 ? <div role="status" className="rounded-xl border border-dashed border-[#B9DCE2] bg-white p-6 text-center"><h3 className="font-semibold text-slate-800">{hasFilters ? 'No payslips match these filters' : 'No payroll records yet'}</h3><p className="mt-1 text-sm text-slate-600">{hasFilters ? 'Try a different employee, period, or status.' : 'Payslips recorded for this organization will appear here.'}</p>{hasFilters && <button type="button" onClick={clearFilters} className="mt-3 min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium">Clear filters</button>}</div>
          : <>
            <div className="hidden overflow-x-auto rounded-xl border border-[#DEE0E3] bg-white md:block"><table aria-label="Tenant payroll register" className="w-full min-w-[940px] text-left text-sm"><thead className="bg-[#F6F8FA] text-xs text-slate-600"><tr>{['Employee','Employee number','Pay period','Status','Gross earnings','Total deductions','Net salary'].map(label => <th key={label} scope="col" className="px-3 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{viewRows.map(row => <tr key={row.id} data-payslip={row.id} className="align-top"><th scope="row" className="max-w-[220px] break-words px-3 py-3 font-medium text-slate-900">{row.employee_name}</th><td className="px-3 py-3 text-slate-600">{row.employee_number}</td><td className="px-3 py-3 text-slate-600">{row.period_name}<span className="mt-1 block text-xs">Pay date: {dateLabel(row.pay_date)}</span></td><td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${row.status === 'released' ? 'bg-emerald-50 text-emerald-800' : row.status === 'void' ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-900'}`}>{statusLabel(row.status)}</span></td><td className="px-3 py-3 text-right font-medium tabular-nums">{amountLabel(row.gross_earnings,row.currency)}</td><td className="px-3 py-3 text-right font-medium tabular-nums">{amountLabel(row.total_deductions,row.currency)}</td><td className="px-3 py-3 text-right font-semibold tabular-nums text-[#08558B]">{amountLabel(row.net_salary,row.currency)}</td></tr>)}</tbody></table></div>
            <div aria-label="Tenant payroll register cards" className="space-y-3 md:hidden">{viewRows.map(row => <article key={row.id} data-payslip={row.id} className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-semibold text-slate-900">{row.employee_name}</h3><p className="mt-1 text-xs text-slate-500">{row.employee_number}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{statusLabel(row.status)}</span></div><p className="mt-3 text-sm text-slate-600">{row.period_name} · Pay date: {dateLabel(row.pay_date)}</p><dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-[#F6F8FA] p-3"><div><dt className="text-xs text-slate-500">Gross earnings</dt><dd className="mt-1 break-words text-sm font-medium tabular-nums">{amountLabel(row.gross_earnings,row.currency)}</dd></div><div><dt className="text-xs text-slate-500">Total deductions</dt><dd className="mt-1 break-words text-sm font-medium tabular-nums">{amountLabel(row.total_deductions,row.currency)}</dd></div><div className="col-span-2 border-t border-slate-200 pt-2"><dt className="text-xs text-slate-500">Net salary</dt><dd className="mt-1 break-words text-base font-semibold tabular-nums text-[#08558B]">{amountLabel(row.net_salary,row.currency)}</dd></div></dl></article>)}</div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"><p className="text-sm text-slate-600">Page {(page + 1).toLocaleString()} of {pageCount.toLocaleString()}</p><div className="flex gap-2"><button type="button" onClick={() => setPage(value => Math.max(0,value-1))} disabled={viewLoading || page===0} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium disabled:opacity-50">Previous</button><button type="button" onClick={() => setPage(value => value+1)} disabled={viewLoading || end>=viewTotalCount} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium disabled:opacity-50">Next</button></div></div>
          </>}
  </section>;
}

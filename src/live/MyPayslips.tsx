import { useEffect, useRef, useState } from 'react';
import { Receipt, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

type PayslipAmount = number | string | null;
type Payslip = {
  id: string;
  currency: string;
  basic_salary: PayslipAmount;
  house_rent_allowance: PayslipAmount;
  medical_allowance: PayslipAmount;
  transport_allowance: PayslipAmount;
  special_allowance: PayslipAmount;
  overtime_pay: PayslipAmount;
  bonus: PayslipAmount;
  gross_earnings: PayslipAmount;
  tax_deduction: PayslipAmount;
  provident_fund_deduction: PayslipAmount;
  leave_without_pay_deduction: PayslipAmount;
  other_deductions: PayslipAmount;
  total_deductions: PayslipAmount;
  net_salary: PayslipAmount;
  period: { id: string; name: string; start_date: string; end_date: string; pay_date: string | null };
};
type PayslipContext = { tenant_id: string; payslips: Payslip[] };

function displayDate(value: string | null): string {
  if (!value) return 'Not provided';
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? 'Not provided' : parsed.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatAmount(value: PayslipAmount, currency: string): string {
  if (value === null || value === '') return '—';
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return '—';
  if (/^[A-Z]{3}$/.test(currency)) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount); }
    catch { /* Display the persisted code and value when Intl lacks this currency. */ }
  }
  return `${currency || ''} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

const earnings: { key: keyof Payslip; label: string }[] = [
  { key: 'basic_salary', label: 'Basic salary' },
  { key: 'house_rent_allowance', label: 'House rent allowance' },
  { key: 'medical_allowance', label: 'Medical allowance' },
  { key: 'transport_allowance', label: 'Transport allowance' },
  { key: 'special_allowance', label: 'Special allowance' },
  { key: 'overtime_pay', label: 'Overtime pay' },
  { key: 'bonus', label: 'Bonus' },
  { key: 'gross_earnings', label: 'Gross earnings' },
];
const deductions: { key: keyof Payslip; label: string }[] = [
  { key: 'tax_deduction', label: 'Tax deduction' },
  { key: 'provident_fund_deduction', label: 'Provident fund deduction' },
  { key: 'leave_without_pay_deduction', label: 'Leave without pay' },
  { key: 'other_deductions', label: 'Other deductions' },
  { key: 'total_deductions', label: 'Total deductions' },
];

export function MyPayslips({ tenantId }: { tenantId: string }) {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const requestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  activeTenantId.current = tenantId;

  useEffect(() => {
    const requestId = ++requestSequence.current;
    const requestedTenant = tenantId;
    const current = () => requestId === requestSequence.current && activeTenantId.current === requestedTenant;
    setPayslips([]);
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const result = await supabase.rpc('hris_get_my_payslips', { p_tenant_id: requestedTenant });
        if (!current()) return;
        if (result.error) throw result.error;
        const data = result.data as PayslipContext | null;
        if (!data || data.tenant_id !== requestedTenant || !Array.isArray(data.payslips)
            || data.payslips.some(row => !row || typeof row.id !== 'string' || typeof row.currency !== 'string'
              || !row.period || typeof row.period.id !== 'string' || typeof row.period.name !== 'string')) {
          throw new Error('Payslip history returned an invalid response.');
        }
        setPayslips(data.payslips);
      } catch (cause) {
        if (current()) setError(cause instanceof Error ? cause.message : 'Unable to load your payslips.');
      } finally {
        if (current()) setLoading(false);
      }
    })();
    return () => { requestSequence.current += 1; };
  }, [tenantId, revision]);

  return <section aria-labelledby="my-payslips-heading" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><h2 id="my-payslips-heading" className="text-2xl font-medium text-[#49454F]">My Payslips</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">Review payslips released for your employee account. Amounts and period details are shown as recorded.</p></div>
      <button type="button" aria-label="Refresh payslips" onClick={() => setRevision(value => value + 1)} disabled={loading}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true"/>Refresh</button>
    </div>

    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p role="alert">{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">Retry</button></div>}
    <article className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><Receipt className="h-6 w-6 shrink-0 text-[#08558B]" aria-hidden="true"/><div><p className="text-xs font-medium text-slate-500">Released payslips</p><p className="mt-1 text-2xl font-semibold tabular-nums text-[#08263D]">{loading ? '—' : payslips.length}</p></div></article>

    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading your payslips…</p>
      : error ? null
        : payslips.length === 0 ? <div role="status" className="rounded-xl border border-dashed border-[#B9DCE2] bg-white p-6 text-center"><Receipt className="mx-auto h-7 w-7 text-[#08558B]" aria-hidden="true"/><h3 className="mt-2 font-semibold text-slate-800">No released payslips yet</h3><p className="mt-1 text-sm text-slate-600">Released payroll records will appear here.</p></div>
          : <div aria-label="Released payslip history" className="space-y-3">{payslips.map(payslip => <article key={payslip.id} data-payslip={payslip.id} className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-[#615E83]">{payslip.period.name}</p><h3 className="mt-1 break-words text-lg font-semibold text-[#1E1B39]">{displayDate(payslip.period.start_date)} – {displayDate(payslip.period.end_date)}</h3><p className="mt-1 text-sm text-slate-600">Pay date: {displayDate(payslip.period.pay_date)}</p></div><span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">Released</span></div>
            <dl className="mt-4 grid gap-3 rounded-lg bg-[#F6F8FA] p-3 sm:grid-cols-3"><div><dt className="text-xs font-medium text-slate-500">Gross earnings</dt><dd className="mt-1 break-words font-semibold tabular-nums text-slate-900">{formatAmount(payslip.gross_earnings,payslip.currency)}</dd></div><div><dt className="text-xs font-medium text-slate-500">Total deductions</dt><dd className="mt-1 break-words font-semibold tabular-nums text-slate-900">{formatAmount(payslip.total_deductions,payslip.currency)}</dd></div><div><dt className="text-xs font-medium text-slate-500">Net salary</dt><dd className="mt-1 break-words font-semibold tabular-nums text-[#08558B]">{formatAmount(payslip.net_salary,payslip.currency)}</dd></div></dl>
            <details className="mt-4 rounded-lg border border-slate-200 px-3">
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-[#08558B]">View earnings and deductions</summary>
              <div className="grid gap-4 border-t border-slate-100 py-3 sm:grid-cols-2">
                <section aria-label="Earnings"><h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Earnings</h4><dl className="mt-2 space-y-2">{earnings.map(item => <div key={item.key} className="flex items-start justify-between gap-3 text-sm"><dt className="min-w-0 text-slate-600">{item.label}</dt><dd className="shrink-0 text-right font-medium tabular-nums text-slate-900">{formatAmount(payslip[item.key] as PayslipAmount,payslip.currency)}</dd></div>)}</dl></section>
                <section aria-label="Deductions"><h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Deductions</h4><dl className="mt-2 space-y-2">{deductions.map(item => <div key={item.key} className="flex items-start justify-between gap-3 text-sm"><dt className="min-w-0 text-slate-600">{item.label}</dt><dd className="shrink-0 text-right font-medium tabular-nums text-slate-900">{formatAmount(payslip[item.key] as PayslipAmount,payslip.currency)}</dd></div>)}<div className="flex items-start justify-between gap-3 border-t border-slate-100 pt-2 text-sm font-semibold"><dt className="min-w-0 text-slate-800">Net salary</dt><dd className="shrink-0 text-right tabular-nums text-[#08558B]">{formatAmount(payslip.net_salary,payslip.currency)}</dd></div></dl></section>
              </div>
            </details>
          </article>)}</div>}
  </section>;
}

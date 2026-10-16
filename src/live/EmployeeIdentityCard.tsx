import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Building2, BriefcaseBusiness, IdCard, RefreshCw, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { projectText, type Locale } from './project-locale';

type IdentityCardData = {
  tenant_id: string;
  full_name: string;
  employee_number: string;
  designation_title: string | null;
  department_name: string | null;
  employment_status: string;
};

function tx(locale: Locale, source: string) {
  return projectText(locale, source);
}

function employmentStatusLabel(status: string, locale: Locale) {
  const words = status.trim().replaceAll('_', ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return tx(locale, 'Not provided');
  const title = words.map(word => `${word.slice(0, 1).toLocaleUpperCase()}${word.slice(1).toLocaleLowerCase()}`).join(' ');
  return tx(locale, title);
}

export function EmployeeIdentityCard({ tenantId, tenantName, locale }: {
  tenantId: string;
  tenantName: string;
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const [identity, setIdentity] = useState<IdentityCardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const requestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  activeTenantId.current = tenantId;

  useEffect(() => {
    if (!open) return;
    const requestId = ++requestSequence.current;
    const requestedTenant = tenantId;
    const isCurrent = () => requestId === requestSequence.current && activeTenantId.current === requestedTenant;
    setIdentity(null);
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const result = await supabase.rpc('hris_get_my_employee_identity_card', { p_tenant_id: requestedTenant });
        if (!isCurrent()) return;
        if (result.error) throw result.error;
        const value = result.data as IdentityCardData | null;
        if (!value || value.tenant_id !== requestedTenant || typeof value.full_name !== 'string'
            || typeof value.employee_number !== 'string' || typeof value.employment_status !== 'string') {
          throw new Error('Identity service returned an invalid response.');
        }
        setIdentity(value);
      } catch {
        if (isCurrent()) setError(tx(locale, 'Unable to load your employee ID card.'));
      } finally {
        if (isCurrent()) setLoading(false);
      }
    })();
    return () => { requestSequence.current += 1; };
  }, [open, tenantId, revision, locale]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) || []);
    focusable()[0]?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { setOpen(false); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault(); items.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
        event.preventDefault(); items[0]?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
    };
  }, [open]);

  const close = () => setOpen(false);
  const field = (label: string, value: string | null) => <div className="min-w-0">
    <dt className="text-xs font-medium text-slate-500">{tx(locale, label)}</dt>
    <dd className="mt-1 break-words text-sm font-medium text-[#1E1B39]">{value?.trim() || tx(locale, 'Not provided')}</dd>
  </div>;

  return <>
    <button ref={triggerRef} type="button" onClick={() => setOpen(true)}
      className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#08558B] bg-white px-3 text-sm font-medium text-[#08558B] hover:bg-[#EFF7F8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#08558B]">
      <IdCard className="h-4 w-4" aria-hidden="true" />{tx(locale, 'View digital employee ID')}
    </button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-3 sm:p-6"
      role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="employee-id-card-heading"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div><h3 id="employee-id-card-heading" className="text-lg font-semibold text-[#1E1B39]">{tx(locale, 'Digital employee ID')}</h3>
            <p className="mt-1 break-words text-sm text-slate-600">{tenantName}</p></div>
          <button type="button" aria-label={tx(locale, 'Close employee ID card')} onClick={close}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="p-5">
          {loading && <p role="status" className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">{tx(locale, 'Loading your employee ID card…')}</p>}
          {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            <span>{error}</span><button type="button" onClick={() => setRevision(value => value + 1)}
              className="min-h-10 rounded-md border border-rose-300 bg-white px-3 font-medium">{tx(locale, 'Retry')}</button>
          </div>}
          {identity && <article data-employee-id-card data-employment-status={identity.employment_status} className="overflow-hidden rounded-xl border border-[#C6DDE5] bg-[#F1F8FA]">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#C6DDE5] bg-white px-4 py-4">
              <div className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#DCEFF4] text-[#08558B]">
                <IdCard className="h-6 w-6" /></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[#615E83]">{tx(locale, 'Employee ID')}</p>
                <p className="break-all text-lg font-semibold text-[#1E1B39]">{identity.employee_number}</p></div></div>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${identity.employment_status.toLowerCase() === 'active' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                <BadgeCheck className="h-4 w-4" aria-hidden="true" />{employmentStatusLabel(identity.employment_status, locale)}
              </span>
            </header>
            <div className="p-4 sm:p-5"><h4 className="break-words text-xl font-semibold text-[#08263D]">{identity.full_name}</h4>
              <dl className="mt-4 grid grid-cols-1 gap-4 border-t border-[#C6DDE5] pt-4 sm:grid-cols-2">
                <div className="flex min-w-0 items-start gap-2"><BriefcaseBusiness className="mt-0.5 h-4 w-4 shrink-0 text-[#08558B]" aria-hidden="true" />{field('Designation', identity.designation_title)}</div>
                <div className="flex min-w-0 items-start gap-2"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[#08558B]" aria-hidden="true" />{field('Department', identity.department_name)}</div>
              </dl>
            </div>
          </article>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm disabled:opacity-50">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />{tx(locale, 'Refresh card')}
          </button>
          <button type="button" onClick={close} className="min-h-11 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white">{tx(locale, 'Close')}</button>
        </div>
      </div>
    </div>}
  </>;
}

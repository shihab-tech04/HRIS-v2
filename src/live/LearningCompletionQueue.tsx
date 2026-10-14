import { useEffect, useRef, useState } from 'react';
import { Check, Clock3, ExternalLink, FileText, RefreshCw, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Locale } from './project-locale';
import { learningText } from './learning-locale';

type CompletionItem = {
  id: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;
  program_id: string;
  program_title: string;
  session_id: string | null;
  submitted_at: string | null;
  evidence_path: string | null;
  evidence_name: string | null;
};
type Decision = 'verified' | 'returned_for_correction';

function dateTime(value: string | null, locale: Locale, tx: (english: string) => string): string {
  if (!value) return tx('Time to be confirmed');
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? tx('Time to be confirmed') : parsed.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function LearningCompletionQueue({ tenantId, locale }: { tenantId: string; locale: Locale }) {
  const tx = (english: string, values: Record<string, string | number> = {}) => learningText(locale, english, values);
  const [items, setItems] = useState<CompletionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<{ item: CompletionItem; decision: Decision } | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [evidenceUrls, setEvidenceUrls] = useState<Record<string, string>>({});
  const [evidenceLoading, setEvidenceLoading] = useState('');
  const [evidenceError, setEvidenceError] = useState('');
  const requestSequence = useRef(0);
  const activeTenantId = useRef(tenantId);
  activeTenantId.current = tenantId;

  async function load() {
    const requestId = ++requestSequence.current;
    const requestedTenant = tenantId;
    const current = () => requestId === requestSequence.current && activeTenantId.current === requestedTenant;
    setLoading(true);
    setError('');
    try {
      const result = await supabase.rpc('hris_get_learning_completion_queue', { p_tenant_id: requestedTenant });
      if (!current()) return;
      if (result.error) throw result.error;
      if (!Array.isArray(result.data) || result.data.some(row => !row || typeof row.id !== 'string'
          || typeof row.employee_name !== 'string' || typeof row.program_title !== 'string')) {
        throw new Error(tx('Learning completion queue returned an invalid response.'));
      }
      setItems(result.data as CompletionItem[]);
      setEvidenceUrls({});
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? tx(cause.message) : tx('Unable to load learning completions.'));
    } finally {
      if (current()) setLoading(false);
    }
  }

  useEffect(() => {
    setItems([]);
    setTarget(null);
    setReason('');
    setActionError('');
    setMessage('');
    setEvidenceUrls({});
    void load();
    return () => { requestSequence.current += 1; };
    // Revision is the explicit recovery after a decision or user refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, revision]);

  async function prepareEvidence(item: CompletionItem) {
    if (!item.evidence_path || evidenceLoading) return;
    setEvidenceLoading(item.id);
    setEvidenceError('');
    try {
      const result = await supabase.storage.from('learning-completion-evidence').createSignedUrl(item.evidence_path, 300);
      if (result.error || !result.data?.signedUrl) throw result.error || new Error(tx('Evidence could not be opened. Refresh and try again.'));
      setEvidenceUrls(current => ({ ...current, [item.id]: result.data.signedUrl }));
    } catch (cause) {
      setEvidenceError(cause instanceof Error ? tx(cause.message) : tx('Evidence could not be opened. Refresh and try again.'));
    } finally {
      setEvidenceLoading('');
    }
  }

  function openDecision(item: CompletionItem, decision: Decision) {
    setMessage('');
    setActionError('');
    setReason('');
    setTarget({ item, decision });
  }

  async function resolve() {
    if (!target || saving) return;
    if (target.decision === 'returned_for_correction' && !reason.trim()) {
      setActionError(tx('Provide a reason before returning this completion.'));
      return;
    }
    setSaving(true);
    setActionError('');
    try {
      const result = await supabase.rpc('hris_resolve_learning_completion', {
        p_tenant_id: tenantId,
        p_enrollment_id: target.item.id,
        p_decision: target.decision,
        p_reason: reason.trim() || null,
      });
      if (result.error) throw result.error;
      const expectedStatus = target.decision === 'verified' ? 'completed' : 'returned_for_correction';
      if (!result.data || result.data.id !== target.item.id || result.data.status !== expectedStatus) {
        throw new Error(tx('The learning decision could not be verified. Refresh the queue before retrying.'));
      }
      setMessage(target.decision === 'verified'
        ? tx('{employee}’s completion of {program} is verified.', { employee: target.item.employee_name, program: target.item.program_title })
        : tx('{employee}’s completion was returned for correction.', { employee: target.item.employee_name }));
      setTarget(null);
      setReason('');
      setRevision(value => value + 1);
    } catch (cause) {
      const code = (cause as { code?: string })?.code;
      setActionError(code === 'P0002'
        ? tx('This completion is no longer pending verification. Refresh the queue.')
        : cause instanceof Error ? tx(cause.message) : tx('The learning decision could not be saved.'));
    } finally {
      setSaving(false);
    }
  }

  return <section aria-labelledby="learning-completion-heading" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><h2 id="learning-completion-heading" className="text-2xl font-medium text-[#49454F]">{tx('Learning completion review')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{tx('Verify employee-submitted learning or return it with a reason. Only verified work is recorded as completed.')}</p></div>
      <button type="button" aria-label={tx('Refresh completion queue')} onClick={() => { setMessage(''); setRevision(value => value + 1); }} disabled={loading}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />{tx('Refresh')}</button>
    </div>

    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p role="alert">{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">{tx('Retry')}</button></div>}
    {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
    {actionError && !target && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{actionError}</p>}

    <div className="grid gap-3 sm:grid-cols-2">
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">{tx('Pending verification')}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{items.length}</p></article>
      <article className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><Clock3 className="h-6 w-6 shrink-0 text-[#08558B]" aria-hidden="true" /><p className="text-sm text-slate-600">{tx('Employees can continue their work while feedback is pending.')}</p></article>
    </div>

    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{tx('Loading learning completions…')}</p>
      : items.length === 0 ? <div role="status" className="rounded-xl border border-dashed border-[#B9DCE2] bg-white p-6 text-center"><Check className="mx-auto h-7 w-7 text-emerald-700" aria-hidden="true" /><h3 className="mt-2 font-semibold text-slate-800">{tx('No completions waiting')}</h3><p className="mt-1 text-sm text-slate-600">{tx('Employee submissions will appear here for review.')}</p></div>
        : <div className="grid min-w-0 gap-3 xl:grid-cols-2">{items.map(item => <article key={item.id} data-learning-completion={item.id} className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-[#615E83]">{item.employee_number || tx('Employee')} · {tx('Submitted {date}', { date: dateTime(item.submitted_at, locale, tx) })}</p><h3 className="mt-1 break-words text-lg font-semibold text-[#1E1B39]">{item.program_title}</h3><p className="mt-1 text-sm font-medium text-slate-800">{item.employee_name}</p></div><span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{tx('Pending verification')}</span></div>
          {item.evidence_name ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3"><span className="inline-flex min-w-0 items-center gap-2 break-all text-sm text-slate-700"><FileText className="h-4 w-4 shrink-0" aria-hidden="true" />{item.evidence_name}</span>{evidenceUrls[item.id] ? <a href={evidenceUrls[item.id]} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-[#08558B]"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />{tx('Open evidence')}</a> : <button type="button" disabled={Boolean(evidenceLoading)} onClick={() => void prepareEvidence(item)} className="min-h-9 shrink-0 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-[#08558B] disabled:opacity-50">{evidenceLoading === item.id ? tx('Opening…') : tx('View evidence')}</button>}</div>
            : <p className="mt-3 text-sm text-slate-500">{tx('No supporting evidence was submitted.')}</p>}
          {evidenceError && <p role="alert" className="mt-2 text-sm text-rose-800">{evidenceError}</p>}
          <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" disabled={saving} onClick={() => openDecision(item, 'returned_for_correction')} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 disabled:opacity-50"><RotateCcw className="h-4 w-4" aria-hidden="true" />{tx('Return for correction')}</button><button type="button" disabled={saving} onClick={() => openDecision(item, 'verified')} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white hover:bg-[#06466F] disabled:opacity-50"><Check className="h-4 w-4" aria-hidden="true" />{tx('Verify')}</button></div>
        </article>)}</div>}

    {target && <div role="alertdialog" aria-modal="true" aria-labelledby="learning-completion-decision-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" onMouseDown={event => { if (!saving && event.target === event.currentTarget) setTarget(null); }}>
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"><h3 id="learning-completion-decision-title" className="text-lg font-semibold text-slate-900">{tx(target.decision === 'verified' ? 'Verify learning completion?' : 'Return learning for correction?')}</h3><p className="mt-2 break-words text-sm text-slate-600">{target.item.employee_name} · {target.item.program_title}</p>
        <label htmlFor="learning-completion-reason" className="mt-4 block text-sm font-medium text-slate-700">{tx(target.decision === 'verified' ? 'Verification note' : 'Reason for correction')}{target.decision === 'returned_for_correction' && <span className="ml-1 text-rose-700">*</span>}<span className="ml-1 font-normal text-slate-500">{tx(target.decision === 'verified' ? '(optional)' : '(required)')}</span><textarea id="learning-completion-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} rows={3} disabled={saving} required={target.decision === 'returned_for_correction'} className="mt-1 min-h-24 w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-sm" placeholder={tx(target.decision === 'verified' ? 'Add an optional verification note.' : 'Explain what the employee should correct.')} /></label>
        {actionError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{actionError}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={() => { setTarget(null); setActionError(''); }} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium disabled:opacity-50">{tx('Cancel')}</button><button type="button" disabled={saving || (target.decision === 'returned_for_correction' && !reason.trim())} onClick={() => void resolve()} className="min-h-11 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50">{saving ? tx('Saving…') : tx(target.decision === 'verified' ? 'Confirm verification' : 'Confirm return')}</button></div>
      </div>
    </div>}
  </section>;
}

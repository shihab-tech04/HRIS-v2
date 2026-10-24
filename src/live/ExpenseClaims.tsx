import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { FileText, Paperclip, Receipt, RefreshCw, Send, Trash2, Upload, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

type ExpenseCategory = { id: string; name: string };
type ExpenseReceipt = {
  id: string; file_name: string; mime_type: string; file_size: number;
  storage_path: string; created_at: string;
};
type ExpenseHistory = {
  previous_status: string | null; new_status: string; note: string | null; created_at: string;
};
type ExpenseClaim = {
  id: string; employee_id?: string; employee_name?: string; employee_number?: string;
  description: string; category_id: string | null; category: string | null; claim_date: string | null;
  amount: number | null; currency: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid' | 'cancelled';
  created_at: string; updated_at?: string; submitted_at: string | null; reviewed_at?: string | null;
  review_note: string | null; reopened_at?: string | null;
  receipts?: ExpenseReceipt[]; history?: ExpenseHistory[];
};
type ExpenseDraft = {
  id: string | null; description: string; categoryId: string; claimDate: string; amount: string; currency: string;
};
type Context = { employee_id?: string; categories?: ExpenseCategory[]; claims?: ExpenseClaim[] };

const emptyDraft = (): ExpenseDraft => ({ id: null, description: '', categoryId: '', claimDate: '', amount: '', currency: 'BDT' });
const allowedMime = new Set(['application/pdf', 'image/jpeg', 'image/png']);

function statusName(value: string) {
  return value === 'rejected' ? 'Returned for changes' : value.charAt(0).toUpperCase() + value.slice(1);
}
function displayDate(value: string | null | undefined) {
  if (!value) return 'Date not set';
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function displayTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function bytes(value: number) {
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
}
function errorMessage(cause: unknown, fallback: string) {
  if (cause instanceof Error && cause.message) return cause.message;
  if (cause && typeof cause === 'object' && 'message' in cause
      && typeof cause.message === 'string' && cause.message) return cause.message;
  return fallback;
}

export function ExpenseClaims({
  tenantId, userId, mode, canManage = false,
}: { tenantId: string; userId: string; mode: 'personal' | 'queue'; canManage?: boolean }) {
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [draft, setDraft] = useState<ExpenseDraft>(emptyDraft);
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadingId, setUploadingId] = useState('');
  const [removingId, setRemovingId] = useState('');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);
  const activeTenant = useRef(tenantId);
  activeTenant.current = tenantId;
  const isPersonal = mode === 'personal';

  const load = useCallback(async () => {
    const requestId = ++sequence.current;
    const requestedTenant = tenantId;
    const current = () => requestId === sequence.current && activeTenant.current === requestedTenant;
    setLoading(true); setError('');
    try {
      const result = isPersonal
        ? await supabase.rpc('hris_get_my_expense_context', { p_tenant_id: requestedTenant })
        : await supabase.rpc('hris_get_tenant_expense_claims', { p_tenant_id: requestedTenant });
      if (!current()) return;
      if (result.error) throw result.error;
      if (isPersonal) {
        const context = result.data as Context | null;
        if (!context || typeof context.employee_id !== 'string' || !Array.isArray(context.claims) || !Array.isArray(context.categories)) {
          throw new Error('Your expense claims returned an invalid response.');
        }
        setClaims(context.claims); setCategories(context.categories);
      } else {
        if (!Array.isArray(result.data)) throw new Error('The expense review queue returned an invalid response.');
        setClaims(result.data as ExpenseClaim[]);
      }
    } catch (cause) {
      if (current()) setError(errorMessage(cause, 'Unable to load expense claims.'));
    } finally { if (current()) setLoading(false); }
  }, [tenantId, isPersonal]);

  useEffect(() => {
    setClaims([]); setCategories([]); setMessage(''); setActionError('');
    void load();
    return () => { sequence.current += 1; };
  }, [load, revision]);

  useEffect(() => {
    if (!editorOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) closeEditor(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [editorOpen, busy]);

  function closeEditor() {
    if (busy) return;
    setEditorOpen(false); setDraft(emptyDraft()); setActionError('');
  }
  function startDraft(claim?: ExpenseClaim) {
    setActionError(''); setMessage('');
    setDraft(claim ? {
      id: claim.id, description: claim.description || '', categoryId: claim.category_id || '',
      claimDate: claim.claim_date || '', amount: claim.amount === null ? '' : String(claim.amount),
      currency: claim.currency || 'BDT',
    } : emptyDraft());
    setEditorOpen(true);
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const description = draft.description.trim();
    const amountText = draft.amount.trim();
    const currency = draft.currency.trim().toUpperCase();
    const amount = amountText ? Number(amountText) : null;
    if (!description || description.length > 2000) { setActionError('Enter a description of up to 2,000 characters.'); return; }
    if ((amountText && !draft.currency.trim()) || (!amountText && draft.currency.trim() && currency !== 'BDT')) {
      setActionError('Enter both an amount and currency, or leave the amount blank.'); return;
    }
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100 || !/^[A-Z]{3}$/.test(currency))) {
      setActionError('Enter a positive amount with up to two decimal places and a three-letter currency code.'); return;
    }
    setBusy(true); setActionError(''); setMessage('');
    try {
      const result = await supabase.rpc('hris_save_my_expense_draft', {
        p_tenant_id: tenantId, p_id: draft.id, p_description: description,
        p_category_id: draft.categoryId || null, p_claim_date: draft.claimDate || null,
        p_amount: amount, p_currency: amount === null ? null : currency,
      });
      if (result.error) throw result.error;
      if (typeof result.data !== 'string' || !result.data) throw new Error('The draft save was not confirmed. Refresh and check your expense claims.');
      setEditorOpen(false); setDraft(emptyDraft()); setMessage('Expense claim draft saved. Add a receipt before submission if one is available.');
      setRevision(value => value + 1);
    } catch (cause) {
      setActionError(errorMessage(cause, 'Unable to save this expense draft.'));
    } finally { setBusy(false); }
  }

  async function submitClaim(claim: ExpenseClaim) {
    if (busy) return;
    setBusy(true); setActionError(''); setMessage('');
    try {
      const result = await supabase.rpc('hris_submit_my_expense_claim', { p_tenant_id: tenantId, p_id: claim.id });
      if (result.error) throw result.error;
      if (result.data !== claim.id) throw new Error('Submission was not confirmed. Refresh and check the claim status.');
      setMessage('Expense claim submitted for review.'); setRevision(value => value + 1);
    } catch (cause) { setActionError(errorMessage(cause, 'Unable to submit this expense claim.')); }
    finally { setBusy(false); }
  }

  async function reopenClaim(claim: ExpenseClaim) {
    if (busy) return;
    setBusy(true); setActionError(''); setMessage('');
    try {
      const result = await supabase.rpc('hris_reopen_my_expense_claim', { p_tenant_id: tenantId, p_id: claim.id });
      if (result.error) throw result.error;
      if (result.data !== claim.id) throw new Error('Reopening was not confirmed. Refresh and check the claim status.');
      setMessage('Returned claim reopened as a draft. You can revise it and submit again.'); setRevision(value => value + 1);
    } catch (cause) { setActionError(errorMessage(cause, 'Unable to reopen this expense claim.')); }
    finally { setBusy(false); }
  }

  async function uploadReceipt(claim: ExpenseClaim, file: File | undefined) {
    if (!file || busy || uploadingId) return;
    if (!allowedMime.has(file.type)) { setActionError('Receipts must be PDF, JPEG, or PNG files.'); return; }
    if (file.size < 1 || file.size > 10 * 1024 * 1024) { setActionError('Choose a receipt between 1 byte and 10 MiB.'); return; }
    const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/jpeg' ? 'jpg' : 'png';
    const objectPath = `${userId}/${claim.id}/${crypto.randomUUID()}.${extension}`;
    setUploadingId(claim.id); setActionError(''); setMessage('');
    let objectUploaded = false;
    try {
      const uploaded = await supabase.storage.from('expense-receipts').upload(objectPath, file, { contentType: file.type, upsert: false });
      if (uploaded.error) throw uploaded.error;
      objectUploaded = true;
      const inserted = await supabase.from('expense_claim_receipts').insert({
        tenant_id: tenantId, claim_id: claim.id, employee_id: claim.employee_id,
        storage_path: objectPath, file_name: file.name.slice(0, 255), mime_type: file.type, file_size: file.size,
      });
      if (inserted.error) throw inserted.error;
      setMessage(`Receipt “${file.name}” attached.`); setRevision(value => value + 1);
    } catch (cause) {
      if (objectUploaded) await supabase.storage.from('expense-receipts').remove([objectPath]);
      setActionError(errorMessage(cause, 'Unable to attach this receipt.'));
    } finally { setUploadingId(''); }
  }

  async function removeReceipt(claim: ExpenseClaim, receipt: ExpenseReceipt) {
    if (busy || removingId) return;
    setRemovingId(receipt.id); setActionError(''); setMessage('');
    try {
      const removedMetadata = await supabase.from('expense_claim_receipts').delete().eq('id', receipt.id).eq('tenant_id', tenantId).select('id');
      if (removedMetadata.error || !removedMetadata.data?.length) {
        throw removedMetadata.error || new Error('Receipt removal was not confirmed.');
      }
      const removedObject = await supabase.storage.from('expense-receipts').remove([receipt.storage_path]);
      if (removedObject.error) {
        const restored = await supabase.from('expense_claim_receipts').insert({
          id: receipt.id, tenant_id: tenantId, claim_id: claim.id, employee_id: claim.employee_id,
          storage_path: receipt.storage_path, file_name: receipt.file_name,
          mime_type: receipt.mime_type, file_size: receipt.file_size,
        });
        if (restored.error) throw new Error('The receipt file could not be removed and its record could not be restored. Contact support.');
        throw removedObject.error;
      }
      setMessage(`Receipt “${receipt.file_name}” removed.`); setRevision(value => value + 1);
    } catch (cause) { setActionError(errorMessage(cause, 'Unable to remove this receipt.')); }
    finally { setRemovingId(''); }
  }

  async function openReceipt(receipt: ExpenseReceipt) {
    setActionError('');
    const result = await supabase.storage.from('expense-receipts').createSignedUrl(receipt.storage_path, 60);
    if (result.error) { setActionError(result.error.message); return; }
    window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  const pendingCount = claims.filter(claim => claim.status === 'submitted').length;
  const draftCount = claims.filter(claim => claim.status === 'draft').length;
  const heading = isPersonal ? 'My Expense Claims' : 'Expense Claims';

  return <section aria-labelledby="expense-claims-heading" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="expense-claims-heading" className="text-2xl font-medium text-[#49454F]">{heading}</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{isPersonal
        ? 'Record a business expense, attach its receipt, and track the claim through review.'
          : 'Submitted claims in this organization. Approval actions remain unavailable until the review sequence is confirmed.'}</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" aria-label={`Refresh ${heading.toLowerCase()}`} onClick={() => setRevision(value => value + 1)} disabled={loading || busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true"/>Refresh</button>
        {isPersonal && <button type="button" onClick={() => startDraft()} disabled={loading || busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white shadow-[0_3px_0_#02395c] disabled:opacity-50"><Receipt className="h-4 w-4" aria-hidden="true"/>New expense claim</button>}
      </div>
    </div>

    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p role="alert">{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">Retry</button></div>}
    {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
    {actionError && !editorOpen && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{actionError}</p>}

    {isPersonal && <div className="grid gap-3 sm:grid-cols-3">
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">Claims</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{claims.length}</p></article>
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">Awaiting review</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{pendingCount}</p></article>
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">Drafts</p><p className="mt-2 text-2xl font-semibold tabular-nums text-[#08263D]">{draftCount}</p></article>
    </div>}

    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading expense claims…</p>
      : !claims.length ? <div role="status" className="rounded-xl border border-dashed border-[#B9DCE2] bg-white p-6 text-center"><Receipt className="mx-auto h-7 w-7 text-[#08558B]" aria-hidden="true"/><h3 className="mt-2 font-semibold text-slate-800">{isPersonal ? 'No expense claims yet' : 'No submitted expense claims'}</h3><p className="mt-1 text-sm text-slate-600">{isPersonal ? 'Create a draft when you need to report a business expense.' : 'Submitted claims for this organization will appear here.'}</p></div>
      : <div className="grid min-w-0 gap-3 xl:grid-cols-2">{claims.map(claim => <article key={claim.id} data-expense-claim={claim.id} className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wide text-[#615E83]">{claim.id.slice(0, 8)}</p><h3 className="mt-1 break-words text-lg font-semibold text-[#1E1B39]">{claim.description}</h3>{!isPersonal && <p className="mt-1 text-sm text-slate-600">{claim.employee_name || claim.employee_number || 'Employee'}</p>}</div><span className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-medium ${claim.status === 'submitted' ? 'bg-amber-50 text-amber-800' : claim.status === 'approved' || claim.status === 'paid' ? 'bg-emerald-50 text-emerald-800' : claim.status === 'rejected' ? 'bg-rose-50 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>{statusName(claim.status)}</span></div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Category</dt><dd className="mt-0.5 text-slate-800">{claim.category || 'Not selected'}</dd></div><div><dt className="text-xs text-slate-500">Expense date</dt><dd className="mt-0.5 text-slate-800">{displayDate(claim.claim_date)}</dd></div><div><dt className="text-xs text-slate-500">Amount</dt><dd className="mt-0.5 text-slate-800">{claim.amount === null ? 'Not entered' : `${Number(claim.amount).toLocaleString()} ${claim.currency || ''}`}</dd></div><div><dt className="text-xs text-slate-500">Submitted</dt><dd className="mt-0.5 text-slate-800">{claim.submitted_at ? displayTime(claim.submitted_at) : 'Not submitted'}</dd></div></dl>
        {claim.review_note && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><span className="font-medium">Reviewer note:</span> {claim.review_note}</p>}
        {isPersonal && <div className="mt-3 rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800"><Paperclip className="h-4 w-4" aria-hidden="true"/>Receipts</h4>{claim.status === 'draft' && <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50"><Upload className="h-4 w-4" aria-hidden="true"/>{uploadingId === claim.id ? 'Uploading…' : 'Attach receipt'}<input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" disabled={Boolean(uploadingId)} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void uploadReceipt(claim, file); }}/></label>}</div>
          {!claim.receipts?.length ? <p className="mt-2 text-sm text-slate-500">No receipt attached.</p> : <ul className="mt-2 divide-y divide-slate-100">{claim.receipts.map(receipt => <li key={receipt.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><button type="button" onClick={() => void openReceipt(receipt)} className="inline-flex min-w-0 items-center gap-2 text-left text-sm text-[#08558B] underline-offset-2 hover:underline"><FileText className="h-4 w-4 shrink-0" aria-hidden="true"/><span className="break-all">{receipt.file_name}</span><span className="shrink-0 text-xs text-slate-500">{bytes(Number(receipt.file_size))}</span></button>{claim.status === 'draft' && <button type="button" aria-label={`Remove ${receipt.file_name}`} disabled={Boolean(removingId)} onClick={() => void removeReceipt(claim, receipt)} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-4 w-4" aria-hidden="true"/>{removingId === receipt.id ? 'Removing…' : 'Remove'}</button>}</li>)}</ul>}
        </div>}
        {isPersonal && claim.history?.length ? <details className="mt-3 text-sm"><summary className="min-h-10 cursor-pointer py-2 font-medium text-[#08558B]">Claim history</summary><ol className="space-y-2 border-l border-slate-200 pl-3">{claim.history.map((item, index) => <li key={`${item.created_at}-${index}`}><p className="font-medium text-slate-700">{item.previous_status ? `${statusName(item.previous_status)} → ` : ''}{statusName(item.new_status)}</p><p className="text-xs text-slate-500">{displayTime(item.created_at)}</p>{item.note && <p className="mt-1 break-words text-xs text-slate-600">{item.note}</p>}</li>)}</ol></details> : null}
        {isPersonal && (claim.status === 'draft' || claim.status === 'rejected') && <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">{claim.status === 'rejected' ? <button type="button" disabled={busy} onClick={() => void reopenClaim(claim)} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-medium disabled:opacity-50">Reopen to revise</button> : <button type="button" disabled={busy} onClick={() => startDraft(claim)} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-medium disabled:opacity-50">Edit draft</button>}<button type="button" disabled={busy || uploadingId === claim.id} onClick={() => void submitClaim(claim)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50"><Send className="h-4 w-4" aria-hidden="true"/>{busy ? 'Submitting…' : 'Submit for review'}</button></div>}
      </article>)}</div>}

    {editorOpen && <div role="dialog" aria-modal="true" aria-labelledby="expense-editor-heading" className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/40 p-3 sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) closeEditor(); }}>
      <form onSubmit={saveDraft} className="my-auto w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 sm:p-5"><div><h3 id="expense-editor-heading" className="text-lg font-semibold text-slate-900">{draft.id ? 'Edit expense draft' : 'New expense claim'}</h3><p className="mt-1 text-sm text-slate-600">Save an incomplete draft and add receipts before submitting.</p></div><button type="button" aria-label="Close expense editor" onClick={closeEditor} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300" disabled={busy}><X className="h-4 w-4" aria-hidden="true"/></button></header>
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5"><label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium text-slate-700">Description <span className="text-rose-700">*</span></span><textarea required maxLength={2000} rows={3} value={draft.description} onChange={event => setDraft(value => ({ ...value, description: event.target.value }))} className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="What was purchased or paid for?"/></label>
          <label><span className="mb-1 block text-sm font-medium text-slate-700">Category</span><select value={draft.categoryId} onChange={event => setDraft(value => ({ ...value, categoryId: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Choose category</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label><span className="mb-1 block text-sm font-medium text-slate-700">Expense date</span><input type="date" value={draft.claimDate} onChange={event => setDraft(value => ({ ...value, claimDate: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"/></label>
          <label><span className="mb-1 block text-sm font-medium text-slate-700">Amount</span><input inputMode="decimal" type="number" min="0.01" step="0.01" value={draft.amount} onChange={event => setDraft(value => ({ ...value, amount: event.target.value }))} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" placeholder="Optional in a draft"/></label>
          <label><span className="mb-1 block text-sm font-medium text-slate-700">Currency</span><input maxLength={3} value={draft.currency} onChange={event => setDraft(value => ({ ...value, currency: event.target.value.toUpperCase() }))} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm uppercase" placeholder="BDT"/></label>
          {actionError && <p role="alert" className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{actionError}</p>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 p-4 sm:p-5"><button type="button" onClick={closeEditor} disabled={busy} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium disabled:opacity-50">Cancel</button><button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-[#08558B] px-4 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save draft'}</button></footer>
      </form>
    </div>}
    {!isPersonal && !canManage && <p className="text-xs text-slate-500">Read access only. You cannot approve or change submitted claims.</p>}
  </section>;
}

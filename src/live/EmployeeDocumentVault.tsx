import { useEffect, useRef, useState } from 'react';
import { Download, FileText, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { projectText, type Locale } from './project-locale';

type EmployeeDocument = {
  id: string;
  name: string;
  document_type: string | null;
  uploaded_at: string | null;
  expires_at: string | null;
  verification_status: string | null;
  verification_note: string | null;
  file_url: string | null;
};
type DocumentContext = { tenant_id: string; employee_id: string; documents: EmployeeDocument[] };

function tx(locale: Locale, value: string) {
  return projectText(locale, value);
}

function displayDate(value: string | null, locale: Locale) {
  if (!value) return tx(locale, 'Not provided');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.valueOf())) return tx(locale, 'Not provided');
  return date.toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function statusLabel(status: string | null, locale: Locale) {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'verified') return tx(locale, 'Verified');
  if (normalized === 'rejected') return tx(locale, 'Correction required');
  if (normalized === 'pending') return tx(locale, 'Pending verification');
  return status?.trim() || tx(locale, 'Status not provided');
}

function ownerDocumentPath(value: string | null, userId: string): string | null {
  if (!value?.trim() || !userId) return null;
  let path = value.trim();
  if (/^https?:\/\//i.test(path)) {
    let parsed: URL;
    let configured: URL;
    try {
      parsed = new URL(path);
      configured = new URL(import.meta.env.VITE_SUPABASE_URL);
    } catch { return null; }
    if (parsed.origin !== configured.origin) return null;
    const parts = parsed.pathname.split('/').filter(Boolean).map(part => {
      try { return decodeURIComponent(part); } catch { return ''; }
    });
    const marker = parts.findIndex((part, index) => part === 'object'
      && ['authenticated', 'sign', 'public'].includes(parts[index + 1] || '')
      && parts[index + 2] === 'employee-documents');
    if (marker < 0) return null;
    path = parts.slice(marker + 3).join('/');
  } else {
    path = path.replace(/^\/+/, '');
    if (path.startsWith('employee-documents/')) path = path.slice('employee-documents/'.length);
    try { path = path.split('/').map(part => decodeURIComponent(part)).join('/'); }
    catch { return null; }
  }
  const parts = path.split('/');
  if (parts.length < 2 || parts.some(part => !part || part === '.' || part === '..' || part.includes('\\'))
      || parts[0] !== userId) return null;
  return parts.join('/');
}

function safeDownloadName(name: string, id: string, objectPath: string) {
  const value = name.normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim();
  const safeBase = value || `employee-document-${id.slice(0, 8)}`;
  const extension = objectPath.split('/').at(-1)?.match(/\.[a-z0-9]{1,10}$/i)?.[0] || '';
  return /\.[a-z0-9]{1,10}$/i.test(safeBase) ? safeBase : `${safeBase}${extension}`;
}

export function EmployeeDocumentVault({ tenantId, userId, locale }: {
  tenantId: string;
  userId: string;
  locale: Locale;
}) {
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloaded, setDownloaded] = useState('');
  const [downloadingId, setDownloadingId] = useState('');
  const [revision, setRevision] = useState(0);
  const requestSequence = useRef(0);
  const activeContext = useRef(`${tenantId}:${userId}`);
  activeContext.current = `${tenantId}:${userId}`;

  useEffect(() => {
    const requestId = ++requestSequence.current;
    const requestedTenant = tenantId;
    const requestedContext = `${tenantId}:${userId}`;
    const current = () => requestId === requestSequence.current && activeContext.current === requestedContext;
    setDocuments([]);
    setLoading(true);
    setError('');
    setDownloadError('');
    setDownloaded('');
    void (async () => {
      try {
        const result = await supabase.rpc('hris_get_my_employee_documents', { p_tenant_id: requestedTenant });
        if (!current()) return;
        if (result.error) throw result.error;
        const data = result.data as DocumentContext | null;
        if (!data || data.tenant_id !== requestedTenant || !Array.isArray(data.documents)
            || data.documents.some(row => !row || typeof row.id !== 'string' || typeof row.name !== 'string')) {
          throw new Error('Employee documents returned an invalid response.');
        }
        setDocuments(data.documents);
      } catch {
        if (current()) setError(tx(locale, 'Unable to load your documents.'));
      } finally {
        if (current()) setLoading(false);
      }
    })();
    return () => { requestSequence.current += 1; };
  }, [tenantId, userId, revision, locale]);

  async function downloadDocument(document: EmployeeDocument) {
    if (downloadingId) return;
    const objectPath = ownerDocumentPath(document.file_url, userId);
    if (!objectPath) {
      setDownloadError(tx(locale, 'This document is not available to your account.'));
      return;
    }
    const actionContext = `${tenantId}:${userId}`;
    setDownloadingId(document.id);
    setDownloadError('');
    setDownloaded('');
    try {
      const result = await supabase.storage.from('employee-documents').download(objectPath);
      if (result.error) throw result.error;
      if (!result.data) throw new Error(tx(locale, 'The document file was not returned.'));
      if (activeContext.current !== actionContext) return;
      const url = URL.createObjectURL(result.data);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = safeDownloadName(document.name, document.id, objectPath);
      anchor.rel = 'noopener';
      anchor.style.display = 'none';
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setDownloaded(document.name);
    } catch {
      if (activeContext.current === actionContext) setDownloadError(tx(locale, 'Unable to download this document. Try again.'));
    } finally {
      if (activeContext.current === actionContext) setDownloadingId('');
    }
  }

  return <section aria-labelledby="employee-documents-heading" className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 id="employee-documents-heading" className="text-2xl font-medium text-[#49454F]">{tx(locale, 'My Documents')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{tx(locale, 'View documents stored against your employment record, their verification status, and expiry dates.')}</p>
      </div>
      <button type="button" aria-label={tx(locale, 'Refresh documents')} onClick={() => setRevision(value => value + 1)} disabled={loading}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium disabled:opacity-50">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />{tx(locale, 'Refresh')}
      </button>
    </div>

    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <ShieldCheck className="h-6 w-6 shrink-0 text-[#08558B]" aria-hidden="true" />
      <p className="text-sm text-slate-700">{tx(locale, 'Only documents available to your employee account are shown.')}</p>
    </div>
    {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <p role="alert">{error}</p><button type="button" onClick={() => setRevision(value => value + 1)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 font-medium">{tx(locale, 'Retry')}</button>
    </div>}
    {downloadError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{downloadError}</p>}
    {downloaded && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{tx(locale, 'Download started')}: {downloaded}</p>}
    {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">{tx(locale, 'Loading your documents…')}</p>
      : error ? null
        : documents.length === 0 ? <div role="status" className="rounded-xl border border-dashed border-[#B9DCE2] bg-white p-6 text-center">
          <FileText className="mx-auto h-7 w-7 text-[#08558B]" aria-hidden="true" /><h3 className="mt-2 font-semibold text-slate-800">{tx(locale, 'No documents are available yet')}</h3>
          <p className="mt-1 text-sm text-slate-600">{tx(locale, 'Documents stored for your employee record will appear here.')}</p>
        </div>
        : <div aria-label={tx(locale, 'Employee document history')} className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
          {documents.map(document => {
            const status = String(document.verification_status || '').toLowerCase();
            const badge = status === 'verified' ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : status === 'rejected' ? 'border-rose-200 bg-rose-50 text-rose-900'
                : 'border-amber-200 bg-amber-50 text-amber-900';
            return <article key={document.id} data-employee-document-id={document.id}
              className="min-w-0 rounded-xl border border-[#DEE0E3] bg-white p-4 shadow-sm sm:p-5">
              <div className="flex min-w-0 items-start gap-3">
                <span className="shrink-0 rounded-lg bg-slate-100 p-2.5 text-slate-700"><FileText className="h-5 w-5" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">{document.document_type || tx(locale, 'Employee document')}</p>
                  <h3 className="mt-0.5 break-words text-sm font-semibold text-slate-900">{document.name}</h3>
                  <dl className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600 sm:grid-cols-2">
                    <div><dt className="font-medium text-slate-500">{tx(locale, 'Uploaded')}</dt><dd>{displayDate(document.uploaded_at, locale)}</dd></div>
                    <div><dt className="font-medium text-slate-500">{tx(locale, 'Expires')}</dt><dd>{displayDate(document.expires_at, locale)}</dd></div>
                  </dl>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <span className={`inline-flex min-h-7 items-center rounded-md border px-2.5 text-xs font-medium ${badge}`}>{statusLabel(document.verification_status, locale)}</span>
                <button type="button" disabled={loading || Boolean(downloadingId)} onClick={() => void downloadDocument(document)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 disabled:opacity-50">
                  <Download className="h-4 w-4" aria-hidden="true" />{downloadingId === document.id ? tx(locale, 'Downloading…') : tx(locale, 'Download')}
                </button>
              </div>
              {status === 'rejected' && document.verification_note && <p className="mt-3 rounded-lg border border-rose-100 bg-rose-50 p-3 text-sm text-rose-900">{tx(locale, 'Correction reason')}: {document.verification_note}</p>}
            </article>;
          })}
        </div>}
  </section>;
}

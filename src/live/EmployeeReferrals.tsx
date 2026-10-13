import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, DragEvent } from 'react';
import { Download, ExternalLink, FileText, RefreshCw, Search, Upload, UserRoundPlus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

type ReferralJob = { id: string; reference_number: string; title: string; department_name?: string | null };
type ReferralDepartment = { id: string; name: string };
type EmployeeReferral = {
  id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string | null;
  relationship_note: string;
  candidate_profile_url: string | null;
  referral_reason: string | null;
  job_id: string | null;
  job_title: string | null;
  job_reference: string | null;
  preferred_department_id: string | null;
  preferred_department: string | null;
  resume_storage_path: string | null;
  resume_file_name: string | null;
  resume_content_type: string | null;
  resume_file_size: number | null;
  status: string;
  status_note: string | null;
  status_updated_by: string | null;
  submitted_at: string;
  updated_at: string;
  referrer_employee_id: string;
  referrer_name: string;
  referrer_employee_number: string;
  referrer_department: string | null;
  referrer_designation: string | null;
};
type ReferralWorkspace = {
  employee_id?: string | null;
  can_review: boolean;
  referrals: EmployeeReferral[];
  jobs: ReferralJob[];
  departments: ReferralDepartment[];
};

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const MAX_RESUME_BYTES = 5 * 1024 * 1024;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function rows<T>(value: unknown): T[] {
  return Array.isArray(value) ? value.filter(item => object(item) !== null) as T[] : [];
}

function referralWorkspace(value: unknown): ReferralWorkspace {
  const root = object(value);
  if (!root || !Array.isArray(root.referrals) || !Array.isArray(root.jobs) || !Array.isArray(root.departments)) {
    throw new Error('Referral service returned an invalid response.');
  }
  return {
    employee_id: typeof root.employee_id === 'string' ? root.employee_id : null,
    can_review: root.can_review === true,
    referrals: rows<EmployeeReferral>(root.referrals),
    jobs: rows<ReferralJob>(root.jobs),
    departments: rows<ReferralDepartment>(root.departments),
  };
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function formatSize(value: number | null): string {
  return value ? `${(value / 1024 / 1024).toFixed(2)} MB` : '—';
}

function safeFileName(value: string): string {
  return value.normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/^\.+/, '').slice(-180) || 'resume.pdf';
}

function ReferralForm({ tenantId, userId, jobs, departments, onClose, onSubmitted }: {
  tenantId: string;
  userId: string;
  jobs: ReferralJob[];
  departments: ReferralDepartment[];
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedPathRef = useRef<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [profileUrl, setProfileUrl] = useState('');
  const [jobId, setJobId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [reason, setReason] = useState('');
  const [resume, setResume] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function selectResume(file: File | undefined) {
    if (!file) return;
    const extension = file.name.split('.').at(-1)?.toLowerCase() || '';
    const expectedMime = MIME_BY_EXTENSION[extension];
    if (!expectedMime || (file.type && file.type !== expectedMime && file.type !== 'application/octet-stream')) {
      setError('Choose a PDF, DOC, or DOCX resume.');
      setResume(null);
      return;
    }
    if (file.size < 1 || file.size > MAX_RESUME_BYTES) {
      setError('The resume must be 5 MB or smaller.');
      setResume(null);
      return;
    }
    setError('');
    setResume(file);
  }

  async function closeForm() {
    const pendingPath = uploadedPathRef.current;
    if (pendingPath) {
      const result = await supabase.storage.from('employee-referral-files').remove([pendingPath]);
      if (result.error) {
        setError('The referral was not submitted. The uploaded file remains private; retry submission or contact HR support before closing.');
        return;
      }
      uploadedPathRef.current = null;
    }
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!resume && !uploadedPathRef.current) {
      setError('Upload a resume before submitting this referral.');
      return;
    }
    setSubmitting(true);
    setError('');
    let path = uploadedPathRef.current;
    try {
      if (!path && resume) {
        const extension = resume.name.split('.').at(-1)?.toLowerCase() || '';
        const contentType = MIME_BY_EXTENSION[extension];
        path = `${userId}/${tenantId}/${crypto.randomUUID()}/${safeFileName(resume.name)}`;
        const uploaded = await supabase.storage.from('employee-referral-files').upload(path, resume, {
          contentType,
          cacheControl: '3600',
          upsert: false,
        });
        if (uploaded.error) throw uploaded.error;
        uploadedPathRef.current = path;
      }
      if (!path) throw new Error('The resume upload did not produce a storage path.');
      const result = await supabase.rpc('hris_submit_employee_referral', {
        p_tenant_id: tenantId,
        p_payload: {
          candidate_name: name.trim(),
          candidate_email: email.trim(),
          candidate_phone: phone.trim() || null,
          relationship_note: relationship.trim(),
          candidate_profile_url: profileUrl.trim() || null,
          job_id: jobId || null,
          preferred_department_id: departmentId || null,
          referral_reason: reason.trim() || null,
          resume_path: path,
          resume_file_name: resume?.name || path.split('/').at(-1),
        },
      });
      if (result.error) throw result.error;
      uploadedPathRef.current = null;
      setName(''); setEmail(''); setPhone(''); setRelationship(''); setProfileUrl('');
      setJobId(''); setDepartmentId(''); setReason(''); setResume(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onSubmitted();
      onClose();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.toLowerCase() : '';
      setError(message.includes('active employee')
        ? 'Your active employee record was not found in this organization. Refresh or contact HR support.'
        : message.includes('open job')
          ? 'That job is no longer open. Choose another opening or leave the job field blank.'
          : message.includes('active department')
            ? 'That department is no longer available. Choose another or leave it blank.'
            : message.includes('resume') || message.includes('uploaded')
              ? 'The resume could not be verified. Select a valid PDF, DOC, or DOCX file up to 5 MB, then retry.'
              : 'The referral could not be submitted. Check the details and your organization access, then retry.');
      if (path && uploadedPathRef.current) {
        const cleanup = await supabase.storage.from('employee-referral-files').remove([path]);
        if (!cleanup.error) uploadedPathRef.current = null;
      }
    } finally {
      setSubmitting(false);
    }
  }

  function dropResume(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    selectResume(event.dataTransfer.files[0]);
  }

  return <dialog ref={dialogRef} aria-labelledby="employee-referral-form-heading"
    onCancel={event => { event.preventDefault(); void closeForm(); }}
    className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[1048px] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl backdrop:bg-slate-950/45 sm:p-6">
    <header className="flex items-center justify-between border-b border-slate-200 pb-4">
      <h2 id="employee-referral-form-heading" className="text-lg font-semibold text-[#08263D] sm:text-xl">Employee Information</h2>
      <button type="button" onClick={() => void closeForm()} aria-label="Close referral form" disabled={submitting}
        className="grid min-h-10 min-w-10 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-50"><X className="h-5 w-5" /></button>
    </header>

    <form onSubmit={submit} className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2">
      <label className="block text-sm text-slate-600 sm:col-span-2">Name <span className="text-rose-600" aria-hidden="true">*</span>
        <input required maxLength={160} autoComplete="name" value={name} onChange={event => setName(event.target.value)}
          className="mt-1 block min-h-11 w-full rounded border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:border-[#085587] focus:outline-none focus:ring-2 focus:ring-[#085587]/20" />
      </label>
      <label className="block text-sm text-slate-600">Personal Email <span className="text-rose-600" aria-hidden="true">*</span>
        <input required type="email" maxLength={320} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)}
          className="mt-1 block min-h-11 w-full rounded border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:border-[#085587] focus:outline-none focus:ring-2 focus:ring-[#085587]/20" />
      </label>
      <label className="block text-sm text-slate-600">Phone Number
        <input type="tel" maxLength={80} autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)}
          className="mt-1 block min-h-11 w-full rounded border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:border-[#085587] focus:outline-none focus:ring-2 focus:ring-[#085587]/20" />
      </label>
      <label className="block text-sm text-slate-600">Candidate Relationship <span className="text-rose-600" aria-hidden="true">*</span>
        <input required maxLength={240} value={relationship} onChange={event => setRelationship(event.target.value)}
          className="mt-1 block min-h-11 w-full rounded border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:border-[#085587] focus:outline-none focus:ring-2 focus:ring-[#085587]/20" />
      </label>
      <label className="block text-sm text-slate-600">LinkedIn/Portfolio URL
        <input type="url" maxLength={1000} inputMode="url" placeholder="https://" value={profileUrl} onChange={event => setProfileUrl(event.target.value)}
          className="mt-1 block min-h-11 w-full rounded border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:border-[#085587] focus:outline-none focus:ring-2 focus:ring-[#085587]/20" />
      </label>
      <label className="block text-sm text-slate-600">Job Opening
        <select value={jobId} onChange={event => setJobId(event.target.value)}
          className="mt-1 block min-h-11 w-full rounded border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-[#085587] focus:outline-none focus:ring-2 focus:ring-[#085587]/20">
          <option value="">No specific opening</option>
          {jobs.map(job => <option key={job.id} value={job.id}>{job.title} · {job.reference_number}</option>)}
        </select>
      </label>
      <label className="block text-sm text-slate-600">Preferred Department
        <select value={departmentId} onChange={event => setDepartmentId(event.target.value)}
          className="mt-1 block min-h-11 w-full rounded border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-[#085587] focus:outline-none focus:ring-2 focus:ring-[#085587]/20">
          <option value="">Select a department (optional)</option>
          {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
      </label>
      <div className="sm:col-span-2">
        <label htmlFor="referral-resume" className="block text-sm text-slate-600">Upload Your Resume/CV <span className="text-rose-600" aria-hidden="true">*</span></label>
        <input ref={fileInputRef} id="referral-resume" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          required={!resume && !uploadedPathRef.current} onChange={event => selectResume(event.currentTarget.files?.[0])}
          className="sr-only" aria-describedby="referral-resume-help" />
        <div onDragEnter={event => { event.preventDefault(); setIsDragging(true); }}
          onDragOver={event => event.preventDefault()} onDragLeave={event => { if (event.currentTarget === event.target) setIsDragging(false); }}
          onDrop={dropResume} className={`mt-2 grid min-h-36 place-items-center rounded-lg border border-dashed px-4 py-5 text-center ${isDragging ? 'border-[#085587] bg-[#EFF7F8]' : 'border-slate-400 bg-white'}`}>
          {resume ? <div className="flex flex-col items-center gap-2 text-sm text-slate-700"><FileText className="h-7 w-7 text-[#085587]" />
            <span className="max-w-full break-all font-medium">{resume.name}</span><span className="text-xs text-slate-500">{formatSize(resume.size)}</span>
            <button type="button" disabled={submitting} onClick={() => { setResume(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="min-h-9 text-xs font-semibold text-[#085587] underline">Choose a different file</button>
          </div> : <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-[#085587]" aria-hidden="true" />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="min-h-9 text-sm font-semibold text-[#085587]">Click to upload <span className="text-slate-500">or</span> drag &amp; drop</button>
            <p id="referral-resume-help" className="text-xs text-slate-500">PDF, DOC, DOCX accepted (Max 5 MB)</p>
          </div>}
        </div>
      </div>
      <label className="block text-sm text-slate-600 sm:col-span-2">Why are you referring this candidate?
        <textarea rows={4} maxLength={4000} value={reason} onChange={event => setReason(event.target.value)}
          className="mt-1 block w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#085587] focus:outline-none focus:ring-2 focus:ring-[#085587]/20" />
      </label>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 sm:col-span-2">{error}</p>}
      <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:col-span-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={() => void closeForm()} disabled={submitting} className="min-h-11 rounded-lg px-4 text-sm font-medium text-[#085587] disabled:opacity-50">Cancel</button>
        <button type="submit" disabled={submitting} className="min-h-11 rounded-lg bg-[#085587] px-5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-50">
          {submitting ? 'Submitting referral…' : 'Submit'}
        </button>
      </footer>
    </form>
  </dialog>;
}

export function EmployeeReferrals({ tenantId, userId, canViewQueue = false, canManage = false }: {
  tenantId: string;
  userId: string;
  canViewQueue?: boolean;
  canManage?: boolean;
}) {
  const detailsDialogRef = useRef<HTMLDialogElement>(null);
  const requestSequence = useRef(0);
  const [workspace, setWorkspace] = useState<ReferralWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [resumeError, setResumeError] = useState('');
  const [resumeRetry, setResumeRetry] = useState(0);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true); setError('');
    try {
      const result = await supabase.rpc('hris_get_employee_referral_workspace', { p_tenant_id: tenantId });
      if (result.error) throw result.error;
      const next = referralWorkspace(result.data);
      if (requestId === requestSequence.current) setWorkspace(next);
    } catch {
      if (requestId === requestSequence.current) {
        setWorkspace(null);
        setError('Employee referrals could not be loaded. Check your organization access and retry.');
      }
    } finally { if (requestId === requestSequence.current) setLoading(false); }
  }, [tenantId]);

  useEffect(() => {
    setWorkspace(null); setSelectedId(''); setSearch(''); setNotice('');
    void load();
  }, [load, retry]);

  const selected = useMemo(() => workspace?.referrals.find(row => row.id === selectedId) || null, [workspace, selectedId]);
  useEffect(() => {
    const dialog = detailsDialogRef.current;
    if (selected && dialog && !dialog.open) dialog.showModal();
    else if (!selected && dialog?.open) dialog.close();
  }, [selected?.id]);
  useEffect(() => {
    let current = true;
    setResumeUrl(''); setResumeError('');
    if (!selected?.resume_storage_path) return () => { current = false; };
    void (async () => {
      const result = await supabase.storage.from('employee-referral-files').createSignedUrl(selected.resume_storage_path!, 300);
      if (!current) return;
      if (result.error || !result.data?.signedUrl) setResumeError('The private resume could not be opened. Retry to request a fresh link.');
      else setResumeUrl(result.data.signedUrl);
    })();
    return () => { current = false; };
  }, [selected?.id, selected?.resume_storage_path, resumeRetry]);

  async function markInReview() {
    if (!selected || reviewing || !workspace?.can_review) return;
    setReviewing(true); setError(''); setNotice('');
    try {
      const result = await supabase.rpc('hris_mark_employee_referral_in_review', {
        p_tenant_id: tenantId,
        p_referral_id: selected.id,
        p_note: reviewNote.trim() || null,
      });
      if (result.error) throw result.error;
      setNotice(`Referral for ${selected.candidate_name} is now in review.`);
      setReviewNote('');
      closeDetails();
      await load();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.toLowerCase() : '';
      setError(message.includes('no longer awaiting')
        ? 'This referral has already changed. Refresh the list to see its current status.'
        : 'The referral could not be moved into review. Check your referral management access, then retry.');
    } finally { setReviewing(false); }
  }

  const referrals = workspace?.referrals.filter(row => {
    const value = `${row.candidate_name} ${row.candidate_email} ${row.job_title || ''} ${row.referrer_name}`.toLocaleLowerCase();
    return value.includes(search.trim().toLocaleLowerCase());
  }) || [];
  const managerMode = canViewQueue || canManage;
  function closeDetails() {
    if (detailsDialogRef.current?.open) detailsDialogRef.current.close();
    setSelectedId('');
  }

  return <section aria-labelledby="employee-referrals-heading" className="space-y-4">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 id="employee-referrals-heading" className="text-2xl font-medium text-[#49454F]">{managerMode ? 'Employee Referral Requests' : 'My Referrals'}</h2>
        <p className="mt-1 text-sm text-slate-600">{managerMode ? 'Review referrals submitted by employees in this organization.' : 'Share a candidate with your organization’s recruiting team.'}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={loading} onClick={() => setRetry(value => value + 1)} aria-label="Refresh employee referrals"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh</button>
        {workspace?.employee_id && <button type="button" onClick={() => { setNotice(''); setError(''); setFormOpen(true); }}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white"><UserRoundPlus className="h-4 w-4" aria-hidden="true" /> Refer a candidate</button>}
      </div>
    </header>
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="font-semibold underline">Retry</button></div>}
    {managerMode && <label className="block max-w-xl text-xs font-medium text-slate-600">Search referrals
      <span className="relative mt-1 block"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
        <input aria-label="Search employee referrals" value={search} onChange={event => setSearch(event.target.value)} placeholder="Candidate, email, job, or referrer"
          className="min-h-11 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900" /></span>
    </label>}
    {loading && <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading referrals…</p>}
    {!loading && workspace && <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-sm">
        <h3 className="font-semibold text-slate-800">{managerMode ? 'Referral queue' : 'Submitted referrals'}</h3>
        <span className="text-slate-500">{referrals.length} {referrals.length === 1 ? 'referral' : 'referrals'}</span>
      </div>
      {referrals.length === 0 ? <div className="p-6 text-center">
        <UserRoundPlus className="mx-auto h-8 w-8 text-[#085587]" aria-hidden="true" />
        <p className="mt-2 font-medium text-slate-800">{search ? 'No referrals match this search' : 'No referrals yet'}</p>
        <p className="mt-1 text-sm text-slate-600">{search ? 'Try another name, email, job, or referrer.' : 'Submit a candidate referral to begin the review journey.'}</p>
      </div> : <ul className="divide-y divide-slate-100">{referrals.map(row => <li key={row.id} className="p-4 sm:p-5">
        <article className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0"><h4 className="break-words font-semibold text-slate-900">{row.candidate_name}</h4>
            <p className="break-all text-sm text-slate-600">{row.candidate_email}</p>
            <p className="mt-1 text-sm text-slate-700">{row.job_title || row.preferred_department || 'No opening selected'}</p>
            <p className="mt-1 text-xs text-slate-500">{managerMode ? `Referred by ${row.referrer_name} · ` : ''}Submitted {formatDate(row.submitted_at)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className="w-fit rounded-full bg-[#EFF7F8] px-3 py-1 text-xs font-medium capitalize text-[#085587]">{row.status.replaceAll('_', ' ')}</span>
            <button type="button" onClick={() => { setReviewNote(''); setSelectedId(row.id); }}
              className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium text-[#085587]">View details</button>
          </div>
        </article>
      </li>)}</ul>}
    </div>}

    {formOpen && workspace && <ReferralForm tenantId={tenantId} userId={userId} jobs={workspace.jobs} departments={workspace.departments}
      onClose={() => setFormOpen(false)} onSubmitted={() => { setFormOpen(false); setNotice('Referral submitted. The recruiting team can now review it.'); void load(); }} />}

    {selected && <dialog ref={detailsDialogRef} aria-labelledby="referral-details-heading" onCancel={event => { event.preventDefault(); closeDetails(); }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[1040px] overflow-y-auto rounded-2xl border border-slate-200 bg-[#F0F8FA] p-4 shadow-2xl backdrop:bg-slate-950/45 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div><p className="text-xs text-slate-500">Employee Referral Requests <span aria-hidden="true">/</span> <span className="font-semibold text-slate-800">{selected.referrer_name}</span></p>
          <h2 id="referral-details-heading" className="mt-2 flex items-center gap-2 text-lg font-semibold text-[#424242]"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#E7F4F7] text-[#085587]"><FileText className="h-4 w-4" /></span>Referral Details</h2>
        </div>
        <button type="button" aria-label="Close referral details" onClick={closeDetails} className="grid min-h-10 min-w-10 place-items-center rounded-lg text-slate-600 hover:bg-white"><X className="h-5 w-5" /></button>
      </div>
      <dl className="mt-4 grid gap-0 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[190px_minmax(0,1fr)] sm:p-5">
        {[
          ['Referred By', selected.referrer_name], ['Employee ID', selected.referrer_employee_number],
          ['Department', selected.referrer_department], ['Designation', selected.referrer_designation],
          ['Candidate', selected.candidate_name], ['Email', selected.candidate_email], ['Phone', selected.candidate_phone],
          ['Relationship', selected.relationship_note], ['Job opening', selected.job_title], ['Preferred department', selected.preferred_department],
          ['LinkedIn/Portfolio', selected.candidate_profile_url], ['Reason for referring', selected.referral_reason],
          ['Submitted', formatDate(selected.submitted_at)], ['Status', selected.status.replaceAll('_', ' ')],
          ['Review note', selected.status_note],
        ].map(([label, value]) => <div key={label} className="grid gap-1 border-b border-slate-100 py-2.5 text-sm last:border-0 sm:grid-cols-subgrid sm:gap-4">
          <dt className="text-slate-500">{label}</dt><dd className="min-w-0 break-words text-slate-900">{value || '—'}</dd>
        </div>)}
        <div className="grid gap-1 border-t border-slate-100 py-3 text-sm sm:grid-cols-subgrid sm:gap-4">
          <dt className="text-slate-500">Resume</dt><dd className="min-w-0">
            {resumeUrl ? <a href={resumeUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-2 font-medium text-[#085587] underline"><Download className="h-4 w-4" />Download {selected.resume_file_name || 'resume'} <ExternalLink className="h-3.5 w-3.5" /></a>
              : resumeError ? <span role="alert" className="text-rose-800">{resumeError} <button type="button" onClick={() => setResumeRetry(value => value + 1)} className="font-semibold underline">Retry</button></span>
                : <span role="status" className="text-slate-500">Preparing private download…</span>}
            {selected.resume_file_size && <span className="ml-2 text-xs text-slate-500">{formatSize(selected.resume_file_size)}</span>}
          </dd>
        </div>
      </dl>
      <footer className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-semibold text-slate-800">Referral status</p><p className="mt-1 text-xs text-slate-600">Operational review is tracked separately from candidate applications.</p></div>
        {workspace?.can_review && selected.status === 'submitted' && <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 text-xs text-slate-600 sm:w-72">Review note (optional)
            <input maxLength={2000} value={reviewNote} onChange={event => setReviewNote(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
          </label>
          <button type="button" disabled={reviewing} onClick={() => void markInReview()} className="min-h-11 rounded-lg bg-[#085587] px-4 text-sm font-semibold text-white disabled:opacity-50">{reviewing ? 'Updating…' : 'Mark in review'}</button>
        </div>}
      </footer>
    </dialog>}
  </section>;
}

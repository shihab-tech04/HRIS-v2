import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type ReviewStage = 'screening' | 'shortlisted' | 'final_review' | 'rejected';
type StageHistory = {
  stage?: string;
  actor_type?: string;
  note?: string | null;
  created_at?: string;
};
type CandidateApplication = {
  id: string;
  candidate_user_id?: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  current_location?: string | null;
  years_experience?: number | null;
  skills?: string[] | null;
  cv_url?: string | null;
  cover_letter?: string | null;
  application_data?: Record<string, unknown> | null;
  stage?: string | null;
  status_note?: string | null;
  applied_at?: string | null;
  job_title?: string | null;
  job_reference?: string | null;
  stage_history?: StageHistory[] | null;
};
type RecruitmentData = { applications?: CandidateApplication[] | null };
type Access = 'checking' | 'denied' | 'view' | 'manage';

const reviewStages: { value: ReviewStage; label: string }[] = [
  { value: 'screening', label: 'Screening' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'final_review', label: 'Final review' },
  { value: 'rejected', label: 'Rejected' }
];

function readable(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.map(item => String(item)).join(', ') || '—';
  if (typeof value === 'object') return JSON.stringify(value) || '—';
  return String(value);
}

function dateLabel(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString();
}

function applicationAnswers(application: CandidateApplication): { questionId: string; answer: unknown }[] {
  const answers = application.application_data?.answers;
  if (!Array.isArray(answers)) return [];
  return answers.filter((entry): entry is { questionId: string; answer: unknown } =>
    Boolean(entry && typeof entry === 'object' && 'questionId' in entry && 'answer' in entry)
  );
}

function privateCvPath(application: CandidateApplication): string | null {
  const path = application.cv_url?.trim();
  const owner = application.candidate_user_id;
  if (!path || !owner || /^[a-z][a-z0-9+.-]*:\/\//i.test(path) || path.includes('\\')) return null;
  const segments = path.split('/');
  if (segments[0] !== owner || segments.some(segment => !segment || segment === '.' || segment === '..')) return null;
  return path;
}

export function RecruitmentPipeline({ revision, tenantId }: { revision: number; tenantId: string }) {
  const [access, setAccess] = useState<Access>('checking');
  const [applications, setApplications] = useState<CandidateApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedStages, setSelectedStages] = useState<Record<string, ReviewStage | ''>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState('');
  const [cvLoadingId, setCvLoadingId] = useState('');
  const [cvLinks, setCvLinks] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    setAccess('checking');
    setApplications([]);
    setSelectedStages({});
    setNotes({});
    setCvLinks({});
    setError('');
    setLoading(true);

    void (async () => {
      const [viewPermission, managePermission] = await Promise.all([
        supabase.rpc('has_permission', { p_permission_id: 'recruitment.view' }),
        supabase.rpc('has_permission', { p_permission_id: 'recruitment.manage' })
      ]);
      if (viewPermission.error || managePermission.error) {
        throw new Error('Recruitment access could not be verified for this session.');
      }
      const canView = viewPermission.data === true;
      const canManage = managePermission.data === true;
      if (!canView && !canManage) {
        if (active) {
          setAccess('denied');
          setError('Recruitment view permission is required to open this pipeline.');
        }
        return;
      }

      const { data, error: dataError } = await supabase.rpc('admin_get_recruitment_data');
      if (dataError) throw dataError;
      if (!data || typeof data !== 'object') throw new Error('Recruitment records were not returned.');

      const records = (data as RecruitmentData).applications;
      if (active) {
        setApplications(Array.isArray(records) ? records.filter(row => typeof row?.id === 'string') : []);
        setAccess(canManage ? 'manage' : 'view');
      }
    })().catch(() => {
      if (active) {
        setAccess('denied');
        setError('Recruitment records could not be verified. Refresh the workspace or contact an administrator.');
      }
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [revision, reloadKey, tenantId]);

  useEffect(() => {
    setNotice('');
  }, [revision, tenantId]);

  async function updateStage(application: CandidateApplication) {
    const stage = selectedStages[application.id];
    if (access !== 'manage' || !stage) return;
    setSavingId(application.id);
    setError('');
    setNotice('');
    try {
      const { error: updateError } = await supabase.rpc('admin_update_application_stage', {
        p_application_id: application.id,
        p_stage: stage,
        p_note: notes[application.id]?.trim() || null
      });
      if (updateError) throw updateError;
      setNotice(`Application stage updated to ${reviewStages.find(item => item.value === stage)?.label || stage}.`);
      setSelectedStages(current => ({ ...current, [application.id]: '' }));
      setNotes(current => ({ ...current, [application.id]: '' }));
      setReloadKey(value => value + 1);
    } catch {
      setError('The application stage was not saved. Check your recruitment management permission and retry.');
    } finally {
      setSavingId('');
    }
  }

  async function createCvLink(application: CandidateApplication) {
    const path = privateCvPath(application);
    if (!path) {
      setError('A verified private CV file is not available for this application.');
      return;
    }
    setCvLoadingId(application.id);
    setError('');
    try {
      const { data, error: signedUrlError } = await supabase.storage
        .from('candidate-documents')
        .createSignedUrl(path, 60);
      if (signedUrlError || !data?.signedUrl) throw signedUrlError || new Error('Signed link was not returned.');
      setCvLinks(current => ({ ...current, [application.id]: data.signedUrl }));
    } catch {
      setError('The private CV could not be opened for this session. Check recruitment view permission and retry.');
    } finally {
      setCvLoadingId('');
    }
  }

  if (access === 'checking' && loading) return <section className="bg-white border border-slate-200 rounded-xl p-5" role="status">Checking recruitment permissions…</section>;

  return <section aria-label="Recruiter candidate pipeline" className="bg-white border border-slate-200 rounded-xl overflow-hidden">
    <header className="p-5 border-b border-slate-200 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-semibold text-slate-900">Candidate applications</h3>
        <p className="text-sm text-slate-600 mt-1">Live HRIS applications · permission-checked · no sample records</p>
      </div>
      <p className="text-xs text-slate-500">{access === 'manage' ? 'Recruitment management enabled' : access === 'view' ? 'Read only' : 'Access restricted'}</p>
    </header>
    {notice && <p role="status" className="mx-4 mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900">{notice}</p>}
    {error && <p role="alert" className="mx-4 mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {loading ? <p role="status" className="p-5 text-sm text-slate-600">Loading authorized applications…</p> : access === 'denied' ?
      <p className="p-5 text-sm text-slate-600">Candidate records are hidden because this session does not have verified recruitment access.</p> :
      applications.length === 0 ? <p className="p-5 text-sm text-slate-600">No applications are available for review in the current HRIS database.</p> :
      <ul className="divide-y divide-slate-200">
        {applications.map(application => {
          const answers = applicationAnswers(application);
          const isClosed = ['hired', 'withdrawn', 'offer_declined'].includes(application.stage || '');
          const path = privateCvPath(application);
          return <li key={application.id} className="p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="font-semibold text-slate-900 break-words">{readable(application.full_name)}</h4>
                <p className="text-sm text-slate-700 mt-1">{readable(application.job_title)}{application.job_reference ? ` · ${application.job_reference}` : ''}</p>
                <p className="text-xs text-slate-500 mt-1">Submitted {dateLabel(application.applied_at)}</p>
              </div>
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{readable(application.stage)}</span>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2 text-sm">
              <div><dt className="text-xs text-slate-500">Email</dt><dd className="break-all">{readable(application.email)}</dd></div>
              <div><dt className="text-xs text-slate-500">Phone</dt><dd>{readable(application.phone)}</dd></div>
              <div><dt className="text-xs text-slate-500">Location</dt><dd>{readable(application.current_location)}</dd></div>
              <div><dt className="text-xs text-slate-500">Experience</dt><dd>{application.years_experience == null ? '—' : `${application.years_experience} years`}</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs text-slate-500">Skills</dt><dd>{readable(application.skills)}</dd></div>
            </dl>

            {(answers.length > 0 || application.cover_letter) && <details className="rounded-md border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-800">Application responses</summary>
              {application.cover_letter && <p className="whitespace-pre-wrap text-sm text-slate-700 mt-3">{application.cover_letter}</p>}
              {answers.length > 0 && <dl className="mt-3 space-y-2">{answers.map((answer, index) => <div key={`${answer.questionId}-${index}`}>
                <dt className="text-xs text-slate-500">Screening question {answer.questionId}</dt>
                <dd className="text-sm text-slate-800">{readable(answer.answer)}</dd>
              </div>)}</dl>}
            </details>}

            {application.status_note && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950"><span className="font-medium">Internal recruiter note:</span> {application.status_note}</p>}

            <div className="flex flex-wrap items-center gap-2">
              {path ? <>
                <button type="button" disabled={cvLoadingId === application.id} onClick={() => void createCvLink(application)} className="min-h-10 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50 disabled:opacity-50">
                  {cvLoadingId === application.id ? 'Preparing private CV link…' : cvLinks[application.id] ? 'Refresh private CV link' : 'Prepare private CV link'}
                </button>
                {cvLinks[application.id] && <a href={cvLinks[application.id]} target="_blank" rel="noopener noreferrer" className="min-h-10 inline-flex items-center rounded-md px-3 text-sm font-medium text-blue-800 underline">Open CV (valid 1 minute)</a>}
              </> : <p className="text-xs text-slate-500">No verified CV file is attached.</p>}
            </div>

            {application.stage_history?.length ? <details className="rounded-md border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-800">Stage history ({application.stage_history.length})</summary>
              <ol className="mt-3 space-y-2">{application.stage_history.map((entry, index) => <li key={`${entry.created_at || 'event'}-${index}`} className="text-sm">
                <span className="font-medium">{readable(entry.stage)}</span><span className="text-xs text-slate-500"> · {dateLabel(entry.created_at)}</span>
                {entry.note && <p className="mt-1 whitespace-pre-wrap text-slate-700">{entry.note}</p>}
              </li>)}</ol>
            </details> : null}

            {access === 'manage' && <fieldset disabled={isClosed || savingId === application.id} className="rounded-md border border-slate-200 p-3 disabled:opacity-70">
              <legend className="px-1 text-sm font-medium text-slate-800">Recruiter decision</legend>
              <div className="grid grid-cols-1 md:grid-cols-[minmax(12rem,1fr)_minmax(12rem,2fr)_auto] gap-3 items-end">
                <div><label htmlFor={`stage-${application.id}`} className="block text-xs font-medium text-slate-600 mb-1">Next stage</label>
                  <select id={`stage-${application.id}`} value={selectedStages[application.id] || ''} onChange={event => setSelectedStages(current => ({ ...current, [application.id]: event.target.value as ReviewStage | '' }))} className="min-h-10 w-full rounded-md border border-slate-300 px-2 text-sm">
                    <option value="">Choose a stage</option>{reviewStages.map(stage => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
                  </select>
                </div>
                <div><label htmlFor={`note-${application.id}`} className="block text-xs font-medium text-slate-600 mb-1">Internal note</label>
                  <input id={`note-${application.id}`} value={notes[application.id] || ''} onChange={event => setNotes(current => ({ ...current, [application.id]: event.target.value }))} className="min-h-10 w-full rounded-md border border-slate-300 px-3 text-sm" placeholder="Optional recruiter note" />
                </div>
                <button type="button" disabled={!selectedStages[application.id]} onClick={() => void updateStage(application)} className="min-h-10 rounded-md bg-[#085587] px-4 text-sm font-semibold text-white hover:bg-[#074770] disabled:cursor-not-allowed disabled:opacity-50">{savingId === application.id ? 'Saving…' : 'Save decision'}</button>
              </div>
              {isClosed && <p className="mt-2 text-xs text-slate-600">This application is closed and cannot be changed from the pipeline.</p>}
              <p className="mt-2 text-xs text-slate-500">Stage changes are checked and audited by HRIS. Candidate accounts do not receive internal notes.</p>
            </fieldset>}
          </li>;
        })}
      </ul>}
  </section>;
}

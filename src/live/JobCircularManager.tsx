import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { projectText, type Locale } from './project-locale';
import { ManpowerRequisitionManager } from './ManpowerRequisitionManager';
import { appendUniqueJobCirculars, fetchJobCircularPage } from './jobCircularPaging.mjs';

const JOB_PAGE_SIZE = 100;
const JOB_LIST_FIELDS = 'id,reference_number,title,department_id,team_id,designation_id,location_id,requisition_id,department_name,location_name,workplace_type,employment_type,experience_level,vacancy_count,min_experience_years,education_requirement,skills,responsibilities,requirements,benefits,required_documents,screening_questions,salary_currency,salary_min,salary_max,is_salary_published,application_deadline,instructions,status,is_published,is_active';

type Job = {
  id: string; reference_number: string; title: string;
  department_id: string | null; team_id: string | null;
  designation_id: string | null; location_id: string | null; requisition_id: string | null;
  department_name: string | null; location_name: string | null;
  workplace_type: string; employment_type: string; experience_level: string;
  vacancy_count: number; min_experience_years: number;
  education_requirement: string | null; skills: string[]; responsibilities: string[];
  requirements: string[]; benefits: string[]; required_documents: string[];
  screening_questions: unknown[];
  salary_currency: string; salary_min: number | null; salary_max: number | null;
  is_salary_published: boolean; application_deadline: string | null;
  instructions: string | null; status: string; is_published: boolean; is_active: boolean;
};
type Master = { id: string; name: string };
type RequisitionOption = { id: string; reference_number: string; title: string; required_positions: number };
type ScreeningQuestion = {
  id: string; questionText: string; type: string; required: boolean;
  options?: string[];
  [key: string]: unknown;
};
const screeningQuestionTypes = [
  'short_text', 'long_text', 'number', 'yes_no', 'single_select', 'multi_select', 'date',
] as const;
const needsOptions = (kind: string) => kind === 'single_select' || kind === 'multi_select';

/** Retain existing question IDs and unknown metadata to protect saved answers. */
function restoreQuestions(values: unknown[]): ScreeningQuestion[] {
  return values.map(value => {
    const existing = value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : {};
    return {
      ...existing,
      id: typeof existing.id === 'string' ? existing.id : '',
      questionText: typeof existing.questionText === 'string' ? existing.questionText : '',
      type: typeof existing.type === 'string' ? existing.type : '',
      required: existing.required === true,
      options: Array.isArray(existing.options) ? existing.options.filter(
        (option): option is string => typeof option === 'string',
      ) : [],
    };
  });
}

function validateQuestions(questions: ScreeningQuestion[]): string | null {
  const ids = new Set<string>();
  for (const [index, question] of questions.entries()) {
    const number = index + 1;
    if (!question.id.trim() || ids.has(question.id)) return 'Screening question IDs must exist and be unique.';
    ids.add(question.id);
    if (!question.questionText.trim()) return `Enter text for screening question ${number}.`;
    if (!screeningQuestionTypes.some(type => type === question.type)) {
      return `Unsupported type in screening question ${number}; preserve its original configuration.`;
    }
    if (needsOptions(question.type) && !(question.options || []).some(option => option.trim())) {
      return `Add an answer option for screening question ${number}.`;
    }
  }
  return null;
}

type Draft = {
  title: string; departmentId: string; locationId: string; requisitionId: string;
  workplaceType: string; employmentType: string; experienceLevel: string;
  vacancies: string; experienceYears: string; deadline: string; education: string;
  skills: string; responsibilities: string; requirements: string; benefits: string;
  documents: string; instructions: string; currency: string;
  salaryMin: string; salaryMax: string; showSalary: boolean;
};
const blank = (): Draft => ({
  title: '', departmentId: '', locationId: '', requisitionId: '',
  workplaceType: 'on-site', employmentType: 'full-time', experienceLevel: 'mid',
  vacancies: '1', experienceYears: '0', deadline: '', education: '',
  skills: '', responsibilities: '', requirements: '', benefits: '',
  documents: '', instructions: '', currency: 'BDT', salaryMin: '', salaryMax: '',
  showSalary: false,
});
const textList = (text: string) => text.split('\n').map(v => v.trim()).filter(Boolean);
const originalList = (values: string[] | null | undefined) => (values || []).join('\n');
const fieldClass = 'mt-1 block w-full min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-[#085587]';
const secondaryButton = 'min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50';
const primaryButton = 'min-h-10 rounded-md bg-[#085587] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';

function fromJob(job: Job): Draft {
  return {
    title: job.title, departmentId: job.department_id || '', locationId: job.location_id || '', requisitionId: job.requisition_id || '',
    workplaceType: job.workplace_type, employmentType: job.employment_type,
    experienceLevel: job.experience_level || 'mid',
    vacancies: String(job.vacancy_count), experienceYears: String(job.min_experience_years),
    deadline: job.application_deadline || '', education: job.education_requirement || '',
    skills: originalList(job.skills), responsibilities: originalList(job.responsibilities),
    requirements: originalList(job.requirements), benefits: originalList(job.benefits),
    documents: originalList(job.required_documents), instructions: job.instructions || '',
    currency: job.salary_currency, salaryMin: job.salary_min?.toString() || '',
    salaryMax: job.salary_max?.toString() || '', showSalary: job.is_salary_published,
  };
}

export function JobCircularManager({ tenantId, refreshKey, locale = 'en' }: { tenantId: string; refreshKey: number; locale?: Locale }) {
  const t = (english: string) => projectText(locale, english);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [moreJobsAvailable, setMoreJobsAvailable] = useState(false);
  const [nextJobOffset, setNextJobOffset] = useState(0);
  const [loadingMoreJobs, setLoadingMoreJobs] = useState(false);
  const [moreJobsError, setMoreJobsError] = useState('');
  const jobListGeneration = useRef(0);
  const [departments, setDepartments] = useState<Master[]>([]);
  const [locations, setLocations] = useState<Master[]>([]);
  const [approvedRequisitions, setApprovedRequisitions] = useState<RequisitionOption[]>([]);
  const [requisitionLoadError, setRequisitionLoadError] = useState(false);
  const [activeSection, setActiveSection] = useState<'jobs' | 'requisitions'>('jobs');
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Job | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(blank());
  const [screeningQuestions, setScreeningQuestions] = useState<ScreeningQuestion[]>([]);
  const [revision, setRevision] = useState(0);

  async function readJobRange(from: number, to: number) {
    const result = await supabase.from('jobs').select(JOB_LIST_FIELDS)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to);
    return { data: result.data, error: result.error };
  }

  useEffect(() => {
    let current = true;
    const requestId = ++jobListGeneration.current;
    setMoreJobsAvailable(false);
    setNextJobOffset(0);
    setLoadingMoreJobs(false);
    setMoreJobsError('');
    setLoading(true);
    setError('');
    setJobs([]);
    setCanManage(false);
    setApprovedRequisitions([]);
    setRequisitionLoadError(false);
    setFormOpen(false);
    setEditing(null);
    setScreeningQuestions([]);
    void (async () => {
      const permission = await supabase.rpc('has_tenant_permission', {
        p_tenant_id: tenantId, p_permission_id: 'recruitment.manage',
      });
      if (!current) return;
      setCanManage(!permission.error && permission.data === true);
      try {
        const page = await fetchJobCircularPage(readJobRange, 0, JOB_PAGE_SIZE);
        if (!current || requestId !== jobListGeneration.current) return;
        setJobs(page.rows as Job[]);
        setNextJobOffset(page.nextOffset);
        setMoreJobsAvailable(page.hasMore);
      } catch {
        if (!current || requestId !== jobListGeneration.current) return;
        setError('Unable to load this organization’s job circulars. Check recruitment permissions.');
      }
      if (!permission.error && permission.data === true) {
        const [dep, loc, requisitions] = await Promise.all([
          supabase.from('departments').select('id,name').eq('tenant_id', tenantId).eq('active', true).order('name'),
          supabase.from('org_locations').select('id,name').eq('tenant_id', tenantId).eq('active', true).order('name'),
          supabase.from('manpower_requisitions').select('id,reference_number,title,required_positions')
            .eq('tenant_id', tenantId).eq('status', 'approved').order('requested_at', { ascending: false }).limit(100),
        ]);
        if (!current) return;
        setDepartments((dep.data || []) as Master[]);
        setLocations((loc.data || []) as Master[]);
        setApprovedRequisitions((requisitions.data || []) as RequisitionOption[]);
        setRequisitionLoadError(Boolean(requisitions.error));
      }
    })().catch(() => { if (current) setError('Job circulars could not be loaded. Retry the request.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; jobListGeneration.current += 1; };
  }, [tenantId, refreshKey, revision]);

  async function loadMoreJobCirculars() {
    if (loading || loadingMoreJobs || !moreJobsAvailable || Boolean(error)) return;
    const requestId = jobListGeneration.current;
    setLoadingMoreJobs(true);
    setMoreJobsError('');
    try {
      const page = await fetchJobCircularPage(readJobRange, nextJobOffset, JOB_PAGE_SIZE);
      if (requestId !== jobListGeneration.current) return;
      setJobs(previous => appendUniqueJobCirculars(previous, page.rows as Job[]));
      setNextJobOffset(page.nextOffset);
      setMoreJobsAvailable(page.hasMore);
    } catch {
      if (requestId !== jobListGeneration.current) return;
      setMoreJobsError(locale === 'bn'
        ? 'আরও চাকরির বিজ্ঞপ্তি লোড করা যায়নি। আবার চেষ্টা করুন।'
        : 'Unable to load more job circulars. Retry.');
    } finally {
      if (requestId === jobListGeneration.current) setLoadingMoreJobs(false);
    }
  }

  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(previous => ({ ...previous, [key]: value }));
  }

  function openCreate() {
    setEditing(null); setDraft(blank()); setScreeningQuestions([]); setNotice(''); setError(''); setFormOpen(true);
  }

  function openEdit(job: Job) {
    setEditing(job); setDraft(fromJob(job));
    setScreeningQuestions(restoreQuestions(job.screening_questions || []));
    setNotice(''); setError(''); setFormOpen(true);
  }

  function validate(): string | null {
    if (!draft.title.trim()) return 'Enter a job title.';
    // Draft jobs may be saved without a deadline; publishing RPC requires one.
    // An already published circular may have passed its deadline since creation.
    if (draft.deadline && draft.deadline < new Date().toISOString().slice(0, 10)
      && (!editing?.is_published || draft.deadline !== editing.application_deadline)) {
      return 'Select today or a future application deadline.';
    }
    if (!Number.isInteger(Number(draft.vacancies)) || Number(draft.vacancies) < 1) return 'Vacancies must be a positive whole number.';
    if (!Number.isFinite(Number(draft.experienceYears)) || Number(draft.experienceYears) < 0) return 'Experience must be zero or greater.';
    if (draft.salaryMin !== '' && (!Number.isFinite(Number(draft.salaryMin)) || Number(draft.salaryMin) < 0)) return 'Enter a valid minimum salary.';
    if (draft.salaryMax !== '' && (!Number.isFinite(Number(draft.salaryMax)) || Number(draft.salaryMax) < 0)) return 'Enter a valid maximum salary.';
    if (draft.showSalary && (!draft.salaryMin || !draft.salaryMax)) return 'To publish salary, enter the minimum and maximum.';
    if (draft.salaryMin && draft.salaryMax && Number(draft.salaryMin) > Number(draft.salaryMax)) return 'Minimum salary cannot exceed maximum salary.';
    const questionError = validateQuestions(screeningQuestions);
    if (questionError) return questionError;
    return null;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || saving) return;
    const problem = validate();
    if (problem) { setError(problem); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      // Preserve linked masters and stable screening-question IDs on updates.
      // admin_save_job replaces these fields even if they are omitted.
      const payload = {
        title: draft.title.trim(), application_deadline: draft.deadline || null,
        department_id: draft.departmentId || null, location_id: draft.locationId || null,
        team_id: editing?.team_id || null, designation_id: editing?.designation_id || null,
        requisition_id: draft.requisitionId || null,
        workplace_type: draft.workplaceType, employment_type: draft.employmentType,
        experience_level: draft.experienceLevel,
        vacancy_count: Number(draft.vacancies), min_experience_years: Number(draft.experienceYears),
        education_requirement: draft.education.trim(), skills: textList(draft.skills),
        responsibilities: textList(draft.responsibilities), requirements: textList(draft.requirements),
        benefits: textList(draft.benefits), required_documents: textList(draft.documents),
        screening_questions: editing?.is_published
          ? editing.screening_questions
          : screeningQuestions.map(question => ({
            ...question,
            questionText: question.questionText.trim(),
            options: needsOptions(question.type)
              ? (question.options || []).map(option => option.trim()).filter(Boolean)
              : [],
          })),
        salary_currency: draft.currency.trim().toUpperCase(),
        salary_min: draft.salaryMin || null, salary_max: draft.salaryMax || null,
        is_salary_published: draft.showSalary, instructions: draft.instructions.trim(),
      };
      const result = await supabase.rpc('admin_save_job', {
        p_id: editing?.id || null, p_payload: payload,
      });
      if (result.error || typeof result.data !== 'string') throw new Error('Unable to save this job.');
      setFormOpen(false); setEditing(null); setNotice(editing ? 'Job circular updated.' : 'Job circular saved as draft. Publish it when ready.');
      setRevision(v => v + 1);
    } catch {
      setError('Saving failed. Check the fields and recruitment management access, then retry.');
    } finally { setSaving(false); }
  }

  async function setPublished(job: Job, published: boolean) {
    if (!canManage || busyId) return;
    setBusyId(job.id); setError(''); setNotice('');
    try {
      const result = await supabase.rpc('admin_set_job_published', {
        p_job_id: job.id, p_published: published,
      });
      const response = result.data as { success?: boolean; published?: boolean } | null;
      if (result.error || response?.success !== true || response.published !== published) {
        throw new Error('Publication result was not confirmed.');
      }
      setNotice(published ? 'Job published. It will appear on Candidate Careers when the public vacancy source refreshes.' : 'Job unpublished and removed from public vacancy listings.');
      setRevision(v => v + 1);
    } catch {
      setError('The publication change could not be confirmed. Check the deadline, salary details, and recruiter access.');
    } finally { setBusyId(''); }
  }

  function selectOption(options: Master[], selectedId: string) {
    return <>
      <option value="">None</option>
      {selectedId && !options.some(item => item.id === selectedId) &&
        <option value={selectedId}>Previously linked master record</option>}
      {options.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </>;
  }

  return <section aria-label="Job circular management" className="space-y-4">
    <nav aria-label={t('Recruitment workflows')} className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3">
      <button type="button" aria-current={activeSection === 'jobs' ? 'page' : undefined} onClick={() => {
        if (activeSection === 'requisitions') setRevision(value => value + 1);
        setActiveSection('jobs');
      }}
        className={activeSection === 'jobs' ? primaryButton : secondaryButton}>{t('Job circulars')}</button>
      <button type="button" aria-current={activeSection === 'requisitions' ? 'page' : undefined} onClick={() => setActiveSection('requisitions')}
        className={activeSection === 'requisitions' ? primaryButton : secondaryButton}>{t('Manpower requisitions')}</button>
    </nav>
    {activeSection === 'jobs' ? <>
    <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold text-slate-900">Job circulars</h3>
        <p className="text-sm text-slate-600">Create, edit and publish approved vacancies through the authenticated recruitment service.</p>
      </div>
      {canManage && <button type="button" onClick={openCreate} className={primaryButton}>New job circular</button>}
    </div>
    {notice && <p role="status" className="rounded-md border border-slate-200 p-3 text-sm text-[#085587]">{notice}</p>}
    {error && <p role="alert" className="rounded-md border border-slate-200 p-3 text-sm text-red-700">{error}</p>}

    {formOpen && canManage && <form onSubmit={event => void save(event)} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 space-y-4" aria-label="Job circular editor">
      <h4 className="font-semibold">{editing ? 'Edit job circular' : 'Create job circular'}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="text-sm font-medium">Job title *
          <input required maxLength={180} className={fieldClass} value={draft.title} onChange={e => change('title', e.target.value)}/>
        </label>
        <label className="text-sm font-medium">Application deadline (required before publishing)
          <input type="date" min={editing?.is_published ? undefined : new Date().toISOString().slice(0,10)} className={fieldClass} value={draft.deadline} onChange={e => change('deadline', e.target.value)}/>
        </label>
        <label className="text-sm font-medium">Department
          <select className={fieldClass} value={draft.departmentId} onChange={e => change('departmentId',e.target.value)}>{selectOption(departments,draft.departmentId)}</select>
        </label>
        <label className="text-sm font-medium">Work location
          <select className={fieldClass} value={draft.locationId} onChange={e => change('locationId',e.target.value)}>{selectOption(locations,draft.locationId)}</select>
        </label>
        <label className="text-sm font-medium">{t('Approved requisition')}
          <select className={fieldClass} value={draft.requisitionId} disabled={saving} onChange={e => change('requisitionId',e.target.value)}>
            <option value="">{t('No requisition linked')}</option>
            {draft.requisitionId && !approvedRequisitions.some(item => item.id === draft.requisitionId) &&
              <option value={draft.requisitionId}>{t('Previously linked requisition')}</option>}
            {approvedRequisitions.map(requisition => <option key={requisition.id} value={requisition.id}>
              {requisition.reference_number} — {requisition.title} ({requisition.required_positions} {t('positions')})
            </option>)}
          </select>
          <span className="mt-1 block text-xs text-slate-500">{t('Only approved requisitions from this organization are shown. The server checks tenant ownership and approval status when saving.')}</span>
          {requisitionLoadError && <span role="status" className="mt-1 block text-xs text-amber-800">{t('Approved requisitions could not be loaded. Save without a new link or refresh to try again.')}</span>}
          {!loading && !requisitionLoadError && approvedRequisitions.length === 0 && <span role="status" className="mt-1 block text-xs text-slate-500">{t('No approved requisitions are available for this organization.')}</span>}
        </label>
        <label className="text-sm font-medium">Workplace type
          <select className={fieldClass} value={draft.workplaceType} onChange={e => change('workplaceType',e.target.value)}>
            {['on-site','hybrid','remote'].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Employment type
          <select className={fieldClass} value={draft.employmentType} onChange={e => change('employmentType',e.target.value)}>
            {['full-time','part-time','contract','internship'].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Experience level
          <select className={fieldClass} value={draft.experienceLevel} onChange={e => change('experienceLevel',e.target.value)}>
            {['entry','mid','senior','lead','executive'].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Vacancies *
          <input type="number" min="1" step="1" required className={fieldClass} value={draft.vacancies} onChange={e => change('vacancies',e.target.value)}/>
        </label>
        <label className="text-sm font-medium">Minimum experience (years)
          <input type="number" min="0" step="0.5" className={fieldClass} value={draft.experienceYears} onChange={e => change('experienceYears',e.target.value)}/>
        </label>
        <label className="text-sm font-medium">Salary currency
          <input maxLength={3} className={fieldClass} value={draft.currency} onChange={e => change('currency',e.target.value)}/>
        </label>
        <label className="text-sm font-medium">Minimum salary
          <input type="number" min="0" className={fieldClass} value={draft.salaryMin} onChange={e => change('salaryMin',e.target.value)}/>
        </label>
        <label className="text-sm font-medium">Maximum salary
          <input type="number" min="0" className={fieldClass} value={draft.salaryMax} onChange={e => change('salaryMax',e.target.value)}/>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={draft.showSalary} onChange={e => change('showSalary',e.target.checked)}/>
        Display salary publicly on the Candidate website
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {([
          ['education','Education requirement'],['skills','Skills (one per line)'],
          ['responsibilities','Responsibilities (one per line)'],['requirements','Requirements (one per line)'],
          ['benefits','Benefits (one per line)'],['documents','Required documents (one per line)'],
          ['instructions','Application instructions'],
        ] as const).map(([key,heading]) =>
          <label key={key} className="block text-sm font-medium">{heading}
            <textarea rows={3} className={fieldClass} value={draft[key]} onChange={e => change(key,e.target.value)}/>
          </label>)}
      </div>
      <section className="space-y-3 rounded-lg border border-slate-200 p-3 sm:p-4" aria-label={t("Application screening questions")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="font-semibold text-slate-900">{t("Application screening questions")}</h4>
            <p className="text-xs text-slate-600">{t("Questions appear in Candidate applications in the same order. Keep IDs stable when editing.")}</p>
          </div>
          {!editing?.is_published && <button type="button" disabled={saving} className={secondaryButton}
            onClick={() => setScreeningQuestions(previous => [...previous, {
              id: crypto.randomUUID(), questionText: '', type: 'short_text', required: false, options: [],
            }])}>{t("Add question")}</button>}
        </div>
        {editing?.is_published && <p role="status" className="text-sm text-slate-600">
          {t("Unpublish this circular before changing screening questions. Existing applicants' question IDs are preserved.")}
        </p>}
        {screeningQuestions.length === 0 && <p className="text-sm text-slate-600">{t("No screening questions added.")}</p>}
        {screeningQuestions.map((question, index) =>
          <fieldset key={question.id || index} disabled={saving || Boolean(editing?.is_published)}
            className="space-y-3 rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold">{t('Question')} {index + 1}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-sm font-medium">{t("Question text *")}
                <input required maxLength={500} className={fieldClass} value={question.questionText}
                  onChange={event => setScreeningQuestions(previous => previous.map(current =>
                    current.id === question.id ? { ...current, questionText: event.target.value } : current))}/>
              </label>
              <label className="block text-sm font-medium">{t("Answer type")}
                <select className={fieldClass} value={question.type}
                  onChange={event => setScreeningQuestions(previous => previous.map(current =>
                    current.id === question.id ? { ...current, type: event.target.value, options: [] } : current))}>
                  {!screeningQuestionTypes.some(type => type === question.type) &&
                    <option value={question.type}>Unsupported saved type — {question.type || 'missing'}</option>}
                  {screeningQuestionTypes.map(type =>
                    <option key={type} value={type}>{t(type.replaceAll('_', ' '))}</option>)}
                </select>
              </label>
            </div>
            {needsOptions(question.type) && <label className="block text-sm font-medium">
              {t("Answer options (one per line) *")}
              <textarea required rows={3} className={fieldClass}
                value={(question.options || []).join('\n')}
                onChange={event => setScreeningQuestions(previous => previous.map(current =>
                  current.id === question.id ? {
                    ...current, options: event.target.value.split('\n'),
                  } : current))}/>
            </label>}
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={question.required}
                  onChange={event => setScreeningQuestions(previous => previous.map(current =>
                    current.id === question.id ? { ...current, required: event.target.checked } : current))}/>
                {t("Required answer")}
              </label>
              {!editing?.is_published && <button type="button" className={secondaryButton}
                onClick={() => setScreeningQuestions(previous => previous.filter(item => item.id !== question.id))}>
                {t("Remove question")}
              </button>}
            </div>
          </fieldset>)}
      </section>
      {editing && (editing.team_id || editing.designation_id) &&
        <p className="text-xs text-slate-600">Existing team and designation links are preserved when editing.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButton} disabled={saving}>{saving ? 'Saving…' : 'Save job circular'}</button>
        <button type="button" disabled={saving} className={secondaryButton} onClick={() => {setFormOpen(false);setEditing(null);setError('');}}>Cancel</button>
      </div>
    </form>}

    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <h4 className="p-4 border-b border-slate-200 font-semibold">Organization job circulars</h4>
      {loading ? <p role="status" className="p-4 text-sm">Loading job circulars…</p> :
        jobs.length === 0 ? <p className="p-4 text-sm text-slate-600">No authorized job circulars are available for this organization.</p> :
        <ul className="divide-y divide-slate-200">{jobs.map(job =>
          <li key={job.id} className="p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="font-medium">{job.title}</p>
                <p className="text-xs text-slate-600 mt-1">{job.reference_number} · {job.department_name || 'No department'} · Deadline {job.application_deadline || 'Not set'}</p>
              </div>
              <span className="rounded-md border border-slate-200 px-2 py-1 text-xs">{job.is_published ? 'Published' : job.status}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canManage && <>
                <button type="button" onClick={() => openEdit(job)} disabled={Boolean(busyId)} className={secondaryButton}>Edit</button>
                <button type="button" disabled={Boolean(busyId) || !job.is_active} className={primaryButton}
                  onClick={() => void setPublished(job,!job.is_published)}>{busyId === job.id ? 'Saving…' : job.is_published ? 'Unpublish' : 'Publish'}</button>
              </>}
              {job.is_published && <a className="text-sm font-medium text-[#085587] underline" rel="noopener noreferrer" target="_blank"
                href={'https://shihab-tech04.github.io/HRIS-Candidate-v2/?job=' + encodeURIComponent(job.id)}>View on Candidate Careers</a>}
            </div>
          </li>)}</ul>}
      {!loading && !error && moreJobsError && <p role="alert" className="p-4 text-sm text-red-700">{moreJobsError}</p>}
      {!loading && !error && moreJobsAvailable && <div className="flex justify-center border-t border-slate-200 p-4">
        <button type="button" className={secondaryButton} disabled={loadingMoreJobs}
          onClick={() => void loadMoreJobCirculars()}>
          {loadingMoreJobs
            ? (locale === 'bn' ? 'আরও চাকরির বিজ্ঞপ্তি লোড হচ্ছে…' : 'Loading more job circulars…')
            : moreJobsError
              ? t('Retry')
              : (locale === 'bn' ? 'আরও চাকরির বিজ্ঞপ্তি দেখুন' : 'Load more job circulars')}
        </button>
      </div>}
    </section>
    </> : <ManpowerRequisitionManager tenantId={tenantId} refreshKey={refreshKey + revision} locale={locale}/>}
  </section>;
}

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { projectText, type Locale } from './project-locale';
import {
  buildRequisitionDecisionArgs,
  buildRequisitionPayload,
  canResolveRequisition,
  canSaveRequisition,
  requisitionDecisionConfirmed,
  validateRequisitionDraft,
} from './manpower-requisition-contract.mjs';

type Requisition = {
  id: string;
  reference_number: string;
  title: string;
  department_id: string | null;
  designation_id: string | null;
  employment_type: string;
  project_name: string | null;
  required_positions: number;
  desired_joining_date: string | null;
  years_experience: number | null;
  education_qualifications: string | null;
  certifications: string | null;
  job_description: string | null;
  reason: string | null;
  status: string;
  requested_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

type RequisitionDraft = {
  title: string;
  employmentType: string;
  projectName: string;
  requiredPositions: string;
  desiredJoiningDate: string;
  yearsExperience: string;
  educationQualifications: string;
  certifications: string;
  jobDescription: string;
  reason: string;
};

const emptyDraft = (): RequisitionDraft => ({
  title: '', employmentType: 'full_time', projectName: '', requiredPositions: '1',
  desiredJoiningDate: '', yearsExperience: '', educationQualifications: '',
  certifications: '', jobDescription: '', reason: '',
});

const fieldClass = 'mt-1 block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-[#085587]';
const primaryButton = 'min-h-10 rounded-md bg-[#085587] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const secondaryButton = 'min-h-10 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50';

function fromRequisition(requisition: Requisition): RequisitionDraft {
  return {
    title: requisition.title,
    employmentType: requisition.employment_type || 'full_time',
    projectName: requisition.project_name || '',
    requiredPositions: String(requisition.required_positions),
    desiredJoiningDate: requisition.desired_joining_date || '',
    yearsExperience: requisition.years_experience === null ? '' : String(requisition.years_experience),
    educationQualifications: requisition.education_qualifications || '',
    certifications: requisition.certifications || '',
    jobDescription: requisition.job_description || '',
    reason: requisition.reason || '',
  };
}

function statusLabel(status: string, t: (value: string) => string) {
  if (status === 'pending') return t('Pending approval');
  if (status === 'approved') return t('Approved');
  if (status === 'rejected') return t('Rejected');
  if (status === 'draft') return t('Draft');
  if (status === 'closed') return t('Closed');
  return status;
}

export function ManpowerRequisitionManager({ tenantId, refreshKey = 0, locale = 'en' }: {
  tenantId: string;
  refreshKey?: number;
  locale?: Locale;
}) {
  const t = (english: string) => projectText(locale, english);
  const [requests, setRequests] = useState<Requisition[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<Requisition | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<RequisitionDraft>(emptyDraft);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [revision, setRevision] = useState(0);
  const previousTenantId = useRef(tenantId);
  const currentTenantId = useRef(tenantId);
  currentTenantId.current = tenantId;

  useEffect(() => {
    if (previousTenantId.current === tenantId) return;
    previousTenantId.current = tenantId;
    setRequests([]);
    setCanManage(false);
    setError('');
    setNotice('');
    setEditing(null);
    setFormOpen(false);
    setDraft(emptyDraft());
    setNotes({});
    setBusyId('');
  }, [tenantId]);

  useEffect(() => {
    let active = true;
    setRequests([]);
    setCanManage(false);
    setLoading(true);

    void (async () => {
      const permission = await supabase.rpc('has_tenant_permission', {
        p_tenant_id: tenantId,
        p_permission_id: 'recruitment.manage',
      });
      if (!active) return;
      if (permission.error || permission.data !== true) {
        setError(t('Recruitment management access for this organization is required.'));
        return;
      }

      setCanManage(true);
      const response = await supabase.from('manpower_requisitions')
        .select('id,reference_number,title,department_id,designation_id,employment_type,project_name,required_positions,desired_joining_date,years_experience,education_qualifications,certifications,job_description,reason,status,requested_at,resolved_at,resolution_note')
        .eq('tenant_id', tenantId)
        .order('requested_at', { ascending: false })
        .limit(50);
      if (!active) return;
      if (response.error) throw response.error;
      setRequests((response.data || []) as Requisition[]);
    })().catch(() => {
      if (active) {
        setRequests([]);
        setError(t('Manpower requisitions are unavailable. Refresh to try again.'));
      }
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [tenantId, refreshKey, revision]);

  function change<K extends keyof RequisitionDraft>(key: K, value: RequisitionDraft[K]) {
    setDraft(previous => ({ ...previous, [key]: value }));
  }

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft());
    setNotice('');
    setError('');
    setFormOpen(true);
  }

  function openEdit(requisition: Requisition) {
    if (!canManage || !canResolveRequisition(requisition.status)) return;
    setEditing(requisition);
    setDraft(fromRequisition(requisition));
    setNotice('');
    setError('');
    setFormOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSaveRequisition(canManage, saving)) return;
    if (editing && !canResolveRequisition(editing.status)) return;
    const actionTenantId = tenantId;
    const validationError = validateRequisitionDraft(draft);
    if (validationError) {
      setError(t(validationError));
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await supabase.rpc('admin_save_requisition', {
        p_id: editing?.id || null,
        // Status, tenant ID, audit fields and reference numbers are never accepted from the client.
        p_payload: buildRequisitionPayload(draft, editing),
      });
      if (currentTenantId.current !== actionTenantId) return;
      if (result.error || typeof result.data !== 'string') throw new Error('Save was not confirmed.');
      setNotice(t(editing ? 'Requisition updated.' : 'Requisition submitted for approval.'));
      setFormOpen(false);
      setEditing(null);
      setRevision(value => value + 1);
    } catch {
      if (currentTenantId.current === actionTenantId) {
        setError(t('Unable to save this requisition. Refresh before retrying if the response was interrupted.'));
      }
    } finally {
      setSaving(false);
    }
  }

  async function resolve(requisition: Requisition, decision: 'approved' | 'rejected') {
    if (!canManage || busyId || !canResolveRequisition(requisition.status)) return;
    const actionTenantId = tenantId;
    const args = buildRequisitionDecisionArgs(requisition, decision, notes[requisition.id] || '');
    if (!args) return;
    setBusyId(requisition.id);
    setError('');
    setNotice('');
    try {
      const result = await supabase.rpc('admin_resolve_requisition', args);
      if (currentTenantId.current !== actionTenantId) return;
      if (result.error || !requisitionDecisionConfirmed(result.data, decision)) {
        throw new Error('Decision was not confirmed.');
      }
      setNotice(t(decision === 'approved' ? 'Requisition approved.' : 'Requisition rejected.'));
      setRevision(value => value + 1);
    } catch {
      if (currentTenantId.current === actionTenantId) {
        setError(t('This request may already have been resolved or is unavailable. Refresh the queue and review its current status.'));
        setRevision(value => value + 1);
      }
    } finally {
      setBusyId('');
    }
  }

  return <section aria-label={t('Manpower requisition management')} className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h3 className="font-semibold text-slate-900">{t('Manpower requisitions')}</h3>
        <p className="text-sm text-slate-600">{t('Create and review hiring requests for this organization.')}</p>
      </div>
      {canManage && <button type="button" onClick={openCreate} className={primaryButton}>{t('New requisition')}</button>}
    </div>

    {notice && <p role="status" className="rounded-md border border-slate-200 p-3 text-sm text-[#085587]">{notice}</p>}
    {error && <p role="alert" className="rounded-md border border-slate-200 p-3 text-sm text-red-700">{error}</p>}

    {formOpen && canManage && <form onSubmit={event => void save(event)} aria-label={t('Requisition editor')} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <h4 className="font-semibold">{t(editing ? 'Edit requisition' : 'Create requisition')}</h4>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">{t('Requisition title')} *
          <input required className={fieldClass} value={draft.title} onChange={event => change('title', event.target.value)}/>
        </label>
        <label className="text-sm font-medium">{t('Required positions')} *
          <input type="number" min="1" step="1" required className={fieldClass} value={draft.requiredPositions} onChange={event => change('requiredPositions', event.target.value)}/>
        </label>
        <label className="text-sm font-medium">{t('Employment type')}
          <input className={fieldClass} value={draft.employmentType} onChange={event => change('employmentType', event.target.value)}/>
        </label>
        <label className="text-sm font-medium">{t('Project name')}
          <input className={fieldClass} value={draft.projectName} onChange={event => change('projectName', event.target.value)}/>
        </label>
        <label className="text-sm font-medium">{t('Desired joining date')}
          <input type="date" className={fieldClass} value={draft.desiredJoiningDate} onChange={event => change('desiredJoiningDate', event.target.value)}/>
        </label>
        <label className="text-sm font-medium">{t('Years of experience')}
          <input type="number" min="0" step="0.5" className={fieldClass} value={draft.yearsExperience} onChange={event => change('yearsExperience', event.target.value)}/>
        </label>
        {([
          ['educationQualifications', 'Education qualifications'],
          ['certifications', 'Certifications'],
          ['jobDescription', 'Job description'],
          ['reason', 'Reason for request'],
        ] as const).map(([key, heading]) => <label key={key} className="text-sm font-medium">{t(heading)}
          <textarea rows={3} className={fieldClass} value={draft[key]} onChange={event => change(key, event.target.value)}/>
        </label>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={primaryButton}>{saving ? t('Saving…') : t('Save requisition')}</button>
        <button type="button" disabled={saving} className={secondaryButton} onClick={() => { setFormOpen(false); setEditing(null); setError(''); }}>{t('Cancel')}</button>
      </div>
    </form>}

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4">
        <h4 className="font-semibold">{t('Organization requisitions')}</h4>
        <button type="button" disabled={loading} onClick={() => {
          setError('');
          setNotice('');
          setRevision(value => value + 1);
        }} className={secondaryButton}>{t('Refresh queue')}</button>
      </div>
      {loading ? <p role="status" className="p-4 text-sm text-slate-600">{t('Loading requisitions…')}</p> :
        requests.length === 0 ? <p role="status" className="p-4 text-sm text-slate-600">{t('No requisitions are available for this organization.')}</p> :
        <ul className="divide-y divide-slate-200">{requests.map(requisition => <li key={requisition.id} className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words font-medium text-slate-900">{requisition.title}</p>
              <p className="mt-1 text-xs text-slate-600">{requisition.reference_number} · {t('Positions')}: {requisition.required_positions} · {requisition.employment_type}</p>
              {requisition.project_name && <p className="mt-1 text-xs text-slate-600">{t('Project')}: {requisition.project_name}</p>}
              {requisition.desired_joining_date && <p className="mt-1 text-xs text-slate-600">{t('Desired joining date')}: {requisition.desired_joining_date}</p>}
              {requisition.reason && <p className="mt-2 break-words text-sm text-slate-600">{t('Reason')}: {requisition.reason}</p>}
              {requisition.resolution_note && <p className="mt-2 break-words text-sm text-slate-600">{t('Reviewer note')}: {requisition.resolution_note}</p>}
            </div>
            <span className="shrink-0 rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{statusLabel(requisition.status, t)}</span>
          </div>
          {canManage && canResolveRequisition(requisition.status) && <>
            <label className="block text-xs font-medium text-slate-600">{t('Reviewer note (optional)')}
              <textarea maxLength={1000} rows={2} className={fieldClass} value={notes[requisition.id] || ''}
                onChange={event => setNotes(current => ({ ...current, [requisition.id]: event.target.value }))}/>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={Boolean(busyId) || saving} onClick={() => void resolve(requisition, 'approved')} className={primaryButton}>
                {busyId === requisition.id ? t('Saving…') : t('Approve requisition')}
              </button>
              <button type="button" disabled={Boolean(busyId) || saving} onClick={() => void resolve(requisition, 'rejected')} className={secondaryButton}>{t('Reject requisition')}</button>
              <button type="button" disabled={Boolean(busyId) || saving} onClick={() => openEdit(requisition)} className={secondaryButton}>{t('Edit')}</button>
            </div>
          </>}
        </li>)}</ul>}
    </section>
  </section>;
}

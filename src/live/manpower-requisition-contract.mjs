/** @typedef {{ title: string, employmentType: string, projectName: string, requiredPositions: string, desiredJoiningDate: string, yearsExperience: string, educationQualifications: string, certifications: string, jobDescription: string, reason: string }} RequisitionDraft */

/** @param {RequisitionDraft} draft */
export function validateRequisitionDraft(draft) {
  const title = typeof draft.title === 'string' ? draft.title.trim() : '';
  if (!title) return 'Enter a requisition title.';

  const positions = Number(draft.requiredPositions);
  if (!Number.isInteger(positions) || positions < 1) {
    return 'Required positions must be a positive whole number.';
  }

  if (draft.yearsExperience !== '') {
    const years = Number(draft.yearsExperience);
    if (!Number.isFinite(years) || years < 0) return 'Years of experience must be zero or greater.';
  }

  return null;
}

/** @param {RequisitionDraft} draft @param {{ department_id?: string | null, designation_id?: string | null } | null} existing */
export function buildRequisitionPayload(draft, existing = null) {
  return {
    title: draft.title.trim(),
    department_id: existing?.department_id || null,
    designation_id: existing?.designation_id || null,
    employment_type: draft.employmentType.trim() || 'full_time',
    project_name: draft.projectName.trim() || null,
    required_positions: Number(draft.requiredPositions),
    desired_joining_date: draft.desiredJoiningDate || null,
    years_experience: draft.yearsExperience === '' ? null : Number(draft.yearsExperience),
    education_qualifications: draft.educationQualifications.trim() || null,
    certifications: draft.certifications.trim() || null,
    job_description: draft.jobDescription.trim() || null,
    reason: draft.reason.trim() || null,
  };
}

export function canSaveRequisition(canManage, saving) {
  return canManage === true && saving !== true;
}

export function canResolveRequisition(status) {
  return status === 'pending';
}

/** @param {{ id: string, status: string } | null | undefined} requisition @param {'approved' | 'rejected'} decision @param {string} note */
export function buildRequisitionDecisionArgs(requisition, decision, note) {
  if (!requisition || !canResolveRequisition(requisition.status)) return null;
  if (decision !== 'approved' && decision !== 'rejected') return null;
  return {
    p_id: requisition.id,
    p_decision: decision,
    p_note: note.trim() || null,
  };
}

export function requisitionDecisionConfirmed(data, decision) {
  return data !== null
    && typeof data === 'object'
    && data.success === true
    && data.decision === decision;
}

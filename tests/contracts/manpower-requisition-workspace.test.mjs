import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildRequisitionDecisionArgs,
  buildRequisitionPayload,
  canResolveRequisition,
  canSaveRequisition,
  requisitionDecisionConfirmed,
  validateRequisitionDraft,
} from '../../src/live/manpower-requisition-contract.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const requisitions = read('../../src/live/ManpowerRequisitionManager.tsx');
const jobs = read('../../src/live/JobCircularManager.tsx');
const jobRpc = read('../../supabase/migrations/20261024101414_hris_job_circular_source_recovery.sql');
const draft = () => ({
  title: '  Senior analyst  ', employmentType: ' full_time ', projectName: ' HRIS ',
  requiredPositions: '2', desiredJoiningDate: '2027-01-10', yearsExperience: '3.5',
  educationQualifications: ' BSc ', certifications: '', jobDescription: ' Analysis ', reason: ' Growth ',
});

test('requisition title and numeric requirements validate before an RPC call', () => {
  assert.equal(validateRequisitionDraft(draft()), null);
  assert.equal(validateRequisitionDraft({ ...draft(), title: '  ' }), 'Enter a requisition title.');
  assert.equal(validateRequisitionDraft({ ...draft(), title: '  ' + 'x'.repeat(500) + '  ' }), null);
  assert.equal(validateRequisitionDraft({ ...draft(), requiredPositions: '0' }), 'Required positions must be a positive whole number.');
  assert.equal(validateRequisitionDraft({ ...draft(), requiredPositions: '1.5' }), 'Required positions must be a positive whole number.');
  assert.equal(validateRequisitionDraft({ ...draft(), yearsExperience: '-0.5' }), 'Years of experience must be zero or greater.');
});

test('save and edit payloads contain only supported requisition fields and never accept status or tenant identity', () => {
  const payload = buildRequisitionPayload({ ...draft(), status: 'approved', tenant_id: 'foreign-tenant' });
  assert.deepEqual(Object.keys(payload).sort(), [
    'certifications', 'department_id', 'designation_id', 'desired_joining_date',
    'education_qualifications', 'employment_type', 'job_description', 'project_name',
    'reason', 'required_positions', 'title', 'years_experience',
  ].sort());
  assert.equal(payload.title, 'Senior analyst');
  assert.equal(payload.project_name, 'HRIS');
  assert.equal(payload.required_positions, 2);
  assert.equal(payload.status, undefined);
  assert.equal(payload.tenant_id, undefined);
  assert.equal(payload.department_id, null);
  assert.equal(payload.designation_id, null);
  const edited = buildRequisitionPayload(draft(), { department_id: 'tenant-department', designation_id: 'tenant-designation' });
  assert.equal(edited.department_id, 'tenant-department');
  assert.equal(edited.designation_id, 'tenant-designation');
});

test('save and resolution require the management permission and pending state', () => {
  assert.equal(canSaveRequisition(false, false), false);
  assert.equal(canSaveRequisition(true, true), false);
  assert.equal(canSaveRequisition(true, false), true);
  assert.equal(canResolveRequisition('pending'), true);
  for (const status of ['draft', 'approved', 'rejected', 'closed']) assert.equal(canResolveRequisition(status), false);
  assert.deepEqual(buildRequisitionDecisionArgs({ id: 'pending-id', status: 'pending' }, 'approved', '  accepted  '), {
    p_id: 'pending-id', p_decision: 'approved', p_note: 'accepted',
  });
  assert.deepEqual(buildRequisitionDecisionArgs({ id: 'pending-id', status: 'pending' }, 'rejected', ''), {
    p_id: 'pending-id', p_decision: 'rejected', p_note: null,
  });
  assert.equal(buildRequisitionDecisionArgs({ id: 'already-approved', status: 'approved' }, 'approved', ''), null);
  assert.equal(buildRequisitionDecisionArgs({ id: 'pending-id', status: 'pending' }, 'closed', ''), null);
});

test('duplicate resolution is not offered again and only the matching RPC result is confirmed', () => {
  const request = { id: 'req-1', status: 'pending' };
  assert.ok(buildRequisitionDecisionArgs(request, 'approved', ''));
  request.status = 'approved';
  assert.equal(buildRequisitionDecisionArgs(request, 'approved', ''), null);
  assert.equal(requisitionDecisionConfirmed({ success: true, decision: 'approved' }, 'approved'), true);
  assert.equal(requisitionDecisionConfirmed({ success: true, decision: 'rejected' }, 'approved'), false);
  assert.equal(requisitionDecisionConfirmed({ success: false, decision: 'approved' }, 'approved'), false);
  assert.match(requisitions, /This request may already have been resolved or is unavailable/);
  assert.match(requisitions, /catch \{\s*if \(currentTenantId\.current === actionTenantId\) \{[\s\S]*?setRevision\(value => value \+ 1\)/);
});

test('manager reads are permission-gated and tenant-filtered; all mutations use the existing RPCs', () => {
  assert.match(requisitions, /p_tenant_id: tenantId,[\s\S]*?p_permission_id: 'recruitment\.manage'/);
  assert.match(requisitions, /\.from\('manpower_requisitions'\)[\s\S]*?\.eq\('tenant_id', tenantId\)/);
  assert.match(requisitions, /if \(permission\.error \|\| permission\.data !== true\)/);
  assert.match(requisitions, /p_id: editing\?\.id \|\| null/);
  assert.match(requisitions, /p_payload: buildRequisitionPayload\(draft, editing\)/);
  assert.match(requisitions, /supabase\.rpc\('admin_save_requisition',\s*\{/);
  assert.match(requisitions, /supabase\.rpc\('admin_resolve_requisition', args\)/);
  assert.match(requisitions, /if \(!canManage \|\| busyId \|\| !canResolveRequisition\(requisition\.status\)\) return;/);
  assert.doesNotMatch(requisitions, /supabase\.from\('manpower_requisitions'\)\.(insert|update|delete)\(/);
  assert.match(requisitions, /Status, tenant ID, audit fields and reference numbers are never accepted from the client/);
});

test('job form only offers tenant-owned approved requisitions and preserves selected links on edit', () => {
  assert.match(jobs, /\.from\('manpower_requisitions'\)\.select\('id,reference_number,title,required_positions'\)[\s\S]*?\.eq\('tenant_id', tenantId\)\.eq\('status', 'approved'\)/);
  assert.match(jobs, /requisitionId: job\.requisition_id \|\| ''/);
  assert.match(jobs, /requisition_id: draft\.requisitionId \|\| null/);
  assert.match(jobs, /if \(activeSection === 'requisitions'\) setRevision\(value => value \+ 1\)/);
  assert.match(jobs, /Only approved requisitions from this organization are shown/);
  assert.match(jobRpc, /where id=v_req and tenant_id=v_tenant and status='approved'/);
  assert.match(jobs, /aria-label=\{t\('Recruitment workflows'\)\}/);
  assert.match(jobs, /<ManpowerRequisitionManager tenantId=\{tenantId\} refreshKey=\{refreshKey \+ revision\} locale=\{locale\}/);
});

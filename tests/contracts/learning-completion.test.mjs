import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261014160000_hris_learning_completion_verification.sql', import.meta.url), 'utf8');
const evidenceRequirementMigration = readFileSync(new URL('../../supabase/migrations/20261014160001_hris_learning_completion_evidence_requirement.sql', import.meta.url), 'utf8');
const employeeUi = readFileSync(new URL('../../src/live/MyLearning.tsx', import.meta.url), 'utf8');
const managerUi = readFileSync(new URL('../../src/live/LearningCompletionQueue.tsx', import.meta.url), 'utf8');
const programAdminUi = readFileSync(new URL('../../src/live/LearningProgramAdmin.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../sql/isolated-auth/run-learning-browser.mjs', import.meta.url), 'utf8');

test('learning completion is append-only, tenant-bound, and verified only by learning.manage', () => {
  assert.match(migration, /completion_submitted_at timestamptz/);
  assert.match(migration, /completion_verified_at timestamptz/);
  assert.match(migration, /completion_verified_by uuid REFERENCES auth\.users/);
  assert.match(migration, /CREATE TABLE public\.learning_completion_events/);
  assert.match(migration, /UNIQUE \(tenant_id,id\)/);
  assert.match(migration, /CREATE TABLE public\.learning_completion_notifications/);
  assert.match(migration, /ALTER TABLE public\.learning_completion_events ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.learning_completion_events,public\.learning_completion_notifications[\s\S]*?FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.hris_employee_submit_learning_completion/);
  assert.match(migration, /e\.employee_id=v_employee_id[\s\S]*?FOR UPDATE/);
  assert.match(migration, /v_enrollment\.status NOT IN \('enrolled','returned_for_correction'\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.hris_get_learning_completion_queue/);
  assert.match(migration, /has_tenant_permission\(p_tenant_id,'learning\.manage'\)/);
  assert.match(migration, /e\.status='pending_verification'/);
  assert.match(migration, /p_decision='returned_for_correction' AND v_reason IS NULL/);
  assert.match(migration, /completed_at=CASE WHEN v_status='completed' THEN v_decision_at ELSE NULL END/);
  assert.match(migration, /completion_verified_by=CASE WHEN v_status='completed' THEN auth\.uid\(\) ELSE NULL END/);
  assert.match(migration, /INSERT INTO public\.admin_audit_logs/);
  assert.match(migration, /INSERT INTO public\.learning_completion_notifications/);
  assert.match(migration, /no manager\/reporting-line relationship/);
  for (const rpc of ['hris_get_my_learning_completion_data', 'hris_get_learning_completion_queue',
    'hris_employee_submit_learning_completion', 'hris_resolve_learning_completion']) {
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${rpc}\\(`));
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${rpc}\\(`));
  }
});

test('pending and returned learning remain one open employee assignment until verification', () => {
  assert.match(migration, /DROP INDEX IF EXISTS public\.learning_enrollments_open_employee_program_session_uidx[\s\S]*?CREATE UNIQUE INDEX learning_enrollments_open_employee_program_session_uidx[\s\S]*?status IN \('requested','enrolled','pending_verification','returned_for_correction'\)/);
  assert.match(employeeUi, /function isCurrentAssignment[\s\S]*?status === 'pending_verification'[\s\S]*?status === 'returned_for_correction'/);
  assert.match(employeeUi, /Completion pending verification/);
  assert.match(employeeUi, /Completion returned for correction/);
  assert.match(runner, /Learning enrollment is kept open while completion is pending verification or returned for correction/);
  assert.match(runner, /duplicatePendingCompletionEnrollment\.error\?\.code === '23505'/);
  assert.match(runner, /duplicateReturnedCompletionEnrollment\.error\?\.code === '23505'/);
  assert.match(browser, /pendingCatalogCard\.getByText\('Completion pending verification'/);
  assert.match(browser, /pendingCatalogCard\.getByText\('Completion returned for correction'/);
});

test('completion evidence is program-configurable, server-enforced, private, bounded, and tenant-authorized', () => {
  assert.match(evidenceRequirementMigration, /ADD COLUMN IF NOT EXISTS completion_evidence_required boolean NOT NULL DEFAULT false/);
  assert.match(evidenceRequirementMigration, /FUNCTION public\.hris_save_learning_program\([\s\S]*?p_completion_evidence_required boolean/);
  assert.match(evidenceRequirementMigration, /has_tenant_permission\(p_tenant_id,'learning\.manage'\)/);
  assert.match(evidenceRequirementMigration, /learning_completion_requires_program_evidence/);
  assert.match(evidenceRequirementMigration, /coalesce\(v_required,false\) AND NEW\.completion_evidence_path IS NULL/);
  assert.match(evidenceRequirementMigration, /'completion_evidence_required',p\.completion_evidence_required/);
  assert.match(evidenceRequirementMigration, /GRANT EXECUTE ON FUNCTION public\.hris_save_learning_program\(uuid,uuid,text,text,text,text,text,numeric,boolean,text\[\],boolean,boolean\) TO authenticated,service_role/);
  assert.match(migration, /CREATE POLICY learning_completion_evidence_insert[\s\S]*?e\.status IN \('enrolled','returned_for_correction'\)/);
  assert.match(migration, /CREATE POLICY learning_completion_evidence_read[\s\S]*?has_tenant_permission\(e\.tenant_id,'learning\.manage'\)/);
  assert.match(migration, /CREATE POLICY learning_completion_evidence_delete_unattached/);
  assert.match(migration, /v_size>5242880/);
  assert.match(migration, /application\/pdf','image\/png','image\/jpeg/);
  assert.match(runner, /learning-completion-evidence/);
  assert.match(runner, /missingRequiredCompletionEvidence\.error\?\.code === '22023'/);
  assert.match(runner, /optionalCompletionSubmit/);
  assert.match(runner, /ordinaryEvidenceRequirementChange\.error\?\.code === '42501'/);
  assert.match(runner, /Learning completion submission and personal history are employee-owned/);
  assert.match(runner, /Only learning\.manage can verify or return/);
  assert.match(runner, /Returned learning can be corrected and resubmitted with private evidence/);
  assert.match(runner, /Verified learning records its reviewer\/date and employee history/);
});

test('employee and manager pages provide complete completion and correction journeys in the active locale', () => {
  assert.match(workspace, /id: 'learning-completions', label: 'Learning completion review'/);
  assert.match(workspace, /page === 'learning-completions' && permissions\.learningManage && <LearningCompletionQueue/);
  assert.match(employeeUi, /hris_get_my_learning_completion_data/);
  assert.match(employeeUi, /hris_employee_submit_learning_completion/);
  assert.match(employeeUi, /completion_evidence_required/);
  assert.match(employeeUi, /required=\{evidenceRequired\}/);
  assert.match(employeeUi, /evidenceRequired && !completionEvidence\[enrollment\.id\]/);
  assert.match(employeeUi, /Supporting evidence \(required\)/);
  assert.match(employeeUi, /Returned for correction/);
  assert.match(employeeUi, /pending manager verification/);
  assert.match(employeeUi, /completion_verified_by_name/);
  assert.match(employeeUi, /data-verified-learning/);
  assert.match(employeeUi, /data-learning-notification/);
  assert.match(employeeUi, /data-learning-status=\{enrollment\.status\}/);
  assert.doesNotMatch(employeeUi, /\.from\(['"]learning_enrollments['"]\)/);
  assert.match(managerUi, /hris_get_learning_completion_queue/);
  assert.match(managerUi, /hris_resolve_learning_completion/);
  assert.match(managerUi, /Return for correction/);
  assert.match(managerUi, /Verify/);
  assert.match(managerUi, /required=\{target\.decision === 'returned_for_correction'\}/);
  assert.match(managerUi, /learning-completion-evidence/);
  assert.match(programAdminUi, /Require evidence before completion can be verified/);
  assert.match(programAdminUi, /p_completion_evidence_required: programDraft\.completionEvidenceRequired/);
  assert.match(programAdminUi, /completion_evidence_required/);
  assert.match(browser, /Learning completion review/);
  assert.match(browser, /Returned for correction/);
  assert.match(browser, /Verified learning completion/);
  assert.match(browser, /Supporting evidence \(required\)/);
  assert.match(browser, /width: 375/);
  assert.match(browser, /width: 1280/);
});

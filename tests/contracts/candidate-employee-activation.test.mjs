import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const activationPolicy = readFileSync(new URL('../../supabase/migrations/20261016170000_hris_candidate_employee_activation_policy.sql', import.meta.url), 'utf8');
const activationIdMigration = readFileSync(new URL('../../supabase/migrations/20261020121500_hris_candidate_activation_employee_id.sql', import.meta.url), 'utf8');
const component = readFileSync(new URL('../../src/live/CandidatePreboardingQueue.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const pipeline = readFileSync(new URL('../../src/live/RecruitmentPipeline.tsx', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../../../HRIS-Candidate-v2/tests/candidate-application-local-e2e.mjs', import.meta.url), 'utf8');
const mainRunner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');

test('candidate activation uses the approved HR-only, explicitly verified, tenant-scoped RPC', () => {
  assert.match(activationPolicy, /hris_activate_candidate_employee\(\s*p_tenant_id uuid,\s*p_application_id uuid,\s*p_employee_number text,\s*p_joining_date date,\s*p_details_verified boolean/);
  assert.match(activationPolicy, /has_tenant_permission\(p_tenant_id,'employees\.manage'\)/);
  assert.match(activationPolicy, /p_details_verified IS DISTINCT FROM true/);
  assert.match(activationPolicy, /auth\.users[\s\S]*deleted_at IS NULL[\s\S]*banned_until/);
  assert.match(activationPolicy, /candidate_completed_steps @> ARRAY\[[\s\S]*step_identity[\s\S]*step_emergency[\s\S]*step_payroll[\s\S]*step_policies/);
  assert.match(activationPolicy, /lower\(btrim\(r\.name\)\)='employee'/);
  assert.match(activationPolicy, /m\.status='active'/);
  assert.match(activationPolicy, /v_employee_role_count <> 1/);
  assert.match(activationPolicy, /p_joining_date > v_tenant_today/);
  assert.match(activationPolicy, /employee_number=v_employee_number[\s\S]*joining_date=p_joining_date/);
  assert.match(activationPolicy, /verified_at=now\(\),verified_by=auth\.uid\(\)/);
  assert.match(activationPolicy, /stage='hired'[\s\S]*candidate_application_stage_history/);
  assert.match(activationPolicy, /candidate\.employee\.activated'[\s\S]*'employee',v_employee_id::text[\s\S]*'application_id',p_application_id/);
  assert.match(activationPolicy, /tenant_memberships_role_id_fkey/);
  assert.match(activationPolicy, /GRANT EXECUTE ON FUNCTION public\.hris_activate_candidate_employee\(uuid,uuid,text,date,boolean\)\s+TO authenticated,service_role/);
});

test('HR01-01 activation follow-up explicitly supplies the employees primary key', () => {
  assert.match(activationIdMigration, /CREATE OR REPLACE FUNCTION public\.hris_activate_candidate_employee/);
  assert.match(activationIdMigration, /SECURITY DEFINER[\s\S]*SET search_path = ''/);
  assert.match(activationIdMigration, /INSERT INTO public\.employees\s*\(\s*id,tenant_id,user_id,employee_number/);
  assert.match(activationIdMigration, /VALUES\s*\(\s*gen_random_uuid\(\),p_tenant_id,v_candidate_user_id/);
  assert.match(activationIdMigration, /GRANT EXECUTE ON FUNCTION public\.hris_activate_candidate_employee\(uuid,uuid,text,date,boolean\)\s+TO authenticated,service_role/);
  assert.match(mainRunner, /20261020121500_hris_candidate_activation_employee_id\.sql/);
  assert.match(mainRunner, /Boolean\(hr0101Employee\?\.id\)[\s\S]*hr0101Employee\?\.user_id === assessmentCandidateA\.userId/);
});

test('preboarding queue exposes activation controls only from the employees.manage screen', () => {
  assert.match(workspace, /if \(permissions\.employeesManage\) items\.push\(\{ id: 'onboarding', label: 'Onboarding'/);
  assert.match(workspace, /page === 'onboarding' && permissions\.employeesManage && <CandidatePreboardingQueue tenantId=\{tenantId\} locale=\{locale\} canActivate=\{permissions\.employeesManage\} \/>/);
  assert.match(pipeline, /canManagePreboarding && <CandidatePreboardingQueue tenantId=\{tenantId\} locale=\{locale\} \/>/);
  assert.match(component, /hris_activate_candidate_employee/);
  assert.match(component, /I verified the submitted details and confirm the employee number and joining date/);
  assert.match(component, /The active Employee role is not configured for this organization/);
  assert.match(component, /Activation is available on or after the confirmed joining date/);
  assert.match(runner, /20261014100459_gate_candidate_employee_activation_until_policy_approval\.sql/);
  assert.match(runner, /20261016170000_hris_candidate_employee_activation_policy\.sql/);
  assert.match(runner, /\['recruitment manager', staff\[0\]\.client\]/);
  assert.match(runner, /was allowed to activate an employee/);
  assert.match(runner, /const missingEmployeeRole = await staff\[3\]\.client\.rpc/);
  assert.match(runner, /const idempotentActivation = await staff\[3\]\.client\.rpc/);
  assert.match(runner, /directEmployeeInsert\.error\?\.code === '42501'/);
  assert.match(runner, /const c1RestrictedTables = \[/);
  assert.match(runner, /candidate_application_stage_history[\s\S]*onboarding_handoffs/);
  assert.match(runner, /response\.error\?\.code === '42501'/);
  assert.match(runner, /c1_direct_denials=\$\{c1DirectDenied\}\/196/);
  assert.match(runner, /status === 'submitted_for_verification'/);
  assert.match(runner, /employee_activation=hr-only\+employee-role\+future-date-block\+atomic\+idempotent/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gate = readFileSync(new URL('../../supabase/migrations/20261014100459_gate_candidate_employee_activation_until_policy_approval.sql', import.meta.url), 'utf8');
const component = readFileSync(new URL('../../src/live/CandidatePreboardingQueue.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const pipeline = readFileSync(new URL('../../src/live/RecruitmentPipeline.tsx', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../../../HRIS-Candidate-v2/tests/candidate-application-local-e2e.mjs', import.meta.url), 'utf8');

test('candidate employee conversion remains server-gated pending approved status and role mapping', () => {
  assert.match(gate, /REVOKE ALL ON FUNCTION public\.hris_activate_candidate_employee\(uuid,uuid,text,date\)\s+FROM PUBLIC, anon, authenticated/);
  assert.match(gate, /employee status and role-mapping rules have not been approved/i);
});

test('preboarding stays available while activation controls are absent across manager screens', () => {
  assert.match(workspace, /if \(permissions\.employeesManage\) items\.push\(\{ id: 'onboarding', label: 'Onboarding'/);
  assert.match(workspace, /page === 'onboarding' && permissions\.employeesManage && <CandidatePreboardingQueue tenantId=\{tenantId\} locale=\{locale\} \/>/);
  assert.doesNotMatch(workspace, /canActivateEmployees|canActivate/);
  assert.match(pipeline, /canManagePreboarding && <CandidatePreboardingQueue tenantId=\{tenantId\} locale=\{locale\} \/>/);
  assert.doesNotMatch(component, /hris_activate_candidate_employee|Activate employee|Employee number|Confirm joining date/);
  assert.match(component, /Employee conversion is on hold until employee status and role-mapping rules are approved/);
  assert.match(runner, /20261014100459_gate_candidate_employee_activation_until_policy_approval\.sql/);
  assert.match(runner, /\['recruitment manager', staff\[0\]\.client\]/);
  assert.match(runner, /was allowed to activate an employee/);
  assert.match(runner, /\['employee manager', staff\[3\]\.client\]/);
  assert.match(runner, /directEmployeeInsert\.error\?\.code === '42501'/);
  assert.match(runner, /const c1RestrictedTables = \[/);
  assert.match(runner, /candidate_application_stage_history[\s\S]*onboarding_handoffs/);
  assert.match(runner, /response\.error\?\.code === '42501'/);
  assert.match(runner, /c1_direct_denials=\$\{c1DirectDenied\}\/196/);
  assert.match(runner, /status === 'submitted_for_verification'/);
  assert.match(runner, /conversion remains pending policy approval/);
});

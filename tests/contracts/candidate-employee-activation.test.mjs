import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261014070848_hris_candidate_employee_activation.sql', import.meta.url), 'utf8');
const component = readFileSync(new URL('../../src/live/CandidatePreboardingQueue.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../src/live/LiveApp.tsx', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../../../HRIS-Candidate-v2/tests/candidate-application-local-e2e.mjs', import.meta.url), 'utf8');

test('candidate activation is tenant-scoped, permission-gated, same-identity, auditable, and retry-safe', () => {
  assert.match(migration, /auth\.uid\(\) IS NULL OR NOT public\.is_live_session\(\)/);
  assert.match(migration, /public\.has_tenant_permission\(p_tenant_id,'employees\.manage'\)/);
  assert.match(migration, /a\.id=p_application_id AND a\.tenant_id=p_tenant_id/);
  assert.match(migration, /v_candidate_user_id,v_employee_number/);
  assert.match(migration, /status='completed',employee_id=v_employee_id,verified_at=now\(\),verified_by=auth\.uid\(\)/);
  assert.match(migration, /stage='hired'/);
  assert.match(migration, /idempotent',true/);
  assert.match(migration, /ON public\.employees \(tenant_id, employee_number\)/);
  assert.match(migration, /ON public\.employees \(tenant_id, user_id\) WHERE user_id IS NOT NULL/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_activate_candidate_employee\(uuid,uuid,text,date\) FROM PUBLIC,anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.hris_activate_candidate_employee\(uuid,uuid,text,date\) TO authenticated,service_role/);
});

test('activation UI is limited to employee managers and the isolated journey proves denials and persistence', () => {
  assert.match(workspace, /if \(permissions\.employeesManage\) items\.push\(\{ id: 'onboarding', label: 'Onboarding'/);
  assert.match(workspace, /page === 'onboarding' && permissions\.employeesManage && <CandidatePreboardingQueue[^>]+canActivate/);
  assert.match(component, /rpc\('hris_activate_candidate_employee'/);
  assert.match(component, /Confirm joining date/);
  assert.match(runner, /\['recruitment manager', staff\[0\]\.client\]/);
  assert.match(runner, /was allowed to activate an employee/);
  assert.match(runner, /directEmployeeInsert\.error\?\.code === '42501'/);
  assert.match(runner, /status === 'submitted_for_verification'/);
  assert.match(runner, /idempotentActivation\.data\.idempotent === true/);
  assert.match(runner, /Personal Dashboard/);
});

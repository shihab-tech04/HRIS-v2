import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const employeeMigration = readFileSync(
  new URL('../../supabase/migrations/20261026060231_hris_employee_invitation.sql', import.meta.url), 'utf8',
);
const screeningMigration = readFileSync(
  new URL('../../supabase/migrations/20261026060240_candidate_screening_answer_validation.sql', import.meta.url), 'utf8',
);
const employeeFunction = readFileSync(
  new URL('../../supabase/functions/hris-employee-invite/index.ts', import.meta.url), 'utf8',
);
const employeeApi = readFileSync(new URL('../../src/live/employeeInvitationApi.ts', import.meta.url), 'utf8');
const employeeDirectory = readFileSync(new URL('../../src/live/OrganizationEmployeeDirectory.tsx', import.meta.url), 'utf8');
const liveApp = readFileSync(new URL('../../src/live/LiveApp.tsx', import.meta.url), 'utf8');
const isolatedFixture = readFileSync(new URL('../../tests/sql/isolated-auth/fixture.sql', import.meta.url), 'utf8');

test('employee role provisioning uses only the deployed roles columns', () => {
  const roleSetup = employeeMigration.match(/DO \$role\$[\s\S]*?\$role\$;/)?.[0];
  assert.ok(roleSetup, 'employee role setup block must exist');
  assert.match(isolatedFixture, /CREATE TABLE public\.roles \(\s*id text PRIMARY KEY,\s*name text NOT NULL,\s*active boolean NOT NULL DEFAULT true\s*\);/);
  assert.match(roleSetup, /UPDATE public\.roles\s+SET active = true\s+WHERE id = v_employee_role_id/);
  assert.match(roleSetup, /INSERT INTO public\.roles\(id, name, active\)/);
  assert.doesNotMatch(roleSetup, /\b(?:description|is_system|updated_at)\b/);
});

test('employee creation persists through an idempotent tenant permission RPC and private invitation ledger', () => {
  assert.match(employeeMigration, /CREATE TABLE IF NOT EXISTS private\.hris_employee_invitations/);
  assert.match(employeeMigration, /ALTER TABLE private\.hris_employee_invitations ENABLE ROW LEVEL SECURITY/);
  assert.match(employeeMigration, /REVOKE ALL ON TABLE private\.hris_employee_invitations FROM PUBLIC, anon, authenticated/);
  assert.match(employeeMigration, /UNIQUE \(tenant_id, request_id\)/);
  assert.match(employeeMigration, /This invitation request has expired/);
  assert.match(employeeMigration, /This invitation was already created with different employee details/);
  assert.match(employeeMigration, /hris_guard_employee_invitation_email/);
  assert.match(employeeMigration, /INSERT INTO public\.employees\s*\(\s*id, tenant_id,/);
  assert.match(employeeMigration, /gen_random_uuid\(\), p_tenant_id/);
  assert.match(employeeMigration, /public\.has_tenant_permission\(p_tenant_id, 'employees\.manage'\)/);
  assert.match(employeeMigration, /INSERT INTO public\.employees/);
  assert.match(employeeMigration, /lower\(u\.email\) = v_email/);
  assert.match(employeeMigration, /public\.hris_accept_employee_invitation/);
  assert.match(employeeMigration, /email_confirmed_at IS NOT NULL/);
  assert.match(employeeMigration, /INSERT INTO public\.tenant_memberships/);
  assert.match(employeeMigration, /'HRIS_EMPLOYEE_INVITATION_ACCEPTED'/);
  assert.match(employeeMigration, /CREATE OR REPLACE FUNCTION public\.hris_recover_employee_invitation_auth_user_id\(\s*p_invitation_id uuid/);
  assert.match(employeeMigration, /u\.invited_at IS NOT NULL[\s\S]*u\.created_at >= i\.created_at/);
  assert.match(employeeMigration, /GRANT EXECUTE ON FUNCTION public\.hris_recover_employee_invitation_auth_user_id\(uuid\)\s+TO service_role/);
  assert.match(employeeMigration, /GRANT EXECUTE ON FUNCTION public\.hris_mark_employee_invitation_sent\(uuid,uuid\)\s+TO service_role/);
  assert.match(employeeMigration, /GRANT EXECUTE ON FUNCTION public\.hris_mark_employee_invitation_failed\(uuid\)\s+TO service_role/);
  assert.match(employeeMigration, /REVOKE ALL ON FUNCTION public\.hris_mark_employee_invitation_sent\(uuid,uuid\)\s+FROM PUBLIC, anon, authenticated/);
  assert.match(employeeMigration, /REVOKE ALL ON FUNCTION public\.hris_mark_employee_invitation_failed\(uuid\)\s+FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(employeeMigration, /GRANT\s+INSERT\s+ON\s+TABLE\s+public\.employees/i);
});

test('Auth invitation is sent only from the server-side function, with a signed-in caller and no client service key', () => {
  assert.match(employeeFunction, /caller\.auth\.getUser\(\)/);
  assert.match(employeeFunction, /caller\.rpc\("hris_create_employee_invitation"/);
  assert.match(employeeFunction, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.match(employeeFunction, /admin\.auth\.admin\.inviteUserByEmail/);
  assert.match(employeeFunction, /\[\^\\s@\]\+@\[\^\\s@\]\+\\\./);
  assert.match(employeeFunction, /employee_invitation/);
  assert.match(employeeFunction, /hris_mark_employee_invitation_sent/);
  assert.match(employeeFunction, /hris_recover_employee_invitation_auth_user_id/);
  assert.ok(employeeFunction.indexOf('hris_recover_employee_invitation_auth_user_id')
    < employeeFunction.indexOf('inviteUserByEmail'));
  assert.match(employeeFunction, /const retryMark = await admin\.rpc\("hris_mark_employee_invitation_sent"/);
  assert.match(employeeApi, /supabase\.functions\.invoke\('hris-employee-invite'/);
  assert.match(employeeApi, /supabase\.rpc\('hris_accept_employee_invitation'/);
  assert.match(employeeDirectory, /Save employee and send invitation/);
  assert.match(employeeDirectory, /employeeInvitationAttempted \|\| employeeInvitationBusy/);
  assert.match(liveApp, /activeMembershipTenantIds\.has\(e\.tenant_id\)/);
  assert.match(liveApp, /setView\('employee'\)/);
});

test('candidate application validates all seven screening types and keeps candidate and job tenant checks', () => {
  for (const type of ['short_text', 'long_text', 'number', 'yes_no', 'single_select', 'multi_select', 'date']) {
    assert.ok(screeningMigration.includes(`'${type}'`), `missing server type ${type}`);
  }
  assert.match(screeningMigration, /tenant_id=public\.synesis_tenant_id\(\)/);
  assert.match(screeningMigration, /tenant_id=public\.synesis_tenant_id\(\)[\s\S]*profile_status='active'/);
  assert.match(screeningMigration, /is_published=true[\s\S]*status='published'[\s\S]*is_active=true/);
  assert.match(screeningMigration, /Duplicate screening answers are not allowed/);
  assert.match(screeningMigration, /INSERT INTO public\.job_applications\s*\(\s*id,tenant_id,/);
  assert.match(screeningMigration, /gen_random_uuid\(\),v_job\.tenant_id/);
  assert.match(screeningMigration, /unknown question/);
  assert.match(screeningMigration, /single-select answer is not an available option/);
  assert.match(screeningMigration, /multi-select answer is not an available option/);
  assert.match(screeningMigration, /Duplicate multi-select answers are not allowed/);
  assert.match(screeningMigration, /All required screening questions must be answered/);
  assert.match(screeningMigration, /Both candidate declarations are required/);
  assert.match(screeningMigration, /candidate_cvs/);
  assert.match(screeningMigration, /candidate-documents/);
  assert.match(screeningMigration, /candidate_application_drafts/);
});

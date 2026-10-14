import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261013130829_hris_recruitment_pipeline_read.sql', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../src/live/RecruitmentPipeline.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../src/live/LiveApp.tsx', import.meta.url), 'utf8');
const isolatedRunner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');

test('recruitment RPC requires live session, active tenant, and active membership permission', () => {
  assert.match(migration, /public\.is_live_session\(\)/);
  assert.match(migration, /public\.tenants t WHERE t\.id=p_tenant_id AND t\.is_active IS TRUE/);
  assert.match(migration, /hris_admin_can_read_tenant\(p_tenant_id, 'recruitment\.view'\)[\s\S]*?hris_admin_can_read_tenant\(p_tenant_id, 'recruitment\.manage'\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_get_recruitment_pipeline[^;]* FROM PUBLIC,anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.hris_get_recruitment_pipeline[^;]* TO authenticated,service_role/);
  assert.match(isolatedRunner, /Recruitment pipeline rejects no-permission, global-only and anonymous callers/);
  assert.match(isolatedRunner, /Recruitment pipeline immediately denies an inactive membership/);
  assert.match(isolatedRunner, /Recruitment pipeline isolates tenant A and tenant B records/);
});

test('recruitment payload omits private application data and reviewer notes', () => {
  assert.match(migration, /'candidate_name',p\.candidate_name/);
  assert.match(migration, /'milestones',COALESCE/);
  assert.match(migration, /jsonb_build_object\('stage',h\.stage,'created_at',h\.created_at\)/);
  for (const privateField of ['email', 'phone', 'cv_url', 'cover_letter', 'status_note', 'application_data', 'actor_user_id', 'h.note']) {
    assert.doesNotMatch(migration, new RegExp(`\\b${privateField.replace('.', '\\.') }\\b`));
  }
  assert.match(isolatedRunner, /private-reviewer-note-a/);
  assert.match(isolatedRunner, /private-screening-answer-a/);
});

test('recruitment UI uses the tenant RPC with search, stage filter, pagination, timeline, and recovery', () => {
  assert.match(page, /rpc\('hris_get_recruitment_pipeline'/);
  assert.match(page, /p_tenant_id: requestTenantId/);
  assert.match(page, /p_search: submittedSearch \|\| null/);
  assert.match(page, /p_stage: stage \|\| null/);
  assert.match(page, /Filter candidate applications by stage/);
  assert.match(page, /View candidate-visible milestones/);
  assert.match(page, /Retry/);
  assert.match(page, /No applications found/);
  assert.match(app, /'recruitment\.view', 'recruitment\.manage'/);
  assert.match(app, /recruitment: grants\.get\('recruitment\.view'\) === true \|\| grants\.get\('recruitment\.manage'\) === true/);
  assert.match(workspace, /id: 'recruitment', label: 'Candidate pipeline'/);
  assert.match(workspace, /<RecruitmentPipeline tenantId=\{tenantId\} locale=\{locale\} canActivateEmployees=\{permissions\.employeesManage\} canManagePreboarding=\{permissions\.recruitmentManage\} canManageOffers=\{permissions\.recruitmentManage\} canManageApplicationStages=\{permissions\.recruitmentManage\} \/>/);
  assert.match(app, /recruitmentManage: grants\.get\('recruitment\.manage'\) === true/);
});

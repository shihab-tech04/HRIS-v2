import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261014012249_recruiter_application_stage_transition.sql', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../src/live/RecruitmentPipeline.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../sql/isolated-auth/run-recruitment-browser.mjs', import.meta.url), 'utf8');
const rejectionBrowser = readFileSync(new URL('../sql/isolated-auth/run-recruitment-stage-rejection-browser.mjs', import.meta.url), 'utf8');

test('recruiter stage transitions are authenticated, tenant-scoped, locked, and history-backed', () => {
  assert.match(migration, /auth\.uid\(\) IS NULL OR NOT public\.is_live_session\(\)/);
  assert.match(migration, /public\.has_tenant_permission\(p_tenant_id, 'recruitment\.manage'\)/);
  assert.match(migration, /public\.tenants t WHERE t\.id = p_tenant_id AND t\.is_active IS TRUE/);
  assert.match(migration, /JOIN public\.jobs j ON j\.id = a\.job_id AND j\.tenant_id = a\.tenant_id/);
  assert.match(migration, /FOR UPDATE OF a/);
  assert.match(migration, /v_stage NOT IN \('under_review', 'screening', 'rejected'\)/);
  assert.match(migration, /v_application\.stage IN \('withdrawn', 'rejected', 'offer_extended', 'offer_accepted', 'offer_declined', 'hired'\)/);
  assert.match(migration, /INSERT INTO public\.candidate_application_stage_history/);
  assert.match(migration, /'recruiter', auth\.uid\(\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_update_candidate_application_stage[^;]* FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.hris_update_candidate_application_stage[^;]* TO authenticated, service_role/);
  assert.match(runner, /Recruiter stage transitions deny unauthorized, cross-tenant, invalid, and regressive updates/);
  assert.match(runner, /Recruiter stage transitions persist one sanitized history event per accepted change/);
});

test('recruitment manager UI confirms rejection and persists review/screening updates through the RPC', () => {
  assert.match(page, /rpc\('hris_update_candidate_application_stage'/);
  assert.match(page, /Next application stage for \$\{application\.candidate_name\}/);
  assert.match(page, /role="alertdialog" aria-label="Confirm application rejection"/);
  assert.match(page, /Cancel/);
  assert.match(page, /Confirm rejection/);
  assert.match(page, /role="alert"/);
  assert.match(page, /role="status"/);
  assert.match(page, /result\.history_id/);
  assert.match(page, /result\.created_at/);
  assert.match(workspace, /canManageApplicationStages=\{permissions\.recruitmentManage\}/);
  assert.match(browser, /Update application progress/);
  assert.match(browser, /mobile\+desktop refresh recovery passed/);
  assert.match(rejectionBrowser, /Confirm application rejection/);
  assert.match(rejectionBrowser, /Cancelling rejection unexpectedly wrote a stage transition/);
  assert.match(runner, /candidateReplacementResponse\.data\?\.response === 'confirmed'/);
  assert.match(runner, /Recruiter rejection confirmation is cancellable and persists only after confirmation/);
  assert.match(rejectionBrowser, /after candidate confirmation/);
  assert.match(runner, /run-recruitment-stage-rejection-browser\.mjs/);
});

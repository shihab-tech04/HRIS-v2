import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261016081154_hris_candidate_interview_completion.sql', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../src/live/RecruitmentPipeline.tsx', import.meta.url), 'utf8');
const locale = readFileSync(new URL('../../src/live/candidate-interview-locale.ts', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../sql/isolated-auth/run-interview-completion-browser.mjs', import.meta.url), 'utf8');

test('interview completion is a tenant-locked recruiter action with an idempotent candidate history event', () => {
  assert.match(migration, /FUNCTION public\.hris_complete_candidate_interview\(\s*p_tenant_id uuid,\s*p_interview_id uuid/s);
  assert.match(migration, /public\.has_tenant_permission\(p_tenant_id,'recruitment\.manage'\)/);
  assert.match(migration, /FOR UPDATE OF i,a/);
  assert.match(migration, /v_interview_status='completed'[\s\S]*?'changed',false/);
  assert.match(migration, /v_candidate_response IS DISTINCT FROM 'confirmed'/);
  assert.match(migration, /v_application_stage IS DISTINCT FROM 'interview_scheduled'/);
  assert.match(migration, /'interview_completed'/);
  assert.match(migration, /actor_type,actor_user_id,created_at[\s\S]*?'recruitment',auth\.uid\(\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_complete_candidate_interview\(uuid,uuid\)[\s\S]*?FROM PUBLIC,anon,authenticated,service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.hris_complete_candidate_interview\(uuid,uuid\) TO authenticated/);
  assert.doesNotMatch(migration, /score|rubric|rating|threshold/i);
});

test('recruiter response projection keeps completed rows and internal notes server-scoped', () => {
  assert.match(migration, /'panel_notes',i\.panel_notes,'interview_status',i\.status/);
  assert.match(migration, /WHERE i\.status IN \('scheduled','completed'\)/);
  assert.match(migration, /public\.has_tenant_permission\(p_tenant_id,'recruitment\.manage'\)/);
  assert.match(migration, /WHERE i\.id=p_interview_id AND i\.status IN \('scheduled','completed'\)/);
  assert.match(runner, /20261016081154_hris_candidate_interview_completion\.sql/);
});

test('manager completion UI supports error retry, persistent status, mobile/desktop and EN/BN copy', () => {
  assert.match(ui, /rpc\('hris_complete_candidate_interview'/);
  assert.match(ui, /row\.interview_status === 'scheduled' && row\.candidate_response === 'confirmed'/);
  assert.match(ui, /Interview completion could not be saved/);
  assert.match(ui, /interview_status: 'completed'/);
  assert.match(locale, /'Mark interview complete': '[^']+'/);
  assert.match(locale, /'Interview completed\. The application is under evaluation\.': '[^']+'/);
  assert.match(browser, /failNextCompletion = true/);
  assert.match(browser, /Switch language to Bengali/);
  assert.match(browser, /375px/);
  assert.match(browser, /1280px/);
});

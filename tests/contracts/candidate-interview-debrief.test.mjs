import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../supabase/migrations/20261014153343_hris_candidate_interview_panel_debrief.sql', import.meta.url), 'utf8');
const interviewWorkflow = readFileSync(new URL('../../supabase/migrations/20261013221500_hris_candidate_interview_journey.sql', import.meta.url), 'utf8');
const candidateContext = readFileSync(new URL('../../supabase/migrations/20261013113718_hris_candidate_context_active_profile_tenant_scope.sql', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../src/live/RecruitmentPipeline.tsx', import.meta.url), 'utf8');
const fixture = readFileSync(new URL('../sql/isolated-auth/recruitment-fixture.sql', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../sql/isolated-auth/run-recruitment-browser.mjs', import.meta.url), 'utf8');

test('manager interview response projection is active-tenant scoped and keeps notes out of the candidate projection', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.hris_get_candidate_interview_responses\(p_tenant_id uuid\)/);
  assert.match(migration, /has_tenant_permission\(p_tenant_id,'recruitment\.manage'\)/);
  assert.match(migration, /'panel_notes',i\.panel_notes/);
  assert.match(migration, /JOIN public\.job_applications a ON a\.id=i\.application_id AND a\.tenant_id=p_tenant_id/);
  assert.match(candidateContext, /to_jsonb\(x\) - 'panel_notes' - 'created_by'/);
});

test('panel-note writes require a live authorized session, tenant-matched scheduled interview, bounded input, and lock', () => {
  const save = migration.slice(migration.indexOf('FUNCTION public.hris_save_candidate_interview_panel_notes'));
  assert.match(save, /auth\.uid\(\) IS NULL OR NOT public\.is_live_session\(\)/);
  assert.match(save, /has_tenant_permission\(p_tenant_id,'recruitment\.manage'\)/);
  assert.match(save, /length\(COALESCE\(v_notes,''\)\) > 4000/);
  assert.match(save, /a\.tenant_id=p_tenant_id/);
  assert.match(save, /j\.tenant_id=p_tenant_id/);
  assert.match(save, /WHERE i\.id=p_interview_id AND i\.status='scheduled'/);
  assert.match(save, /FOR UPDATE OF i/);
  assert.match(save, /UPDATE public\.interviews i SET panel_notes=v_notes WHERE i\.id=v_interview_id/);
  assert.match(save, /REVOKE ALL ON FUNCTION public\.hris_save_candidate_interview_panel_notes\(uuid,uuid,text\) FROM PUBLIC,anon,authenticated/);
  assert.match(save, /GRANT EXECUTE ON FUNCTION public\.hris_save_candidate_interview_panel_notes\(uuid,uuid,text\) TO authenticated/);
});

test('interview debrief UI supports private note editing, cancellation, retry, refresh, and EN/BN copy', () => {
  assert.match(ui, /hris_save_candidate_interview_panel_notes/);
  assert.match(ui, /data-interview-id=\{row\.id\}/);
  assert.match(ui, /setPanelNotesDraft\(row\.panel_notes \|\| ''\)/);
  assert.match(ui, /function cancelEditingNotes\(\)/);
  assert.match(ui, /Your text is kept here; retry or refresh the interview responses/);
  assert.match(ui, /maxLength=\{4000\}/);
  assert.match(ui, /Refresh interview responses/);
  assert.match(ui, /locale=\{locale\}/);
  assert.match(ui, /candidateInterviewText\(locale, text\)/);
});

test('isolated acceptance uses disposable Auth/Postgres rows and a real browser for schedule, owner response, and note privacy', () => {
  assert.match(fixture, /CREATE TABLE public\.interviews/);
  assert.match(fixture, /ALTER TABLE public\.interviews ENABLE ROW LEVEL SECURITY/);
  assert.match(fixture, /REVOKE ALL PRIVILEGES ON TABLE[\s\S]*?public\.interviews[\s\S]*?FROM PUBLIC,anon,authenticated/);
  assert.match(runner, /20261013221500_hris_candidate_interview_journey\.sql/);
  assert.match(runner, /20261014153343_hris_candidate_interview_panel_debrief\.sql/);
  assert.match(runner, /candidate owner confirms it, and other tenant identities are denied/);
  assert.match(runner, /Private interview notes require active same-tenant recruitment management and server-side validation/);
  assert.match(runner, /Recruitment manager debrief saves through the tenant RPC, survives refresh, and stays hidden from candidate table reads/);
  assert.match(browser, /failNextPanelNotesSave = true/);
  assert.match(browser, /Cancel left the internal interview note form open/);
  assert.match(browser, /failed save did not preserve the panel note draft/i);
  assert.match(browser, /Switch language to Bengali/);
  assert.match(browser, /Bengali interview debrief desktop/);
});

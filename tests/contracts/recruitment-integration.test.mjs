import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const pipeline = readFileSync('src/live/RecruitmentPipeline.tsx', 'utf8');
const assessments = readFileSync('src/live/CandidateAssessments.tsx', 'utf8');
const recruitmentUi = `${pipeline}\n${assessments}`;
const workspace = readFileSync('src/live/LiveHrisWorkspace.tsx', 'utf8');
const app = readFileSync('src/live/LiveApp.tsx', 'utf8');
const migrations = readdirSync('supabase/migrations')
  .filter(file => file.endsWith('.sql'))
  .map(file => readFileSync(path.join('supabase/migrations', file), 'utf8'))
  .join('\n');
const recruitmentRead = readFileSync('supabase/migrations/20261013130829_hris_recruitment_pipeline_read.sql', 'utf8');
const stageTransition = readFileSync('supabase/migrations/20261014012249_recruiter_application_stage_transition.sql', 'utf8');

 test('recruiter reads use an active tenant permission and a minimized server projection', () => {
  assert.match(app, /supabase\.rpc\('has_tenant_permission',\s*\{\s*p_tenant_id:\s*membership\.tenant_id/);
  assert.match(app, /'recruitment\.view',\s*'recruitment\.manage'/);
  assert.match(pipeline, /rpc\('hris_get_recruitment_pipeline',\s*\{\s*p_tenant_id:\s*requestTenantId/);
  assert.match(workspace, /page === 'recruitment' && permissions\.recruitment/);
  assert.match(recruitmentRead, /public\.is_live_session\(\)/);
  assert.match(recruitmentRead, /public\.hris_admin_can_read_tenant\(p_tenant_id, 'recruitment\.view'\)/);
  assert.doesNotMatch(recruitmentRead, /'cv_url'|'cover_letter'|'application_data'|'review_note'|'reviewed_by'/);
  assert.doesNotMatch(pipeline, /\.from\(['"](?:job_applications|candidates|candidate_profiles)['"]\)/);
});

test('application stage transitions use the tenant-locked audit RPC and manager gate', () => {
  assert.match(pipeline, /rpc\('hris_update_candidate_application_stage',\s*\{\s*p_tenant_id:\s*tenantId,\s*p_application_id:\s*application\.application_id,\s*p_stage:\s*nextStage/);
  assert.match(pipeline, /canManageApplicationStages && <ApplicationStageForm/);
  assert.match(stageTransition, /public\.has_tenant_permission\(p_tenant_id, 'recruitment\.manage'\)/);
  assert.match(stageTransition, /FOR UPDATE/);
  assert.match(stageTransition, /candidate_application_stage_history/);
  assert.match(pipeline, /'under_review'/);
  assert.match(pipeline, /'screening'/);
  assert.match(pipeline, /'rejected'/);
});

test('interview scheduling, completion, panel notes, and assessment reviews persist through tenant RPCs', () => {
  for (const rpc of [
    'hris_schedule_candidate_interview',
    'hris_complete_candidate_interview',
    'hris_save_candidate_interview_panel_notes',
    'hris_get_candidate_interview_responses',
    'hris_assign_candidate_assessment',
    'hris_review_candidate_assessment',
  ]) assert.ok(recruitmentUi.includes(`rpc('${rpc}'`), `missing UI RPC ${rpc}`);
  for (const rpc of [
    'hris_schedule_candidate_interview',
    'hris_complete_candidate_interview',
    'hris_save_candidate_interview_panel_notes',
    'hris_get_candidate_interview_responses',
    'hris_assign_candidate_assessment',
    'hris_review_candidate_assessment',
  ]) assert.ok(migrations.includes(`FUNCTION public.${rpc}(`), `missing SQL RPC ${rpc}`);
  assert.match(pipeline, /Interview responses/);
  assert.match(pipeline, /Internal panel notes/);
  assert.match(assessments, /tx\('Candidate submission'\)/);
});

test('recruitment pipeline omits candidate files and reviewer-private history fields', () => {
  assert.doesNotMatch(recruitmentRead, /'cv_url'|'document_url'|'cover_letter'|'application_data'|'review_note'|'reviewed_by'|'actor_user_id'/);
  assert.doesNotMatch(pipeline, /createSignedUrl\(|getPublicUrl\(|cv_url|cover_letter|application_data/);
  assert.match(recruitmentRead, /'milestones'[\s\S]*?'stage'[\s\S]*?'created_at'/);
});

test('recruitment workspace visibility and mutations use the selected active-tenant permission set', () => {
  assert.match(app, /supabase\.rpc\('has_tenant_permission',\s*\{\s*p_tenant_id:\s*membership\.tenant_id/);
  assert.match(app, /recruitment:\s*grants\.get\('recruitment\.view'\) === true \|\| grants\.get\('recruitment\.manage'\) === true/);
  assert.match(app, /recruitmentManage:\s*grants\.get\('recruitment\.manage'\) === true/);
  assert.match(workspace, /if \(permissions\.recruitment\) items\.push\(\{ id: 'recruitment'/);
  assert.match(workspace, /canManageApplicationStages=\{permissions\.recruitmentManage\}/);
});

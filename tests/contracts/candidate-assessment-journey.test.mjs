import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261013170556_hris_candidate_assessment_journey.sql', import.meta.url), 'utf8');
const privileges = readFileSync(new URL('../../supabase/migrations/20261013052128_hris_candidate_c1_revoke_direct_table_access.sql', import.meta.url), 'utf8');
const mainPage = readFileSync(new URL('../../src/live/RecruitmentPipeline.tsx', import.meta.url), 'utf8');
const mainUi = readFileSync(new URL('../../src/live/CandidateAssessments.tsx', import.meta.url), 'utf8');
const candidatePage = readFileSync(new URL('../../../HRIS-Candidate-v2/src/pages/TasksPage.tsx', import.meta.url), 'utf8');
const candidateApi = readFileSync(new URL('../../../HRIS-Candidate-v2/src/lib/api.ts', import.meta.url), 'utf8');
const candidateAdapter = readFileSync(new URL('../../../HRIS-Candidate-v2/src/lib/recruitmentAdapters.ts', import.meta.url), 'utf8');

test('assessment assignment, candidate submission and review are server-enforced and tenant-bound', () => {
  assert.match(migration, /public\.has_tenant_permission\(p_tenant_id, 'recruitment\.manage'\)/);
  assert.match(migration, /a\.candidate_user_id = auth\.uid\(\)/);
  assert.match(migration, /cp\.tenant_id = a\.tenant_id AND cp\.profile_status = 'active'/);
  assert.match(migration, /FOR UPDATE OF ca/);
  assert.match(migration, /v_status IS DISTINCT FROM 'pending'/);
  assert.match(migration, /v_assessment\.status IS DISTINCT FROM 'submitted'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.candidate_submit_assessment\(uuid,jsonb\) FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.candidate_submit_assessment\(uuid,jsonb\) TO authenticated, service_role/);
  assert.match(privileges, /public\.candidate_assessments[\s\S]*?FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /submission_data = v_submission, submitted_at = now\(\)/);
  assert.match(migration, /reviewed_by = auth\.uid\(\), reviewed_at = now\(\)/);
});

test('recruitment managers assign and review while candidates receive owner-scoped task state', () => {
  assert.match(mainPage, /<CandidateAssessmentAssignment/);
  assert.match(mainPage, /<CandidateAssessmentQueue/);
  assert.match(mainUi, /rpc\('hris_assign_candidate_assessment'/);
  assert.match(mainUi, /rpc\('hris_get_candidate_assessments'/);
  assert.match(mainUi, /rpc\('hris_review_candidate_assessment'/);
  assert.match(candidateApi, /rpc\('candidate_submit_assessment'/);
  assert.match(candidateAdapter, /adaptLiveAssessment/);
  assert.match(candidateAdapter, /assessments: asRows\(ctx\.assessments\)\.map\(adaptLiveAssessment\)/);
  assert.match(candidatePage, /Review Complete/);
  assert.match(candidatePage, /aria-modal="true"/);
});

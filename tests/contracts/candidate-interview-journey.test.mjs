import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261013221500_hris_candidate_interview_journey.sql', import.meta.url), 'utf8');
const mainPage = readFileSync(new URL('../../src/live/RecruitmentPipeline.tsx', import.meta.url), 'utf8');
const candidatePage = readFileSync(new URL('../../../HRIS-Candidate-v2/src/pages/InterviewsPage.tsx', import.meta.url), 'utf8');
const candidateApi = readFileSync(new URL('../../../HRIS-Candidate-v2/src/lib/api.ts', import.meta.url), 'utf8');
const adapter = readFileSync(new URL('../../../HRIS-Candidate-v2/src/lib/recruitmentAdapters.ts', import.meta.url), 'utf8');

test('interview scheduling and responses are tenant-bound server RPCs with candidate identity and private rows', () => {
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.interviews FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /public\.has_tenant_permission\(p_tenant_id,'recruitment\.manage'\)/);
  assert.match(migration, /a\.tenant_id=p_tenant_id/);
  assert.match(migration, /a\.candidate_user_id=auth\.uid\(\) AND a\.tenant_id=v_tenant_id/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /candidate_response='reschedule_requested'/);
  assert.match(migration, /candidate_response='invited'/);
  assert.match(migration, /i\.status='scheduled'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.candidate_respond_interview[^;]* FROM PUBLIC,anon/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_get_candidate_interview_responses[^;]* FROM PUBLIC,anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.candidate_respond_interview[^;]* TO authenticated/);
});

test('Main schedules and displays HR interview responses while Candidate acts on owner-scoped invitations', () => {
  assert.match(mainPage, /rpc\('hris_schedule_candidate_interview'/);
  assert.match(mainPage, /rpc\('hris_get_candidate_interview_responses'/);
  assert.match(mainPage, /Date and time \(organization time zone\)/);
  assert.match(mainPage, /Offer another time/);
  assert.match(candidateApi, /rpc\('candidate_respond_interview'/);
  assert.match(candidatePage, /Request Reschedule/);
  assert.match(candidatePage, /Accept Invitation/);
  assert.match(candidatePage, /Your proposed availability/);
  assert.match(adapter, /formatSuffix/);
  assert.match(adapter, /timezone: asText\(row\.timezone\)/);
});

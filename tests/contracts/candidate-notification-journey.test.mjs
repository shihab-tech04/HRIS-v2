import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261015050029_candidate_application_update_notifications.sql', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../../supabase/migrations/20261014012249_recruiter_application_stage_transition.sql', import.meta.url), 'utf8');
const interview = readFileSync(new URL('../../supabase/migrations/20261013221500_hris_candidate_interview_journey.sql', import.meta.url), 'utf8');
const offer = readFileSync(new URL('../../supabase/migrations/20261013132335_hris_recruitment_offer_issue.sql', import.meta.url), 'utf8');
const activation = readFileSync(new URL('../../supabase/migrations/20261014070848_hris_candidate_employee_activation.sql', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const c1Fixture = readFileSync(new URL('../sql/candidate-c1/tenant-fixture.sql', import.meta.url), 'utf8');
const c1Runner = readFileSync(new URL('../sql/candidate-c1/run-local-tenant-auth.mjs', import.meta.url), 'utf8');
const c1Verification = readFileSync(new URL('../sql/candidate-c1/verify.sql', import.meta.url), 'utf8');

test('recruitment events create one candidate-owned notification per history row', () => {
  assert.match(migration, /related_stage_history_id uuid/);
  assert.match(migration, /candidate_notifications_stage_history_uidx/);
  assert.match(migration, /AFTER INSERT ON public\.candidate_application_stage_history/);
  assert.match(migration, /NEW\.actor_type <> 'recruitment'/);
  assert.match(migration, /related_application_id,related_job_id,action_view,related_stage_history_id/);
  assert.match(migration, /'application_update'/);
  assert.match(migration, /ON CONFLICT \(related_stage_history_id\)[\s\S]*?DO NOTHING/);
  assert.doesNotMatch(migration, /NEW\.note|actor_user_id.*candidate_notifications/);
});

test('notification reads and read-state updates are owner-scoped and client insertion is revoked', () => {
  assert.match(migration, /ALTER TABLE public\.candidate_notifications ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.candidate_notifications FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /GRANT SELECT,UPDATE\(is_read\)[\s\S]*TO authenticated/);
  assert.match(migration, /candidate_notifications_read_own[\s\S]*?candidate_user_id=\(SELECT auth\.uid\(\)\)/);
  assert.match(migration, /candidate_notifications_update_own[\s\S]*?WITH CHECK \(candidate_user_id=\(SELECT auth\.uid\(\)\)\)/);
  assert.match(runner, /Recruitment stage events create one private owner notification without leaking notes or crossing tenants/);
  assert.match(runner, /Candidates cannot create notifications; only the owner can update the existing read state/);
  assert.match(c1Fixture, /actor_type text NOT NULL CHECK \(actor_type = ANY \(ARRAY\['candidate','recruitment','system'\]/);
  assert.match(c1Runner, /'recruitment',\$\{sql\(staffId\)\}/);
  assert.match(c1Runner, /path\.join\(here, 'verify\.sql'\)/);
  assert.match(c1Verification, /c\.relrowsecurity/);
  assert.match(c1Verification, /acl\.grantee=0[\s\S]*?acl\.privilege_type='SELECT'/);
});

test('recruitment event actor labels match the accepted database constraint', () => {
  for (const source of [stage, interview, offer, activation]) assert.match(source, /'recruitment',\s*auth\.uid\(\)/);
  assert.match(migration, /'submitted','under_review','screening'/);
  assert.match(migration, /'interview_scheduled'/);
  assert.match(migration, /'offer_extended'/);
});

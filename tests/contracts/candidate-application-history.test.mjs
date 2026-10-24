import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261014150000_hris_candidate_initial_application_history.sql', import.meta.url), 'utf8');
const context = readFileSync(new URL('../../supabase/migrations/20261013113718_hris_candidate_context_active_profile_tenant_scope.sql', import.meta.url), 'utf8');
const contextExecute = readFileSync(new URL('../../supabase/migrations/20261016092922_candidate_context_authenticated_execute.sql', import.meta.url), 'utf8');
const isolatedRunner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const isolatedRecruitmentFixture = readFileSync(new URL('../sql/isolated-auth/recruitment-fixture.sql', import.meta.url), 'utf8');
const canonicalBytes = readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url));
const canonical = JSON.parse(canonicalBytes.toString('utf8'));

test('candidate submission writes one owner-bound initial stage-history event transactionally', () => {
  assert.match(migration, /AFTER INSERT ON public\.job_applications/);
  assert.match(migration, /auth\.uid\(\) IS DISTINCT FROM NEW\.candidate_user_id/);
  assert.match(migration, /INSERT INTO public\.candidate_application_stage_history/);
  assert.match(migration, /COALESCE\(NULLIF\(NEW\.stage, ''\), 'applied'\)/);
  assert.match(migration, /'Application submitted\.', 'candidate', auth\.uid\(\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_record_candidate_application_submission\(\)[\s\S]+FROM PUBLIC, anon, authenticated/);
});

test('candidate context returns persisted application history without recruiter-private notes or identities', () => {
  assert.match(context, /jsonb_agg\(\(\(to_jsonb\(h\) - 'note' - 'actor_user_id'\)[\s\S]+?stage_history/);
  assert.match(context, /CASE WHEN h\.actor_type='candidate' THEN jsonb_build_object\('note',h\.note\)/);
  assert.match(context, /ORDER BY h\.created_at/);
});

test('candidate context RPC is authenticated-only and isolated acceptance verifies real candidate projection privacy', () => {
  assert.match(contextExecute, /REVOKE ALL ON FUNCTION public\.candidate_get_recruitment_context\(\) FROM PUBLIC, anon/);
  assert.match(contextExecute, /GRANT EXECUTE ON FUNCTION public\.candidate_get_recruitment_context\(\) TO authenticated, service_role/);
  const contextMigrationAt = isolatedRunner.indexOf('20261013113718_hris_candidate_context_active_profile_tenant_scope.sql');
  const executeMigrationAt = isolatedRunner.indexOf('20261016092922_candidate_context_authenticated_execute.sql');
  assert.ok(contextMigrationAt >= 0 && executeMigrationAt > contextMigrationAt,
    'The isolated Auth/Postgres runner installs the real context RPC before its access restriction.');
  assert.match(isolatedRecruitmentFixture, /CREATE TABLE public\.candidate_published_jobs/);
  assert.match(isolatedRecruitmentFixture, /CREATE TABLE public\.candidate_document_requests/);
  assert.match(isolatedRecruitmentFixture, /CREATE TABLE public\.job_offers/);
  assert.match(isolatedRunner, /anonymousCandidateContext\.error\?\.code === '42501'/);
  assert.match(isolatedRunner, /candidateContextAclLeastPrivilege/);
  assert.match(isolatedRunner, /candidateProjectionOmitsOtherTenantApplication/);
});

test('candidate private-history acceptance maps the exact recovered CA15-06, CA18-05, and X02-09 stories', () => {
  assert.equal(createHash('sha256').update(canonicalBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  const requirements = new Map(canonical.stories
    .filter(story => ['CA15-06', 'CA18-05', 'X02-09'].includes(story.story_id))
    .map(story => [story.story_id, story.verbatim_requirement]));
  assert.deepEqual(requirements, new Map([
    ['CA15-06', 'As a candidate, I want internal recruiter notes hidden.'],
    ['CA18-05', 'As a candidate, I want internal recruitment discussions hidden.'],
    ['X02-09', 'Internal notes remain private.'],
  ]));
  assert.match(isolatedRunner, /candidateProjectionOmitsPrivateHistoryFields/);
  assert.match(isolatedRunner, /candidateProjectionOmitsPanelDebrief/);
  assert.match(isolatedRunner, /Interview completion persists one recruiter-attributed history event[\s\S]+?exposes only the candidate-safe stage/);
});

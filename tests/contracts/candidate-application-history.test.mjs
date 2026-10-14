import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261014150000_hris_candidate_initial_application_history.sql', import.meta.url), 'utf8');
const context = readFileSync(new URL('../../supabase/migrations/20261013113718_hris_candidate_context_active_profile_tenant_scope.sql', import.meta.url), 'utf8');

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

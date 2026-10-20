import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../', import.meta.url);
const probe = readFileSync(new URL('tests/sql/hosted-parity/hris-required-rpc-presence.sql', root), 'utf8');
const sources = [
  '20261014171952_employee_contact_details_editing.sql',
  '20261013130829_hris_recruitment_pipeline_read.sql',
  '20261014012249_recruiter_application_stage_transition.sql',
  '20261013132335_hris_recruitment_offer_issue.sql',
  '20261013221500_hris_candidate_interview_journey.sql',
  '20261016081154_hris_candidate_interview_completion.sql',
].map(name => readFileSync(new URL(`supabase/migrations/${name}`, root), 'utf8')).join('\n');

const required = [
  'hris_get_tenant_employee_contact_details',
  'hris_update_tenant_employee_contact_details',
  'hris_get_recruitment_pipeline',
  'hris_update_candidate_application_stage',
  'hris_issue_candidate_offer',
  'hris_schedule_candidate_interview',
  'hris_get_candidate_interview_responses',
  'hris_save_candidate_interview_panel_notes',
  'hris_complete_candidate_interview',
];

test('hosted HR01/Candidate RPC probe includes exactly the nine source-backed entrypoints', () => {
  assert.equal((probe.match(/'public\.hris_[a-z_]+\(/g) ?? []).length, required.length);
  for (const name of required) {
    assert.match(sources, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\s*\\(`));
    assert.ok(probe.includes(`public.${name}(`), `missing hosted contract probe for ${name}`);
  }
});

test('RPC release preflight remains read-only and denies anonymous execution', () => {
  assert.match(probe, /to_regprocedure\(signature\)/);
  assert.match(probe, /has_function_privilege\('authenticated'/);
  assert.match(probe, /has_function_privilege\('anon'/);
  assert.match(probe, /NOT COALESCE\(has_function_privilege\('anon'/);
  assert.doesNotMatch(probe, /(?:^|\n)\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO|EXECUTE)\s/i);
});

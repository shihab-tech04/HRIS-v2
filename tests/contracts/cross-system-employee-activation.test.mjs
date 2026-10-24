import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const catalogue = JSON.parse(read('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json'));
const overlay = JSON.parse(read('../../docs/programme/USER_STORY_ACCEPTANCE_OVERLAY.json'));
const story = (id) => catalogue.stories.find((item) => item.story_id === id);
const runtime = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-hr01-01-employee-creation-browser.mjs');

test('X03-07 and X03-08 map to the exact canonical employee activation and candidate reuse stories', () => {
  assert.equal(story('X03-07')?.verbatim_requirement, 'Employee record is created/activated.');
  assert.equal(story('X03-08')?.verbatim_requirement, 'Candidate information is reused.');
  assert.match(runtime, /record\('X03-07 partial: HR activates the accepted-offer candidate as an active employee through the existing onboarding handoff'/);
  assert.match(runtime, /record\('X03-08 partial: HR activation reuses the candidate name, email, and Auth identity in the employee record'/);
  assert.ok(runtime.includes("hr0101Employee?.user_id === hr0101Application?.candidate_user_id"));
  assert.ok(runtime.includes("hr0101Employee?.full_name === hr0101Application?.full_name"));
  assert.ok(runtime.includes("hr0101Employee?.official_email === hr0101Application?.email"));
  assert.ok(browser.includes('X03-07_PARTIAL_HR_ONBOARDING_ACTIVATION_BROWSER_PASS'));
  assert.ok(browser.includes('X03-08_PARTIAL_CANDIDATE_DATA_REUSE_BROWSER_PASS'));
});

test('X03-07 and X03-08 keep their exact partial runtime records and hosted limits in the overlay', () => {
  const x0307 = overlay.open_story_evidence.find((item) => item.id === 'x03-07-employee-activation-partial-20261020');
  const x0308 = overlay.open_story_evidence.find((item) => item.id === 'x03-08-candidate-data-reuse-partial-20261020');
  assert.deepEqual(x0307?.story_ids, ['X03-07']);
  assert.deepEqual(x0308?.story_ids, ['X03-08']);
  for (const item of [x0307, x0308]) {
    assert.equal(item?.classification, 'PARTIAL_ACCEPTANCE');
    assert.equal(item?.commit, '1f0bec2fc40f27e600685661a83c6815dd43cf08');
    assert.ok(item?.workflow_run.endsWith('/actions/runs/39425355049'));
    assert.equal(item?.hosted_cross_system_acceptance, 'NOT_VERIFIED');
  }
});

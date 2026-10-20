import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const catalogue = JSON.parse(read('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json'));
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

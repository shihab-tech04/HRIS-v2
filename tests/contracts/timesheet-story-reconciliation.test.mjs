import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalogueBytes = readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url));
const catalogue = JSON.parse(catalogueBytes.toString('utf8'));
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const migration = read('../../supabase/migrations/20261016033936_hris_project_scoped_timesheet_review.sql');
const isolatedRunner = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-project-timesheets-browser.mjs');

const expected = [
  ['E15-01', 'As an employee, I want to enter time against a date.'],
  ['E15-02', 'As an employee, I want to select a project, client, task, or activity.'],
  ['E15-03', 'As an employee, I want to enter hours.'],
  ['E15-04', 'As an employee, I want to add notes.'],
  ['E15-05', 'As an employee, I want to save a draft.'],
  ['E15-06', 'As an employee, I want to submit a daily or weekly timesheet.'],
  ['E15-07', 'As an employee, I want to see approval status.'],
  ['E15-08', 'As an employee, I want to correct a rejected timesheet.'],
  ['E15-09', 'As an employee, I want to see rejection feedback.'],
  ['E15-10', 'As an employee, I want approved timesheets to become locked according to policy.'],
  ['E15-11', 'As an employee, I want to see historical timesheets.'],
];

test('E15 story reconciliation retains the byte-verified source and maps all 11 requirements without rewriting catalogue tracking', () => {
  assert.equal(createHash('sha256').update(catalogueBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  const stories = catalogue.stories.filter(story => story.module_id === 'E15');
  assert.deepEqual(stories.map(story => [story.story_id, story.verbatim_requirement]), expected);
  for (const story of stories) {
    assert.equal(story.status, 'NOT TESTED', `${story.story_id} canonical status is source-owned and must remain unchanged`);
    assert.deepEqual(story.test_ids, [], `${story.story_id} canonical evidence is source-owned and must remain unchanged`);
    assert.equal(story.source_locator.file_id, 'file_00000000cd3c82079cd1ea79b46700e9');
  }
});

test('E15-01 through E15-07 and E15-09 through E15-11 map to tenant-scoped UI, SQL and real-browser evidence', () => {
  for (const marker of [
    '[E15-01, E15-02, E15-03, E15-04, E15-05]',
    '[E15-06, E15-07]',
    '[E15-07, E15-10]',
    '[E15-01, E15-02, E15-03, E15-04, E15-06, E15-07]',
    '[E15-08, E15-09, E15-10]',
    '[E15-01 through E15-10]',
  ]) assert.ok(isolatedRunner.includes(marker), `Missing source-linked runtime record ${marker}`);

  assert.match(workspace, /id={`timesheet-date-\$\{index\}`} type="date"/);
  assert.match(workspace, /Choose activity/);
  assert.match(workspace, /id={`timesheet-hours-\$\{index\}`} type="number"/);
  assert.match(workspace, /id={`timesheet-note-\$\{index\}`} type="text"/);
  assert.match(workspace, /rpc\('hris_save_my_timesheet'/);
  assert.match(workspace, /option value="weekly"[\s\S]*?option value="daily"/);
  assert.match(workspace, /rpc\('hris_submit_my_timesheet'/);
  assert.match(workspace, /Timesheet history/);
  assert.match(workspace, /Project review status/);
  assert.match(workspace, /Rejection reason:/);
  assert.match(browser, /outage retry, refresh persistence, EN\/BN, and 375px\/1280px layouts/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.timesheet_project_reviews/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.timesheet_project_review_events/);
  assert.match(migration, /REVOKE ALL ON public\.timesheets, public\.timesheet_entries FROM PUBLIC, anon, authenticated/);
});

test('E15-08 remains explicitly partial for rejected historical or non-project portions without approved review authority', () => {
  assert.match(workspace, /Only this rejected project portion will be changed/);
  assert.match(workspace, /historical timesheet has no project review link, so it is preserved without guessing/);
  assert.match(workspace, /Unlinked hours remain submitted because no project reviewer is assigned to non-project work/);
  assert.match(isolatedRunner, /\[E15-08, E15-09, E15-10\] Rejected resubmission changes only that project, preserves approved rows/);
  assert.match(isolatedRunner, /\[E15-08, E15-10\] Non-project hours remain submitted after project approval/);
});

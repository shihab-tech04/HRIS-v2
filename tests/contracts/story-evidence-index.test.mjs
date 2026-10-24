import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStoryReferenceIndex } from '../../scripts/story-evidence-index.mjs';

const canonical = JSON.parse(readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url), 'utf8'));

test('story reference discovery preserves all source IDs without manufacturing an acceptance status', () => {
  const index = buildStoryReferenceIndex(canonical.stories, [
    { path: 'Main/tests/example.mjs', content: "'E01-01'; 'E01-01'; 'E37-01'; 'NOT-A-STORY'" },
    { path: 'Candidate/tests/example.mjs', content: "'E01-01'; 'CA14-12'; 'CA14-99'" },
  ]);
  assert.equal(index.story_count, 1047);
  assert.equal(index.test_referenced_story_count, 3);
  assert.equal(index.no_exact_test_reference_count, 1044);
  assert.equal(index.modules.length, 153);
  assert.deepEqual(index.stories.find(story => story.story_id === 'E01-01').test_source_references,
    ['Candidate/tests/example.mjs', 'Main/tests/example.mjs']);
  assert.deepEqual(index.stories.find(story => story.story_id === 'CA14-12').test_source_references,
    ['Candidate/tests/example.mjs']);
  assert.ok(index.stories.every(story => !Object.hasOwn(story, 'status') && !Object.hasOwn(story, 'accepted')));
});

test('story reference discovery rejects a duplicated canonical ID', () => {
  assert.throws(() => buildStoryReferenceIndex([canonical.stories[0], canonical.stories[0]], []),
    /not unique/);
});

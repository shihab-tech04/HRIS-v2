import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readPhaseReadiness, phaseReadiness } from '../../scripts/phase-readiness.mjs';

test('Phase 05 exact 57 source requirements retain evidence and blocker identities', () => {
  const result = readPhaseReadiness('05');
  assert.deepEqual(result.module_ids, ['E02', 'E03', 'E04', 'E37', 'HR01', 'HR03', 'SA06']);
  assert.deepEqual(result.counts, { total: 57, disposable_evidenced: 13, blocked: 3, partial: 4, not_classified: 37 });
  assert.equal(new Set(result.stories.map(row => row.story_id)).size, 57);
  assert.equal(result.stories.find(row => row.story_id === 'E02-17').status, 'DISPOSABLE_EVIDENCED');
  assert.equal(result.stories.find(row => row.story_id === 'E03-02').status, 'BLOCKED_ON_UNAPPROVED_OR_ABSENT_CONTRACT');
  assert.equal(result.stories.find(row => row.story_id === 'E04-05').status, 'PARTIAL_ACCEPTANCE');
  assert.equal(result.stories.find(row => row.story_id === 'HR01-01').status, 'NOT_CLASSIFIED');
  assert.ok(result.stories.every(row => row.hosted_accepted === false));
  assert.equal(result.legacy_verified_union, null);
});

test('a fake duplicate story appears as a duplicate in the canonical input and must not be silently accepted', () => {
  const source = JSON.parse(readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url), 'utf8'));
  source.stories.push(source.stories[0]);
  assert.throws(() => phaseReadiness({ phase: '05', source, overlay: { evidence_sets: [], open_story_evidence: [] } }), /Duplicate canonical story IDs/);
});

test('Phase 03 exact seven tenant and optional-module requirements retain source evidence and hosted blocker', () => {
  const result = readPhaseReadiness('03');
  assert.deepEqual(result.module_ids, ['SA01', 'SA12']);
  assert.deepEqual(result.counts, { total: 7, disposable_evidenced: 7, blocked: 0, partial: 0, not_classified: 0 });
  assert.deepEqual(result.stories.map(row => row.story_id), [
    'SA01-01', 'SA01-02', 'SA01-03', 'SA01-04', 'SA12-01', 'SA12-02', 'SA12-03',
  ]);
  assert.ok(result.stories.every(row => row.hosted_accepted === false));
  assert.equal(result.legacy_verified_union, null);
});

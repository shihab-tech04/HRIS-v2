import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const sourceBytes = readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url));
const source = JSON.parse(sourceBytes.toString('utf8'));
const overlay = JSON.parse(readFileSync(new URL('../../docs/programme/USER_STORY_ACCEPTANCE_OVERLAY.json', import.meta.url), 'utf8'));

test('acceptance overlay references the unchanged canonical 1,047-story source', () => {
  assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), overlay.canonical_source.sha256);
  assert.equal(overlay.canonical_source.story_count, source.story_total);
  assert.equal(overlay.canonical_source.module_count, source.module_total);
  const uniqueIds = new Set(source.stories.map(story => story.story_id));
  assert.equal(uniqueIds.size, 1047);
  assert.equal(source.stories.length, 1047);
  assert.ok(source.stories.every(story => story.status === 'NOT TESTED'), 'Immutable source statuses must not be rewritten.');
});

test('every individual evidence record maps to a real and uniquely evidenced canonical story', () => {
  const sourceIds = new Set(source.stories.map(story => story.story_id));
  const evidenceIds = overlay.evidence_sets.flatMap(set => set.story_ids);
  assert.equal(new Set(evidenceIds).size, evidenceIds.length, 'Evidence IDs must be deduplicated across suites.');
  for (const id of evidenceIds) assert.ok(sourceIds.has(id), `Unknown canonical story: ${id}`);
  assert.equal(evidenceIds.length, overlay.reconciliation.individual_verified_ids_recorded);
  const ca14 = source.stories.filter(story => story.module_id === 'CA14').map(story => story.story_id);
  const ca14Set = overlay.evidence_sets.find(set => set.id === 'candidate-ca14-20261017');
  assert.deepEqual(ca14Set.story_ids, ca14);
  assert.equal(ca14Set.classification, 'VERIFIED_IN_DISPOSABLE_AUTH_POSTGRES_BROWSER_JOURNEY');
  assert.equal(ca14Set.hosted_cross_system_acceptance, 'NOT_VERIFIED');
  assert.match(ca14Set.runtime_marker, /^CANDIDATE_CA14_STORY_EVIDENCE PASS=12 FAIL=0$/);
  assert.match(ca14Set.commit, /^[a-f0-9]{40}$/);
  assert.match(ca14Set.workflow_run, /\/actions\/runs\/39025809497$/);
});

test('historical aggregate is conserved without an unproven CA14 addition', () => {
  const legacy = overlay.legacy_aggregate_checkpoint;
  assert.equal(legacy.verified + legacy.partial + legacy.blocked + legacy.broken_within_tested_scope + legacy.not_yet_classified, 1047);
  assert.equal(legacy.verified, 82);
  assert.equal(legacy.verified_story_id_membership, 'NOT_RECORDED');
  assert.equal(overlay.reconciliation.legacy_verified_overlap, 'UNKNOWN');
  assert.equal(overlay.reconciliation.deduplicated_verified_total, null);
});

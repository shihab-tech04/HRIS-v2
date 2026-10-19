import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { reconcilePhase00 } from '../../scripts/phase00-reconciliation.mjs';

const sourceBytes = readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url));
const source = JSON.parse(sourceBytes.toString('utf8'));
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');
const overlay = JSON.parse(readFileSync(new URL('../../docs/programme/USER_STORY_ACCEPTANCE_OVERLAY.json', import.meta.url), 'utf8'));
const input = () => ({ source, overlay, sourceHash, testSources: [
  { path: 'Main/tests/example.mjs', content: "'E03-01'; 'CA14-01'; 'E01-01'; 'E01-01'" },
] });

test('Phase 00 inventories every original story without inflating the legacy acceptance aggregate', () => {
  const result = reconcilePhase00(input());
  assert.equal(result.phase00_source_integrity, 'PASS');
  assert.equal(result.phase00_programme_gate, 'PASS_SOURCE_AND_SCOPE');
  assert.equal(result.phase00_legacy_aggregate_disposition, 'QUARANTINED_FOR_ID_BY_ID_REVALIDATION_IN_PHASE20');
  assert.equal(result.story_total, 1047);
  assert.equal(result.module_total, 153);
  assert.equal(result.individually_evidenced_in_disposable_journeys, 27);
  assert.equal(result.individually_not_yet_evidenced, 1020);
  assert.equal(result.explicitly_blocked_story_count, 13);
  assert.equal(result.explicitly_partial_story_count, 4);
  assert.equal(result.legacy_verified_aggregate, 82);
  assert.equal(result.deduplicated_verified_total, null);
  assert.equal(result.test_referenced_story_count, 3);
  assert.equal(result.unassigned_source_phase_count, 1047);
  assert.equal(result.operationally_mapped_module_count, 153);
  assert.equal(result.operationally_unmapped_story_count, 0);
  assert.equal(result.entries.find(row => row.story_id === 'CA14-01').operational_primary_phase, '06');
  assert.equal(result.entries.find(row => row.story_id === 'E01-01').operational_primary_phase, '17');
  assert.equal(result.entries.find(row => row.story_id === 'E03-01').acceptance_evidence.scope, 'DISPOSABLE_ONLY');
  assert.equal(result.entries.find(row => row.story_id === 'E03-01').implementation_classification, 'IMPLEMENTED_TESTED_DISPOSABLE');
  assert.equal(result.entries.find(row => row.story_id === 'E02-03').implementation_classification, 'IMPLEMENTED_TESTED_DISPOSABLE');
  assert.equal(result.entries.find(row => row.story_id === 'E02-17').acceptance_evidence.scope, 'DISPOSABLE_ONLY');
  assert.equal(result.entries.find(row => row.story_id === 'E03-02').open_evidence.classification, 'BLOCKED_ON_UNAPPROVED_OR_ABSENT_CONTRACT');
  assert.equal(result.entries.find(row => row.story_id === 'E04-05').open_evidence.classification, 'PARTIAL_ACCEPTANCE');
  assert.equal(result.entries.find(row => row.story_id === 'E01-01').acceptance_evidence, null);
  assert.equal(result.entries.find(row => row.story_id === 'E01-01').implementation_classification, 'NOT_YET_DETERMINED');
  assert.equal(result.entries.find(row => row.story_id === 'E01-01').verbatim_requirement, source.stories[0].verbatim_requirement);
});

test('Phase 00 refuses changed source, duplicated evidence or fabricated deduplication', () => {
  assert.throws(() => reconcilePhase00({ ...input(), sourceHash: 'invalid' }), /SHA-256/);
  assert.throws(() => reconcilePhase00({
    ...input(),
    overlay: { ...overlay, evidence_sets: [...overlay.evidence_sets, overlay.evidence_sets[0]] },
  }), /Duplicate individually evidenced story/);
  assert.throws(() => reconcilePhase00({
    ...input(),
    overlay: { ...overlay, reconciliation: { ...overlay.reconciliation, deduplicated_verified_total: 107 } },
  }), /overlap must remain unresolved/);
  assert.throws(() => reconcilePhase00({
    ...input(),
    overlay: { ...overlay, open_story_evidence: [...overlay.open_story_evidence, {
      id: 'bad', classification: 'PARTIAL_ACCEPTANCE', story_ids: ['E03-01'],
    }] },
  }), /Conflicting story evidence/);
});

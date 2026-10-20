import { test } from 'node:test';
import assert from 'node:assert/strict';
import { programmePhaseDashboard, operationalPhaseGates } from '../../scripts/programme-phase-dashboard.mjs';

test('all 22 operational phases reconcile exactly to 1,047 canonical stories and 153 uniquely grouped modules', () => {
  const snapshot = programmePhaseDashboard();
  assert.equal(snapshot.totals.phases, 22);
  assert.equal(snapshot.totals.modules, 153);
  assert.equal(snapshot.totals.stories, 1047);
  assert.equal(snapshot.totals.individually_disposable_evidenced, 37);
  assert.equal(snapshot.totals.blocked, 13);
  assert.equal(snapshot.totals.partial, 4);
  assert.equal(snapshot.totals.unclassified, 993);
  assert.equal(snapshot.totals.hosted_story_accepted, 0);
  assert.deepEqual(snapshot.phases.map(row => row.phase), [...Array(22)].map((_, index) => String(index).padStart(2, '0')));
  assert.equal(new Set(snapshot.phases.map(row => row.title)).size, 22);
});

test('cross-cutting acceptance phases have no exclusive source stories and no unearned release green light', () => {
  const snapshot = programmePhaseDashboard();
  for (const phase of ['00', '01', '02', '18', '20', '21']) {
    assert.equal(snapshot.phases.find(row => row.phase === phase)?.total, 0);
  }
  const phase03 = snapshot.phases.find(row => row.phase === '03');
  assert.deepEqual({ total: phase03.total, disposable_evidenced: phase03.disposable_evidenced,
    blocked: phase03.blocked, partial: phase03.partial, not_classified: phase03.not_classified },
  { total: 7, disposable_evidenced: 7, blocked: 0, partial: 0, not_classified: 0 });
  assert.equal(operationalPhaseGates['03'].state, 'STAGED_TESTED_RELEASE_BLOCKED');
  assert.equal(operationalPhaseGates['04'].state, 'HOSTED_SECURITY_GATE_BLOCKED');
  assert.equal(operationalPhaseGates['19'].state, 'HOSTED_SECURITY_GATE_BLOCKED');
  assert.equal(operationalPhaseGates['21'].state, 'RELEASE_BLOCKED');
  assert.ok(snapshot.phases.filter(row => row.state.endsWith('_GATE_PASSED')).length === 3);
});

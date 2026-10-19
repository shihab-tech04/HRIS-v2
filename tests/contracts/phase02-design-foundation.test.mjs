import { test } from 'node:test';
import assert from 'node:assert/strict';
import { figmaSource, inspectDesignFoundation } from '../../scripts/phase02-design-foundation.mjs';

test('Phase 02 preserves approved tokens, real entry points, privacy-sensitive demo guards, and source screenshot evidence', () => {
  const result = inspectDesignFoundation();
  assert.equal(result.foundation_passed, true, JSON.stringify(result.foundation_checks));
  assert.equal(Object.values(result.foundation_checks).length, 10);
  assert.equal(result.figma_frame_count, 4);
  assert.equal(new Set(figmaSource.frames.map(frame => frame.node)).size, 4);
  for (const capture of result.captured_main_routes) {
    assert.ok(capture.dimensions.width >= 1000);
    assert.ok(capture.dimensions.height >= 600);
    assert.equal(capture.parity_status, 'NOT_CERTIFIED');
  }
  assert.equal(result.full_visual_parity_certified, false);
  assert.equal(result.source_missing_dedicated_candidate_frame, true);
  assert.equal(result.source_missing_dedicated_super_admin_frame, true);
});

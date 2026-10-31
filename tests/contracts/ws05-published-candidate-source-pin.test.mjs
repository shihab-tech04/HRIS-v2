import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const expected = 'db4163885f9609d66e9871a9c0de771fe8151d84';
const previouslyPublished = '39d07585c854709f5c16b2712a6634da386c5c4d';

for (const path of ['.github/workflows/check.yml', '.github/workflows/deploy-pages.yml']) {
  test(`${path} validates the published Candidate version, not a stale snapshot`, () => {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /expected_sha=db4163885f9609d66e9871a9c0de771fe8151d84/);
    assert.ok(source.includes(expected));
    assert.ok(!source.includes(previouslyPublished), 'Stale Candidate source pin must not be used for current Main builds');
    assert.match(source, /git -C "\$GITHUB_WORKSPACE\/\.\.\/HRIS-Candidate-v2" checkout --detach "\$expected_sha"/);
    assert.match(source, /actual_sha/);
    assert.match(source, /expected_sha/);
  });
}

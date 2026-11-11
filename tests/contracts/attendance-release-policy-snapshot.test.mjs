import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const releaseScript = readFileSync(
  new URL('../../scripts/release/hris-attendance-gated-sql-release.sh', import.meta.url),
  'utf8',
);

function policySnapshotQuery(phase) {
  const outputMarker = ` > "$scratch/policies-${phase}.txt"`;
  const outputIndex = releaseScript.indexOf(outputMarker);
  assert.notEqual(outputIndex, -1, `${phase} policy snapshot output must exist`);

  const commandStart = releaseScript.lastIndexOf('db_psql -c "', outputIndex);
  assert.notEqual(commandStart, -1, `${phase} policy snapshot command must exist`);

  const queryStart = commandStart + 'db_psql -c "'.length;
  return releaseScript.slice(queryStart, outputIndex).trimEnd();
}

function assertBalancedSqlParentheses(query, name) {
  let depth = 0;
  let inString = false;

  for (let index = 0; index < query.length; index += 1) {
    const character = query[index];
    if (character === "'") {
      if (inString && query[index + 1] === "'") {
        index += 1;
      } else {
        inString = !inString;
      }
      continue;
    }
    if (inString) continue;
    if (character === '(') depth += 1;
    if (character === ')') {
      depth -= 1;
      assert.ok(depth >= 0, `${name} closes a parenthesis before opening it`);
    }
  }

  assert.equal(inString, false, `${name} has an unterminated SQL string`);
  assert.equal(depth, 0, `${name} has unbalanced SQL parentheses`);
}

test('attendance release policy snapshots keep balanced, matching SQL', () => {
  const before = policySnapshotQuery('before');
  const after = policySnapshotQuery('after');

  assert.equal(before, after, 'before/after policy snapshots must query the same state');
  assertBalancedSqlParentheses(before, 'policy snapshot');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const releaseScript = readFileSync(
  new URL('../../scripts/release/hris-attendance-gated-sql-release.sh', import.meta.url),
  'utf8',
);

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
  const snapshots = [
    ...releaseScript.matchAll(
      /db_psql -c "(SELECT[\\s\\S]*?)" > "\\$scratch\\/policies-(before|after)\\.txt"/g,
    ),
  ];

  assert.equal(snapshots.length, 2, 'both before and after snapshots must exist');
  const byPhase = Object.fromEntries(snapshots.map(([, query, phase]) => [phase, query]));
  assert.deepEqual(Object.keys(byPhase).sort(), ['after', 'before']);
  assert.equal(byPhase.before, byPhase.after, 'before/after policy snapshots must query the same state');
  assertBalancedSqlParentheses(byPhase.before, 'policy snapshot');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const current = read('docs/audit/HRIS_227_BRANCH_TIP_RESOLUTION_20261104.csv').trim().split(/\r?\n/);
const legacy = new Map(
  read('docs/audit/HRIS_65_HISTORICAL_BRANCH_DISPOSITIONS_20261104.csv')
    .split(/\r?\n/).filter(line => /^\d+,/.test(line))
    .map(line => {
      const cells = line.split(',');
      return [cells[1], cells[4]];
    }),
);

function entries() {
  assert.equal(current[0], 'branch,tip_sha,classification,legacy_disposition,safe_action');
  return current.slice(1).map(line => {
    const matched = line.match(/^"([^"]+)","([0-9a-f]{40})","([^"]+)","([^"]*)","([^"]*)"$/);
    assert.ok(matched, 'Each archival branch row must have five safe, quoted columns');
    return { branch: matched[1], sha: matched[2], category: matched[3], legacy: matched[4] };
  });
}

test('HRIS reconciles exactly 227 distinct historical branch SHAs without pretending all heads were merged', () => {
  const rows = entries();
  assert.equal(rows.length, 227);
  assert.equal(new Set(rows.map(row => row.branch)).size, 227);
  const counts = Object.fromEntries([...new Set(rows.map(row => row.category))]
    .map(category => [category, rows.filter(row => row.category === category).length]));
  assert.deepEqual(counts, {
    NO_UNMATCHED_SRC_SQL: 89,
    IN_MAIN_ANCESTRY: 71,
    REVIEWED_65: 65,
    SUPERSEDED_BY_MAIN: 2,
  });
  for (const row of rows.filter(row => row.category === 'REVIEWED_65')) {
    assert.equal(row.legacy, legacy.get(row.branch), 'The 65 exact-SHA dispositions must not silently change');
  }
  assert.equal(legacy.size, 65);
});

test('historical source reconciliation retains current approved fixes and excludes old identities', () => {
  const rows = entries();
  for (const branch of ['integration/ws05-hr03-current-main-20261031', 'integration/ws05-release2-employee-profile-20261031']) {
    assert.equal(rows.find(row => row.branch === branch)?.category, 'SUPERSEDED_BY_MAIN');
  }
  for (const branch of ['ws07/synthetic-user-generation-20261030', 'ws08/real-provisioning-readonly-20261031']) {
    const row = rows.find(row => row.branch === branch);
    assert.equal(row?.category, 'REVIEWED_65');
    assert.equal(row?.legacy, 'INTENTIONALLY_EXCLUDED');
  }
  assert.doesNotMatch(read('src/live/LiveHrisWorkspace.tsx'), /SyntheticUserManagement|user-management-preview/);
  const profile = read('src/live/EmployeeProfileFigma.tsx');
  for (const field of ['designation_code', 'department_code', 'grade_code']) {
    assert.ok(profile.includes(field), 'Protected employment code recovery must remain present: ' + field);
  }
});

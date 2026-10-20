import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const canonicalBytes = readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url));
const canonical = JSON.parse(canonicalBytes.toString('utf8'));
const manifestText = readFileSync(new URL('../../docs/evidence/ws06-employee-story-ownership-20261020.csv', import.meta.url), 'utf8').trim();
const auditReport = readFileSync(new URL('../../docs/evidence/ws06-employee-phase05-audit-20261020.md', import.meta.url), 'utf8');
const manifestRows = manifestText.split(/\r?\n/).slice(1).map(line => line.split(','));
const expectedPhase05Ids = [
  ...Array.from({ length: 18 }, (_, index) => `E02-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 8 }, (_, index) => `E03-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 5 }, (_, index) => `E04-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 5 }, (_, index) => `E37-${String(index + 1).padStart(2, '0')}`),
];

test('WS06 ownership manifest exactly matches all canonical Employee story IDs', () => {
  assert.equal(createHash('sha256').update(canonicalBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  assert.equal(canonical.story_total, 1047);
  assert.equal(canonical.module_total, 153);
  const sourceRows = canonical.stories
    .filter(story => story.role_name === 'Employee')
    .map(story => [story.story_id, story.role, story.role_name, story.module_id]);
  assert.equal(sourceRows.length, 362);
  assert.equal(new Set(sourceRows.map(row => row[0])).size, 362);
  assert.deepEqual(manifestText.split(/\r?\n/)[0].split(','), ['story_id', 'role', 'role_name', 'module_id']);
  assert.deepEqual(manifestRows, sourceRows);
});

test('the 36 assigned Phase 05 stories are exact canonical Employee IDs with no cross-role overlap', () => {
  const manifestIds = new Set(manifestRows.map(row => row[0]));
  const phase05Rows = manifestRows.filter(([, role, roleName, moduleId]) =>
    role === 'E' && roleName === 'Employee' && ['E02', 'E03', 'E04', 'E37'].includes(moduleId));
  assert.deepEqual(phase05Rows.map(([storyId]) => storyId), expectedPhase05Ids);
  assert.deepEqual([...auditReport.matchAll(/^\| (E\d{2}-\d{2}) \|/gm)].map(match => match[1]), expectedPhase05Ids);
  assert.equal(phase05Rows.length, 36);
  assert.ok(expectedPhase05Ids.every(storyId => manifestIds.has(storyId)));
  assert.ok(manifestRows.every(([, role, roleName]) => role === 'E' && roleName === 'Employee'));
  assert.ok(manifestRows.every(([storyId]) => /^E\d{2}-\d{2}$/.test(storyId)));
});

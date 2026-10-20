import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readPhaseReadiness } from '../../scripts/phase-readiness.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const sourceBytes = readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url));
const source = JSON.parse(sourceBytes.toString('utf8'));
const inventory = read('../../docs/workstations/WS07_HR_OWNERSHIP_2026-10-20.md');

const ownedStories = source.stories
  .filter(story => story.role_name === 'HR' && Number(story.module_id.slice(2)) >= 2 && Number(story.module_id.slice(2)) <= 33)
  .sort((a, b) => a.story_id.localeCompare(b.story_id, undefined, { numeric: true }));

test('Workstation 07 inventory is exactly the canonical 244 HR02–HR33 IDs', () => {
  assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  assert.equal(source.story_total, 1047);
  assert.equal(source.module_total, 153);
  assert.equal(ownedStories.length, 244);
  assert.equal(new Set(ownedStories.map(story => story.story_id)).size, 244);
  assert.equal(new Set(ownedStories.map(story => story.module_id)).size, 32);

  const scope = inventory.match(/<!-- OWNERSHIP_IDS_START -->([\s\S]*?)<!-- OWNERSHIP_IDS_END -->/)?.[1] || '';
  const listedIds = scope.match(/\bHR\d{2}-\d{2}\b/g) || [];
  assert.equal(listedIds.length, 244);
  assert.equal(new Set(listedIds).size, 244);
  assert.deepEqual(listedIds, ownedStories.map(story => story.story_id));
  for (let suffix = 1; suffix <= 8; suffix += 1) {
    assert.ok(!listedIds.includes(`HR01-${String(suffix).padStart(2, '0')}`), 'HR01 stays with Workstation 01');
  }
  assert.match(inventory, /HR01-01` through `HR01-08`[\s\S]+?remain with Workstation 01/);
});

test('Phase 05 HR03 allocation preserves its nine exact source requirements and order', () => {
  const expected = [
    ['HR03-01', 'As HR, I want to manage legal entities.'],
    ['HR03-02', 'As HR, I want to manage offices/branches.'],
    ['HR03-03', 'As HR, I want to manage departments.'],
    ['HR03-04', 'As HR, I want to manage units.'],
    ['HR03-05', 'As HR, I want to manage teams.'],
    ['HR03-06', 'As HR, I want to manage designations.'],
    ['HR03-07', 'As HR, I want to manage grades/bands.'],
    ['HR03-08', 'As HR, I want to maintain reporting relationships.'],
    ['HR03-09', 'As HR, I want effective dating so structural changes do not destroy history.'],
  ];
  const actual = source.stories
    .filter(story => story.module_id === 'HR03')
    .sort((a, b) => a.story_id.localeCompare(b.story_id, undefined, { numeric: true }));
  assert.deepEqual(actual.map(story => [story.story_id, story.verbatim_requirement]), expected);

  const allocation = inventory.split('## Phase 05 immediate allocation — HR03 (9 IDs)')[1]?.split('\n## Current source')[0] || '';
  assert.deepEqual(allocation.match(/\bHR03-\d{2}\b/g), expected.map(([id]) => id));
  for (const [id, requirement] of expected) assert.ok(allocation.includes(`**${id}** — ${requirement}`));
});

test('HR03-01 remains stopped at its absent legal-entity contract', () => {
  const readiness = readPhaseReadiness('05');
  assert.equal(readiness.stories.find(story => story.story_id === 'HR03-01')?.status, 'BLOCKED_ON_UNAPPROVED_OR_ABSENT_CONTRACT');
  const blocker = read('../../docs/evidence/hr03-01-legal-entity-contract-gap-20261020.md');
  assert.match(blocker, /Status: BLOCKED ON AN ABSENT OR UNAPPROVED CONTRACT/);
  assert.match(blocker, /no `legal_entities` relation/);
  assert.match(blocker, /No production data, schema, permissions, migration history, or deployment was changed\./);
  assert.match(inventory, /HR03-01 is blocked/);
  assert.match(inventory, /does not prove a feature is absent/);
});

test('legacy department form remains an in-memory surface, not an HR write API', () => {
  const view = read('../../src/views/admin/OrgStructureAndRoles.tsx');
  const context = read('../../src/context/HRISContext.tsx');
  const start = context.indexOf('const createDepartment =');
  const end = context.indexOf('const updateDepartment =', start);
  const createDepartment = context.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(view, /useHRIS\(\)/);
  assert.match(view, /createDepartment\(/);
  assert.doesNotMatch(view, /supabase|\.rpc\(/i);
  assert.match(createDepartment, /id: `dept-/);
  assert.match(createDepartment, /tenantId: currentTenant\.id/);
  assert.match(createDepartment, /setDepartments\(\(prev\) => \[\.\.\.prev, created\]\)/);
  assert.doesNotMatch(createDepartment, /supabase|\.rpc\(/i);
});

test('live organization surfaces keep tenant-filtered reads and existing role visibility', () => {
  const teams = read('../../src/live/OrganizationTeams.tsx');
  const system = read('../../src/live/LiveSystemWorkspace.tsx');
  const app = read('../../src/live/LiveApp.tsx');
  const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
  const membershipMigration = read('../../supabase/migrations/20261012091930_hris_tenant_membership_role_permissions.sql');
  const guardMigration = read('../../supabase/migrations/20261012230100_hris_membership_tenant_read_guards.sql');

  assert.match(teams, /supabase\.from\('teams'\)[\s\S]*?\.eq\('tenant_id', tenantId\)/);
  assert.match(teams, /supabase\.from\('departments'\)[\s\S]*?\.eq\('tenant_id', tenantId\)/);
  assert.doesNotMatch(teams, /\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(|\.rpc\s*\(/);
  assert.match(system, /table: 'departments'/);
  assert.match(system, /table: 'teams'/);
  assert.match(system, /table: 'designations'/);
  assert.match(system, /\.select\(selected\.fields\)\.eq\('tenant_id', tenantId\)/);
  assert.match(system, /RLS protected · up to 50 records · read only/);
  assert.doesNotMatch(app, /<LiveSystemWorkspace\b/);

  assert.match(app, /'organization\.view', 'organization\.manage'/);
  assert.match(app, /organization: grants\.get\('organization\.view'\) === true \|\| grants\.get\('organization\.manage'\) === true/);
  assert.match(app, /organizationManage: grants\.get\('organization\.manage'\) === true/);
  assert.match(workspace, /permissions\.organization && <OrganizationTeams tenantId=\{tenantId\}/);
  assert.match(membershipMigration, /CREATE POLICY hris_departments_membership_read[\s\S]*?organization\.view[\s\S]*?organization\.manage/);
  for (const table of ['designations', 'grades', 'org_locations', 'teams']) {
    const policyName = new RegExp(`CREATE POLICY hris_${table}_membership_read[\\s\\S]*?organization\\.view[\\s\\S]*?organization\\.manage`);
    assert.match(guardMigration, policyName, `${table} keeps the existing membership-backed organization read contract`);
  }
});

test('employee organization projection does not invent reporting, position or effective-date semantics', () => {
  const directory = read('../../supabase/migrations/20261017092147_employee_directory_team_filter.sql');
  const historicalSpec = read('../../src/sql/contracts.ts');
  assert.match(directory, /LEFT JOIN public\.departments d ON d\.id=e\.department_id AND d\.tenant_id=e\.tenant_id/);
  assert.match(directory, /LEFT JOIN public\.designations des ON des\.id=e\.designation_id AND des\.tenant_id=e\.tenant_id/);
  assert.match(directory, /LEFT JOIN public\.teams tm ON tm\.id=e\.team_id AND tm\.tenant_id=e\.tenant_id/);
  assert.doesNotMatch(directory, /manager_id|reports_to|reporting_line|position_id|grade_id|effective_from|effective_to/i);
  assert.match(historicalSpec, /UNAPPLIED TO PRODUCTION/);
  assert.match(historicalSpec, /primary_manager_id/);
  assert.match(inventory, /speculative, explicitly unapplied/);
});

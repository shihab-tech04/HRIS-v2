import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readPhaseReadiness } from '../../scripts/phase-readiness.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = JSON.parse(read('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json'));
const stories = source.stories.filter(story => story.module_id === 'SA06');
const app = read('../../src/live/LiveApp.tsx');
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const teams = read('../../src/live/OrganizationTeams.tsx');
const leavePolicy = read('../../src/live/LeaveTypePolicyManager.tsx');
const leaveContract = read('../../supabase/migrations/20261016142000_hris_leave_type_policy_management.sql');

test('SA06 coverage stays anchored to its four exact canonical requirements', () => {
  assert.deepEqual(stories.map(story => story.story_id), ['SA06-01', 'SA06-02', 'SA06-03', 'SA06-04']);
  assert.deepEqual(stories.map(story => story.verbatim_requirement), [
    'As super admin, I want to manage configured master-data values.',
    'As super admin, I want controlled values reused across modules.',
    'As super admin, I want inactive values retained for historical records.',
    'As super admin, I want duplicate/inconsistent values minimized.',
  ]);
  assert.ok(stories.every(story => story.ui_component === null
    && story.sql_rpc_api_contract === null
    && story.tenant_role_record_permissions === null
    && story.validations === null
    && story.state_transitions === null));
});

test('SA06 is not presented as a connected application route before shared-shell ownership is resolved', () => {
  assert.match(app, /import \{ LiveHrisWorkspace \} from '\.\/LiveHrisWorkspace'/);
  assert.doesNotMatch(app, /LiveSystemWorkspace/);
  assert.doesNotMatch(workspace, /'master-data'/);
  assert.match(workspace, /type PageId =/);

  // The live team directory is a tenant-filtered read and export surface only.
  assert.match(teams, /\.from\('teams'\)[\s\S]*?\.eq\('tenant_id', tenantId\)/);
  assert.doesNotMatch(teams, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});

test('the existing leave-type writer remains scoped to its own permission and data contract', () => {
  assert.match(leavePolicy, /supabase\.rpc\('hris_save_leave_type'/);
  assert.match(leaveContract, /has_tenant_permission\(p_tenant_id, 'leave\.manage'\)/);
  assert.match(leaveContract, /REVOKE INSERT, UPDATE, DELETE ON public\.leave_types FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(leaveContract, /public\.(departments|designations|teams)/);
});

test('current Phase 05 readiness does not certify or silently classify SA06', () => {
  const readiness = readPhaseReadiness('05');
  const assigned = readiness.stories.filter(story => story.module_id === 'SA06');
  assert.deepEqual(assigned.map(story => story.story_id), ['SA06-01', 'SA06-02', 'SA06-03', 'SA06-04']);
  assert.ok(assigned.every(story => story.status === 'NOT_CLASSIFIED' && story.hosted_accepted === false));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalogue = JSON.parse(read('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json'));
const activationSql = read('../../supabase/migrations/20261014070848_hris_candidate_employee_activation.sql');
const localFixture = read('../sql/isolated-auth/fixture.sql');
const runner = read('../sql/isolated-auth/run-local.mjs');
const story = catalogue.stories.find(item => item.story_id === 'HR01-08');

test('HR01-08 partial evidence proves tenant-scoped uniqueness while leaving duplicate-person matching open', () => {
  assert.equal(story?.verbatim_requirement, 'As HR, I want duplicate employee records prevented or flagged.');
  assert.equal(story?.status, 'NOT TESTED', 'canonical source story fields must remain unchanged');
  assert.match(activationSql, /CREATE UNIQUE INDEX IF NOT EXISTS hris_employees_tenant_employee_number_uq\s+ON public\.employees \(tenant_id, employee_number\)/);
  assert.match(localFixture, /UNIQUE \(tenant_id, official_email\)/);
  assert.match(runner, /attemptEmployeeDuplicateProbe/);
  assert.match(runner, /employee_number: 'QA-A-001'/);
  assert.match(runner, /official_email: 'employee-a@hris\.test'/);
  assert.match(runner, /HR01-08 partial: tenant employee-number and email duplicates are rejected without cross-tenant collision/);
  assert.match(runner, /sameEmailOtherTenantProbe\.errorCode === null/);
  assert.match(runner, /duplicateOfficialEmailProbe\.errorCode === '23505'/);
});

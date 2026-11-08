import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profile = readFileSync(new URL('../../.github/workflows/ws05-employee-profile-sql-release.yml', import.meta.url), 'utf8');
const account = readFileSync(new URL('../../.github/workflows/hris-account-finalization-sql-release.yml', import.meta.url), 'utf8');

for (const [scope, workflow] of [['profile', profile], ['account', account]]) {
  test(scope + ' release requires owner approval, protected Main and verified recovery', () => {
    assert.match(workflow, /workflow_dispatch:/);
    assert.doesNotMatch(workflow, /^\s+push:\s*$/m);
    assert.match(workflow, /default: false/);
    assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
    assert.match(workflow, /github\.repository == 'shihab-tech04\/HRIS-v2'/);
    assert.match(workflow, /group: hris-profile-sql-production/);
    assert.match(workflow, /--dry-run/);
    assert.match(workflow, /diff -u .*expected\.txt.*planned\.txt/);
    assert.match(workflow, /42493910026/);
    assert.match(workflow, /42494096474/);
    assert.match(workflow, /expired/);
  });
}
test('profile release stays limited to two reviewed Profile migrations', () => {
  assert.match(profile, /20261027040642_employee_profile_tenant_scoped_contract\.sql/);
  assert.match(profile, /20261030114500_employee_profile_certificate_policy_guards\.sql/);
  assert.doesNotMatch(profile, /20261105093000_hris_scoped_user_finalization\.sql/);
  assert.doesNotMatch(profile, /20261106090000_hris_new_workforce_account\.sql/);
});
test('account lane requires completed Profile stage and changes only two account versions', () => {
  assert.match(account, /-eq 133/);
  assert.match(account, /-eq 135/);
  assert.match(account, /20261105093000_hris_scoped_user_finalization\.sql/);
  assert.match(account, /20261106090000_hris_new_workforce_account\.sql/);
  assert.match(account, /! grep -Eq '\^\(20261105093000\|20261106090000\)/);
  assert.match(account, /grep -Ev '\^\(20261105093000\|20261106090000\)/);
  assert.match(account, /NOT has_function_privilege\('anon'/);
  assert.match(account, /NOT has_function_privilege\('authenticated'/);
  assert.match(account, /has_function_privilege\('service_role'/);
  assert.match(account, /pulls\/177/);
  assert.doesNotMatch(account, /supabase functions deploy|auth\.admin\.createUser/);
});
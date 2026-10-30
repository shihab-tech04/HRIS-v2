import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/ws05-employee-profile-sql-release.yml', import.meta.url), 'utf8');
const profileSql = [
  '20261027040642_employee_profile_tenant_scoped_contract.sql',
  '20261030114500_employee_profile_certificate_policy_guards.sql',
];
const unrelated = '20261027090000_hris_requisition_pending_status_guard.sql';

test('Employee Profile hosted SQL release is manual, explicitly approved and main-only', () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/m);
  assert.match(workflow, /release_approved:\n[\s\S]*?default: false/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /github\.repository == 'shihab-tech04\/HRIS-v2'/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /HRIS_DB_PASSWORD/);
  assert.doesNotMatch(workflow, /service_role|SUPABASE_SERVICE_ROLE_KEY|db reset|migration repair/i);
});

test('remote migration catalogue is preserved and exactly two source files can be staged', () => {
  const copied = [...workflow.matchAll(/^\s*cp supabase\/migrations\/(\d{14}_[a-z0-9_]+[.]sql)/gm)]
    .map(m => m[1]);
  assert.deepEqual(copied, profileSql);
  assert.match(workflow, /supabase_migrations\.schema_migrations ORDER BY version/);
  assert.match(workflow, /before\.tsv/);
  assert.match(workflow, /wc -l/);
  assert.match(workflow, /-eq 131/);
  assert.match(workflow, /20261027033218/);
  assert.match(workflow, /-eq 133/);
  assert.match(workflow, /diff -u "\$scratch\/expected\.txt" "\$scratch\/planned\.txt"/);
  assert.match(workflow, /supabase db push --db-url "\$db_url" --include-all --dry-run/);
  assert.match(workflow, /supabase --yes db push --db-url "\$db_url" --include-all/);
  assert.match(workflow, /cmp -s "\$scratch\/before\.tsv" "\$scratch\/unchanged\.tsv"/);
  assert.match(workflow, new RegExp('test ! -e .*' + unrelated.replace(/[.]/g, '[.]')));
  assert.doesNotMatch(workflow, /supabase db push --linked|--include-seed/);
  for (const filename of profileSql) {
    assert.ok(workflow.includes(filename), 'missing scoped source: ' + filename);
    const sourcePath = new URL('../../supabase/migrations/' + filename, import.meta.url);
    // The workflow may be reviewed/merged before the pending Employee Profile integration PR.
    if (existsSync(sourcePath)) assert.ok(readFileSync(sourcePath, 'utf8').length > 1000);
  }
});

test('SQL release requires independent recovery and verifies preserved data and private storage', () => {
  for (const actionRun of ['41089145233', '41090015468', '41090711503', '41100639303', '41100639286']) {
    assert.ok(workflow.includes(actionRun), 'missing approved recovery/QA run ' + actionRun);
  }
  assert.match(workflow, /before_rows=/);
  assert.match(workflow, /after_rows=/);
  assert.match(workflow, /test "\$before_rows" = "\$after_rows"/);
  assert.match(workflow, /employee_get_my_profile_v1\(uuid\)/);
  assert.match(workflow, /employee_delete_my_profile_record_v1\(uuid,text,uuid\)/);
  assert.match(workflow, /employee_bank_details/);
  assert.match(workflow, /relrowsecurity/);
  assert.match(workflow, /permissive='RESTRICTIVE'/);
  assert.match(workflow, /employee_profile_certificate_insert_namespace_guard/);
  assert.match(workflow, /employee_profile_certificate_update_namespace_guard/);
  assert.match(workflow, /employee_profile_certificate_delete_namespace_guard/);
  assert.match(workflow, /EMPLOYEE_PROFILE_SQL_PASS/);
});

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/ws05-employee-profile-sql-release.yml', import.meta.url), 'utf8');
const profileSql = [
  '20261027040642_employee_profile_tenant_scoped_contract.sql',
  '20261030114500_employee_profile_certificate_policy_guards.sql',
  '20261105093000_hris_scoped_user_finalization.sql',
  '20261106090000_hris_new_workforce_account.sql',
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

test('remote migration catalogue is preserved and exactly four reviewed source files can be staged', () => {
  const copied = [...workflow.matchAll(/^\s*cp supabase\/migrations\/(\d{14}_[a-z0-9_]+[.]sql)/gm)]
    .map(m => m[1]);
  assert.deepEqual(copied, profileSql);
  assert.match(workflow, /supabase_migrations\.schema_migrations ORDER BY version/);
  assert.match(workflow, /before\.tsv/);
  assert.match(workflow, /wc -l/);
  assert.match(workflow, /-eq 131/);
  assert.match(workflow, /20261027033218/);
  assert.match(workflow, /-eq 135/);
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

test('SQL release requires current exact-Main recovery and verifies preserved data and private storage', () => {
  assert.match(workflow, /offsite_recovery_verified:\n[\s\S]*?default: false/);
  assert.match(workflow, /BACKUP_RUN_ID/);
  assert.match(workflow, /RESTORE_RUN_ID/);
  assert.match(workflow, /recovery_artifacts = read_github/);
  assert.match(workflow, /restore_id/);
  assert.match(workflow, /protected_sha/);
  assert.match(workflow, /source_artifacts/);
  assert.match(workflow, /item.get\('expired'\) is False/);
  assert.match(workflow, /timedelta\(hours=23\)/);
  assert.match(workflow, /before_rows=/);
  assert.match(workflow, /after_rows=/);
  assert.match(workflow, /test "\$before_rows" = "\$after_rows"/);
  assert.match(workflow, /employee_get_my_profile_v1\(uuid\)/);
  assert.match(workflow, /employee_delete_my_profile_record_v1\(uuid,text,uuid\)/);
  assert.match(workflow, /employee_bank_details/);
  assert.match(workflow, /relrowsecurity/);
  assert.match(workflow, /permissive='RESTRICTIVE'/);
  assert.match(workflow, /employee_profile_certificate_select_namespace_guard/);
  assert.match(workflow, /7b156e3f33e4688d3861eb09c3c660243ce2ead667c0c83220330649698c7a39/);
  assert.match(workflow, /a5b3d96bdb628f5843d9f0efb01a452a9324eb2271030fa193f695204f0f60c5/);
  assert.match(workflow, /employee_profile_certificate_insert_namespace_guard/);
  assert.match(workflow, /employee_profile_certificate_update_namespace_guard/);
  assert.match(workflow, /employee_profile_certificate_delete_namespace_guard/);
  assert.match(workflow, /employee_profile_certificate_delete_namespace_guard'\)\) = 4/);
  assert.match(workflow, /HRIS_FOUR_SQL_PASS/);
});

test('Employee Profile and workforce SQL release verifies green reviewed PRs and protected main commit', () => {
  assert.match(workflow, /read_github\("pulls\/159"\)/);
  assert.match(workflow, /read_github\("pulls\/177"\)/);
  assert.match(workflow, /profile_pr\.get\("merged_at"\) is None/);
  assert.match(workflow, /profile_pr\.get\("base", \{\}\)\.get\("ref"\) != "main"/);
  assert.match(workflow, /reviewed_head = profile_pr\.get\("head", \{\}\)\.get\("sha"\)/);
  assert.match(workflow, /"commits\/" \+ reviewed_head \+ "\/check-runs\?per_page=100"/);
  assert.match(workflow, /for check_name in \("check", "isolated-hris"\)/);
  assert.match(workflow, /check\.get\("status"\) == "completed"/);
  assert.match(workflow, /check\.get\("conclusion"\) == "success"/);
  assert.match(workflow, /protected_sha = os\.environ\["GITHUB_SHA"\]/);
  assert.match(workflow, /"commits\/" \+ protected_sha \+ "\/check-runs\?per_page=100"/);
  assert.match(workflow, /check\.get\("name"\) == "check"/);
  assert.match(workflow, /Current protected main has not passed exact-SHA build verification/);
});

test('workflow refuses expired recovery and enforces four exact migration fingerprints and RPC guards', () => {
  assert.match(workflow, /recovery_artifacts = read_github/);
  assert.match(workflow, /'hris-db-encrypted-' \+ backup_id/);
  assert.match(workflow, /item.get\('expired'\) is False/);
  assert.match(workflow, /separately verified owner gate/);
  assert.match(workflow, /2d1d82fb29dc06fd6d58099d6d2a8a6af6ddd8a4b71b830c435cc5adc76a0e31/);
  assert.match(workflow, /a439bc131d733784ac9a86cf04eaf7d6d6ed6e13222ee6403fdabf73fb5a9d20/);
  assert.match(workflow, /admin_finalize_new_workforce_user/);
  assert.match(workflow, /admin_finalize_system_user/);
  assert.match(workflow, /admin_get_my_provisioning_context/);
  assert.match(workflow, /HRIS_FOUR_SQL_PASS/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const read = name => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
const workflow = read('.github/workflows/hris-service-requests-gated-sql.yml');
const release = read('scripts/release/hris-service-requests-gated-sql.sh');
const migration = read('supabase/migrations/20261109174000_hris_service_request_legacy_contract_forward_port.sql');

test('only manually authorized protected Main can initiate the existing-service SQL release', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /release_approved:/);
  assert.match(workflow, /offsite_recovery_verified:/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /inputs\.release_approved == true/);
  assert.match(workflow, /inputs\.offsite_recovery_verified == true/);
  assert.match(workflow, /concurrency:/);
  assert.doesNotMatch(workflow, /(?:^|\n)  push:/);
  assert.doesNotMatch(workflow, /(?:^|\n)  pull_request:/);
  assert.doesNotMatch(workflow, /deploy-pages|github-pages|action\/deploy-pages/);
});

test('release fails closed on SQL drift, expired proof, unauthorized PR or unrelated migrations', () => {
  const bash = spawnSync('bash', ['-n'], { input: release, encoding: 'utf8' });
  assert.equal(bash.status, 0, bash.stderr);
  assert.match(release, /sha256sum "\$source_sql"/);
  assert.match(release, /'2472b816193dc56480a447fc0f8a577f41df0580e211d0c3ebbc4ac0e4f608d4'/);
  assert.match(release, /'pulls\/187'/);
  assert.match(release, /get\('git\/ref\/heads\/main'\)/);
  assert.match(release, /'source_backup_run_id'|SOURCE_BACKUP_RUN_ID/);
  assert.match(release, /'database_backup_run_id'|DATABASE_BACKUP_RUN_ID/);
  assert.match(release, /RESTORE_RUN_ID/);
  assert.match(release, /a\.get\('expired'\) is False/);
  assert.match(release, /supabase db push --db-url "\$db_url" --include-all --dry-run/);
  assert.match(release, /diff -u "\$scratch\/expected.txt" "\$scratch\/planned.txt"/);
  assert.match(release, /count\(\*\) FROM supabase_migrations\.schema_migrations|wc -l/);
  assert.match(release, /pre-apply\.tsv/);
  assert.match(release, /service_request_status_history/);
  assert.match(release, /policies-before/);
  assert.match(release, /grants-before/);
  assert.match(release, /counts-before/);
  assert.match(release, /PASS: single service-request SQL recovery/);
  assert.ok(migration.includes('CREATE OR REPLACE FUNCTION public.hris_resolve_tenant_service_request'));
});

test('the SQL release is not an automatic Auth, Pages, Candidate or unrelated migration', () => {
  assert.doesNotMatch(workflow + release, /(?:gh|github) workflow run|workflow_dispatch.*curl/i);
  assert.doesNotMatch(release, /TRUNCATE TABLE|DELETE FROM public\.employees|DROP POLICY/);
  assert.doesNotMatch(release, /db reset|db dump|deploy-pages|update auth\.users/i);
});

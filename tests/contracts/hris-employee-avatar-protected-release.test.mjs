import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const fromRoot = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const avatar = fromRoot('.github/workflows/hris-employee-avatar-sql-release.yml');
const bridge = fromRoot('.github/workflows/hris-owner-command-release-dispatch.yml');
const source = fromRoot('.github/workflows/hris-current-main-source-backup.yml');
const database = fromRoot('.github/workflows/hris-ws05-fresh-backup-dispatch-20261025.yml');
const sql = fromRoot('supabase/migrations/20261109130637_hris_employee_avatar_existing_system_parity.sql');

test('avatar release is manual-only with explicit owner/recovery gates, never a push SQL deploy', () => {
  assert.match(avatar, /workflow_dispatch:/);
  assert.doesNotMatch(avatar, /\n  push:/);
  assert.match(avatar, /inputs\.release_approved == true/);
  assert.match(avatar, /inputs\.offsite_recovery_verified == true/);
  assert.match(avatar, /github\.ref == 'refs\/heads\/main'/);
  assert.match(avatar, /secrets\.HRIS_DB_PASSWORD/);
  assert.match(avatar, /3396d5a8e32fab169e452ed2037e4b9b880dfb913fc1fe2a0da3e2beef416638/);
});

test('avatar release verifies three exact-Main recovery runs, independent hashes and restore', () => {
  for (const marker of [
    'SOURCE_RUN','DATABASE_RUN','RESTORE_RUN','SOURCE_HASH','DATABASE_HASH',
    'head_sha','head_branch','hris-exact-main-source-','hris-db-encrypted-',
    'hris-restore-proof-','sha256sum --check','restore_result=success',
    'source_project=xfuxnljfrgvusbrpvxpa','Protected Main moved',
  ]) assert.ok(avatar.includes(marker), marker);
});

test('avatar release plans exactly one migration with version pin, protects preexisting SQL/rows', () => {
  for (const marker of [
    '20261109130637_hris_employee_avatar_existing_system_parity.sql',
    '20261109174000|hris_service_request_legacy_contract_forward_port',
    '20261109035656|hris_admin_role_access_management',
    'supabase db push --db-url','$scratch/planned.txt','138',
    'cmp -s "$scratch/before.tsv" "$scratch/unchanged.tsv"',
    'cmp -s "$scratch/policies-before.tsv" "$scratch/policies-after.tsv"',
    'test "$before_rows" = "$after_rows"',
    "has_function_privilege('anon','public.employee_get_my_avatar_v1(uuid)','EXECUTE')",
  ]) assert.ok(avatar.includes(marker), marker);
  assert.match(sql, /private\.hris_profile_own_employee/);
  assert.match(sql, /o\.bucket_id='employee-avatars'/);
  assert.match(sql, /2097152/);
});

test('owner-only issue 191 adds an exact SHA avatar release, keeps existing service/access/page commands', () => {
  assert.match(bridge, /github\.event\.comment\.user\.login == 'shihab-tech04'/);
  assert.match(bridge, /github\.event\.comment\.author_association == 'OWNER'/);
  assert.match(bridge, /github\.event\.issue\.number == 191/);
  assert.match(bridge, /'avatar':rf'\/hris-prod avatar /);
  assert.match(bridge, /success_on_main hris-employee-avatar-sql-release\.yml/);
  assert.match(bridge, /gh workflow run hris-employee-avatar-sql-release\.yml/);
  assert.match(bridge, /gh workflow run hris-service-requests-gated-sql\.yml/);
  assert.match(bridge, /gh workflow run hris-release1-platform-access-sql-release\.yml/);
  assert.match(bridge, /gh workflow run deploy-pages\.yml/);
  assert.doesNotMatch(bridge, /supabase db push|psql |apply_migration|curl -X POST/);
});

test('the approved source and database backups refresh on protected Main merge of avatar gate', () => {
  for (const workflow of [source,database]) {
    assert.match(workflow, /branches: \[main\]/);
    assert.match(workflow, /- \.github\/workflows\/hris-employee-avatar-sql-release\.yml/);
  }
  assert.match(source, /git bundle create/);
  assert.match(source, /bundle verify/);
  assert.match(database, /hris-step1-encrypted-db-export\.yml/);
  assert.match(database, /hris-step1-offline-restore-proof\.yml/);
});

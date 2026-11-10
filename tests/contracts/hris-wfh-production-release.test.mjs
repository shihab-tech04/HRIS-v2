import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/hris-wfh-gated-sql-release.yml', import.meta.url), 'utf8');
const dispatcher = readFileSync(new URL('../../.github/workflows/hris-owner-command-release-dispatch.yml', import.meta.url), 'utf8');
const pages = readFileSync(new URL('../../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');
const release = readFileSync(new URL('../../scripts/release/hris-wfh-gated-sql-release.sh', import.meta.url), 'utf8');

test('WFH SQL release is manual, exact-Main, backup-gated, and migration-pinned', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /inputs\.release_approved == true/);
  assert.match(workflow, /inputs\.offsite_recovery_verified == true/);
  assert.match(workflow, /source_backup_run_id:/);
  assert.match(workflow, /database_backup_run_id:/);
  assert.match(workflow, /restore_run_id:/);
  assert.match(release, /20261110120000_hris_work_from_home_request_parity\.sql/);
  assert.match(release, /4b8f41297cebdf98e455eef76913983be528082536a7c81e651b2db2ca7da38c/);
  assert.match(release, /--dry-run/);
  assert.match(release, /diff -u.*expected\.txt.*planned\.txt/);
  assert.match(release, /supabase --yes db push/);
});

test('release checks exact PR/Auth/browser evidence and forbids role or table permission drift', () => {
  assert.match(release, /pulls\/195/);
  assert.match(release, /'check','isolated-hris'/);
  assert.match(release, /OFFSITE_SOURCE_ARCHIVE_SHA256/);
  assert.match(release, /OFFSITE_DATABASE_ARCHIVE_SHA256/);
  assert.match(release, /restore_result=success/);
  assert.match(release, /counts-before\.txt/);
  assert.match(release, /policies-before\.txt/);
  assert.match(release, /grants-before\.txt/);
  assert.match(release, /NOT has_function_privilege\('service_role'/);
});

test('owner release path cannot publish Pages until WFH SQL is verified on exact Main', () => {
  assert.match(dispatcher, /'wfh':rf'\/hris-prod wfh/);
  assert.match(dispatcher, /hris-wfh-gated-sql-release\.yml/);
  assert.match(dispatcher, /wfh\)\s+gh workflow run hris-wfh-gated-sql-release\.yml/);
  assert.match(dispatcher, /pages\)[\s\S]*success_on_main hris-wfh-gated-sql-release\.yml/);
  assert.match(pages, /version='20261110120000'/);
  assert.match(pages, /public\.hris_submit_my_work_from_home_request/);
  assert.match(pages, /public\.hris_resolve_tenant_work_from_home_request/);
});

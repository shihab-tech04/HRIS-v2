import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/hris-step1-offline-restore-proof.yml', import.meta.url), 'utf8');
const start = workflow.indexOf('- name: Rehearse outstanding SQL/RPC forward ports on disposable PG17 only');
const stop = workflow.indexOf('- name: Stop disposable local Supabase only');
const sqlStage = workflow.slice(start, stop);
const migrations = [...sqlStage.matchAll(/^\s{12}(20261024\d{6}_[\w]+\.sql)$/gm)].map(m => m[1]);

test('rehearsal uses a pinned list of nine not-yet-hosted forward ports and protects frozen Projects replay', () => {
  assert.ok(start > 0 && stop > start);
  assert.equal(migrations.length, 9);
  assert.equal(new Set(migrations).size, 9);
  assert.ok(migrations.every(f => !/20261024143000|20261024143100|2026102418350[1-5]/.test(f)));
  assert.match(sqlStage, /ISOLATED_SAAS_RPC_MIGRATION_REHEARSAL_PASS/);
  assert.match(sqlStage, /candidate_add_application_document/);
  assert.match(sqlStage, /platform_hris_accept_tenant_invitation/);
});

test('rehearsal always uses disposable PG17; no hosted URLs, credentials or silent bypass', () => {
  assert.match(sqlStage, /--host 127\.0\.0\.1 --port 55422/);
  assert.match(sqlStage, /--dbname hris_recovered_isolated/);
  assert.match(sqlStage, /PGPASSWORD=postgres/);
  assert.match(sqlStage, /ON_ERROR_STOP=1/);
  assert.match(sqlStage, /before.*local_psql/);
  assert.match(sqlStage, /after.*local_psql/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /- name: Stop disposable local Supabase only\n\s+if: always\(\)/);
  assert.doesNotMatch(sqlStage, /HRIS_DB_PASSWORD|SUPABASE_SERVICE_ROLE_KEY|aws-0-|--disable-triggers|session_replication_role\s*=\s*replica/);
});

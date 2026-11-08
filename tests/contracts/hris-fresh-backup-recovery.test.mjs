import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/hris-step1-offline-restore-proof.yml', import.meta.url), 'utf8');

test('offline restore waits for a completed encrypted Main export', () => {
  assert.match(workflow, /workflow_run:\s*\n\s*workflows: \["HRIS Step 1 - Encrypted database export"\]/);
  assert.match(workflow, /types: \[completed\]/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /github\.event\.workflow_run\.id \|\| inputs\.backup_run_id/);
});

test('restore accepts no stale or unrelated backup', () => {
  assert.match(workflow, /run\.get\('head_sha'\) != os\.environ\['GITHUB_SHA'\]/);
  assert.match(workflow, /run\.get\('repository', \{\}\)\.get\('full_name'\) != repo/);
  assert.match(workflow, /a\.get\('expired'\) is False/);
  assert.match(workflow, /a\.get\('size_in_bytes', 0\) > 0/);
  assert.doesNotMatch(workflow, /40290572482\) ;;|Backup run ID is not in the approved export allowlist/);
});

test('restores only into isolated PostgreSQL and verifies the encrypted archive', () => {
  assert.match(workflow, /sha256sum --check --status encrypted\.sha256/);
  assert.match(workflow, /gpg --batch --yes --quiet/);
  assert.match(workflow, /HRIS_RESTORE_WORKDIR: \/tmp\/synesis-local-hris-restore/);
  assert.match(workflow, /ISOLATED_RESTORE_WITH_DOCUMENTED_LEGACY_FK_EXCEPTION/);
});


const dispatcher = readFileSync(new URL('../../.github/workflows/hris-ws05-fresh-backup-dispatch-20261025.yml', import.meta.url), 'utf8');

test('trusted dispatcher explicitly dispatches restore only after successful matching backup', () => {
  assert.match(dispatcher, /actions: write/);
  assert.match(dispatcher, /- \.github\/workflows\/hris-step1-encrypted-db-export\.yml/);
  assert.match(dispatcher, /- \.github\/workflows\/hris-step1-offline-restore-proof\.yml/);
  assert.match(dispatcher, /- \.github\/scripts\/hris-legacy-auth-fk-counts\.sql/);
  assert.match(dispatcher, /- \.github\/workflows\/ws05-employee-profile-sql-release\.yml/);
  assert.match(dispatcher, /gh workflow run hris-step1-encrypted-db-export\.yml/);
  assert.match(dispatcher, /status.*completed/);
  assert.match(dispatcher, /conclusion.*success/);
  assert.match(dispatcher, /hris-db-encrypted-/);
  assert.match(dispatcher, /gh workflow run hris-step1-offline-restore-proof\.yml/);
});

const exactSourceBackup = readFileSync(new URL('../../.github/workflows/hris-current-main-source-backup.yml', import.meta.url), 'utf8');
test('exact Main backup includes full Git history and local restoration proof', () => {
  assert.match(exactSourceBackup, /branches: \[main\]/);
  assert.match(exactSourceBackup, /git bundle create/);
  assert.match(exactSourceBackup, /git clone -q/);
  assert.match(exactSourceBackup, /cat-file -e/);
  assert.match(exactSourceBackup, /restore\.sha256/);
  assert.match(exactSourceBackup, /persist-credentials: false/);
});

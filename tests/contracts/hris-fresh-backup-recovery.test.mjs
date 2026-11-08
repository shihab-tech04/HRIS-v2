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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bridge = readFileSync(new URL('../../.github/workflows/hris-owner-command-release-dispatch.yml', import.meta.url), 'utf8');

test('production bridge is a manually initiated owner-authenticated issue comment, not a push trigger', () => {
  assert.match(bridge, /issue_comment:\s*\n\s*types: \[created\]/);
  assert.doesNotMatch(bridge, /\n  push:/);
  assert.match(bridge, /github\.event\.issue\.number == 191/);
  assert.match(bridge, /github\.event\.comment\.user\.login == 'shihab-tech04'/);
  assert.match(bridge, /github\.event\.comment\.author_association == 'OWNER'/);
  assert.match(bridge, /test "\$GITHUB_REF" = 'refs\/heads\/main'/);
  assert.match(bridge, /m\.group\(1\)!=os\.environ\['GITHUB_SHA'\]/);
});
test('stage dispatcher invokes original owner-approved protected workflows and waits for prior stages', () => {
  assert.match(bridge, /hris-service-requests-gated-sql\.yml/);
  assert.match(bridge, /hris-release1-platform-access-sql-release\.yml/);
  assert.match(bridge, /deploy-pages\.yml/);
  assert.match(bridge, /-f release_approved=true -f offsite_recovery_verified=true/);
  assert.match(bridge, /source_backup_run_id/);
  assert.match(bridge, /offsite_database_archive_sha256/);
  assert.match(bridge, /success_on_main hris-wfh-gated-sql-release\.yml/);
  assert.match(bridge, /hris-employee-avatar-sql-release\.yml\/runs/);
  assert.match(bridge, /avatar_comparison.*compare/);
  assert.doesNotMatch(bridge, /supabase db push|psql |apply_migration|curl -X POST/);
});

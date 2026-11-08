import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const file = resolve('scripts/release/hris-approved-release.sh');
const script = readFileSync(file, 'utf8');
const host = 'aws-0-ap-northeast-2.pooler.supabase.com';
const invoke = (...args) => spawnSync('bash', [file, ...args], { encoding: 'utf8' });

test('approved HRIS runner is syntax-valid, safe by default and refuses invalid pooler hosts', () => {
  assert.equal(spawnSync('bash', ['-n', file]).status, 0);
  assert.equal(invoke('--host', host).status, 0);
  assert.match(invoke('--host', host).stdout, /DRY RUN: No GitHub or database action taken/);
  assert.equal(invoke('--host', 'https://aws-0-ap-northeast-2.pooler.supabase.com').status, 2);
  assert.equal(invoke('--host', 'db.other.supabase.co').status, 2);
  assert.match(script, /SQL_WF='ws05-employee-profile-sql-release\.yml'/);
  assert.match(script, /PAGES_WF='deploy-pages\.yml'/);
  assert.match(script, /--field release_approved=true/);
  assert.match(script, /--field offsite_recovery_verified=true/);
  assert.match(script, /--field backup_run_id=/);
  assert.match(script, /--field restore_run_id=/);
  assert.equal(invoke('--host', host, '--execute').status, 4);
  assert.match(script, /--field session_pooler_host=/);
  assert.match(script, /run_protected "\$SQL_WF" "\$SHA"\s+run_protected "\$PAGES_WF" "\$SHA"/);
  assert.match(script, /gh run watch "\$id" --repo "\$REPO" --exit-status/);
  assert.match(script, /conclusion" == success/);
  assert.doesNotMatch(script, /supabase db push|psql.*-c|git push|gh api.*POST/);
});

test('approved operator run refuses open PRs before dispatching either production workflow', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hris-operator-test-'));
  try {
    const fake = join(dir, 'gh');
    const lines = [
      '#!/usr/bin/env bash',
      'if [[ "$1" == auth && "$2" == status ]]; then exit 0; fi',
      'if [[ "$1" == api && "$2" == repos/shihab-tech04/HRIS-v2/branches/main ]]; then echo b7cfcd38a5ba7fe86038e6d167cd62439f11d684; exit 0; fi',
      'if [[ "$1" == api && "$2" == repos/shihab-tech04/HRIS-v2/pulls* ]]; then echo 1; exit 0; fi',
      'echo "UNEXPECTED DISPATCH ATTEMPT" >&2',
      'exit 11',
    ];
    writeFileSync(fake, lines.join('\n') + '\n');
    chmodSync(fake, 0o755);
    const result = spawnSync('bash', [file, '--host', host, '--backup-run', '42493910026', '--restore-run', '42494096474', '--offsite-verified', '--execute'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: dir + ':' + process.env.PATH },
    });
    assert.equal(result.status, 4, result.stderr);
    assert.match(result.stderr, /open PRs require review/);
    assert.doesNotMatch(result.stderr, /UNEXPECTED DISPATCH ATTEMPT/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/disposable-auth-postgres-acceptance.yml', import.meta.url), 'utf8');
const checks = readFileSync(new URL('../../.github/workflows/check.yml', import.meta.url), 'utf8');

test('disposable Auth/Postgres/browser acceptance uses trusted standard runners and no deploy or production credentials', () => {
  assert.match(workflow, /branches: \[development\/hris-checkpoints\]/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /timeout-minutes: 60/);
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.match(workflow, /supabase start --workdir/);
  assert.match(workflow, /node tests\/sql\/isolated-auth\/run-local\.mjs/);
  assert.match(workflow, /supabase stop --workdir .*--no-backup/);
  assert.doesNotMatch(workflow, /pull_request_target|deploy-pages|supabase\.co|secrets\./i);
  assert.doesNotMatch(checks, /resetPasswordForEmail|supabase\.co|production Supabase/i);
  assert.match(checks, /if: github\.ref == 'refs\/heads\/development\/hris-checkpoints'/);
  assert.match(checks, /runs-on: ubuntu-24\.04/);
});

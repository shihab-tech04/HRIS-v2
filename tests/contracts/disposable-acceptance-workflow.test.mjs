import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/disposable-auth-postgres-acceptance.yml', import.meta.url), 'utf8');
const checks = readFileSync(new URL('../../.github/workflows/check.yml', import.meta.url), 'utf8');
const localRunner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');

test('disposable Auth/Postgres/browser acceptance uses trusted standard runners and no deploy or production credentials', () => {
  assert.ok(workflow.includes("branches: [development/hris-checkpoints, release/hris-stable-20261017, work/ws05-free-tier-release-candidate-20261022, integration/ws02-security-proof-to-ws05-20261022, integration/ws05-main-final-review-20261022, integration/ws05-leave-nav-e2e-review-20261023]"), "Explicit permitted disposable CI branches must include the reviewed source");
  assert.match(workflow, /github\.ref == 'refs\/heads\/work\/ws05-free-tier-release-candidate-20261022'/);
  assert.match(workflow, /candidate_ref:[\s\S]*?options:\s+- main[\s\S]*?default: main/);
  assert.match(workflow, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/release\/hris-stable-20261017'/);
  assert.ok(workflow.includes("HRIS_CANDIDATE_REF: ${{ (github.ref == 'refs/heads/integration/ws05-main-final-review-20261022' || github.ref == 'refs/heads/integration/ws05-leave-nav-e2e-review-20261023') && 'integration/ws05-candidate-final-review-20261022' || github.ref == 'refs/heads/integration/ws02-security-proof-to-ws05-20261022' && 'integration/candidate-figma-cv-unified-20261022' || github.ref == 'refs/heads/release/hris-stable-20261017' && 'release/candidate-stable-20261017' || inputs.candidate_ref || 'main' }}"), "Paired main/candidate refs must be pinned for isolated acceptance");
  assert.match(workflow, /git clone --depth 1 --branch "\$HRIS_CANDIDATE_REF"/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /timeout-minutes: 60/);
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.match(workflow, /group: hris-disposable-acceptance-\$\{\{ github\.ref \}\}-\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /supabase start --workdir/);
  assert.match(workflow, /HRIS_SUPABASE_TEST_WORKDIR: \/tmp\/synesis-local-hris-test/);
  assert.match(localRunner, /allowedTestWorkdirs = new Set\(\[/);
  assert.match(localRunner, /path\.resolve\('\/private\/tmp\/synesis-local-hris-test'\)/);
  assert.match(localRunner, /path\.resolve\('\/tmp\/synesis-local-hris-test'\)/);
  assert.match(localRunner, /allowedTestWorkdirs\.has\(workdir\)/);
  assert.match(workflow, /node tests\/sql\/isolated-auth\/run-local\.mjs/);
  assert.match(workflow, /node tests\/sql\/isolated-auth\/hris-release-rpc-acceptance\.mjs/);
  assert.match(workflow, /complete missing-RPC and Super Admin invitation acceptance/);
  assert.match(workflow, /supabase db advisors --local --type security --level error --fail-on none --workdir/);
  assert.match(workflow, /supabase stop --workdir .*--no-backup/);
  assert.doesNotMatch(workflow, /pull_request_target|deploy-pages|supabase\.co|secrets\./i);
  assert.doesNotMatch(checks, /resetPasswordForEmail|supabase\.co|production Supabase/i);
  assert.match(checks, /branches: \[release\/hris-stable-20261017\]/);
  assert.match(checks, /runs-on: ubuntu-24\.04/);
});

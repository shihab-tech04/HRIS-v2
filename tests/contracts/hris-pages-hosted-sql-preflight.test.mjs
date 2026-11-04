import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pages = readFileSync(new URL('../../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');

test('Pages release remains manual, explicitly approved, Main-only, and protected', () => {
  assert.match(pages, /^on:\n  workflow_dispatch:/m);
  assert.match(pages, /release_approved:/);
  assert.match(pages, /default: false/);
  assert.match(pages, /github\.ref == 'refs\/heads\/main' && inputs\.release_approved == true/);
  assert.doesNotMatch(pages, /^  push:/m);
  assert.match(pages, /environment:\n      name: github-pages/);
});

test('Pages cannot build or deploy before approved hosted Profile SQL and RLS', () => {
  const gate = pages.indexOf('Fail closed if hosted Employee Profile SQL and access guards are missing');
  const candidate = pages.indexOf('Checkout deployed Candidate contract source');
  const deploy = pages.indexOf('uses: actions/deploy-pages@v4');
  assert.ok(gate >= 0 && gate < candidate && candidate < deploy);
  assert.match(pages, /session_pooler_host:/);
  assert.match(pages, /secrets\.HRIS_DB_PASSWORD/);
  assert.match(pages, /\$PGHOST.*aws-\[0-9\]/);
  for (const check of [
    '20261027040642', '20261030114500',
    'public.employee_get_my_profile_v1(uuid)',
    'public.employee_delete_my_profile_record_v1(uuid,text,uuid)',
    'public.employee_bank_details',
    'relrowsecurity',
    "has_table_privilege('anon'",
    "has_table_privilege('authenticated'",
    "permissive='RESTRICTIVE'",
    'employee_profile_certificate_select_namespace_guard',
    'employee_profile_certificate_insert_namespace_guard',
    'employee_profile_certificate_update_namespace_guard',
    'employee_profile_certificate_delete_namespace_guard',
    'HRIS_PROFILE_HOSTED_READY',
  ]) assert.ok(pages.includes(check), 'Missing deployment precondition: ' + check);
  assert.match(pages, /db_psql\(\)/);
  assert.match(pages, /test "\$result" = 'HRIS_PROFILE_HOSTED_READY'/);
});

test('Release continues exact-asset checks and live browser acceptance', () => {
  for (const s of [
    'npm run lint && npm run test:contracts',
    'npm run test:e2e',
    'git diff --exit-code -- index.html assets .nojekyll',
    "cmp -s \"$expected_js_file\" /tmp/hris-live.js",
    "cmp -s \"$expected_css_file\" /tmp/hris-live.css",
    'Sign in to your workspace',
    'Reset your password',
  ]) assert.ok(pages.includes(s), 'Existing protected release control missing: ' + s);
});

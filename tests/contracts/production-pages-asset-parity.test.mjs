import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');
const deploy = workflow.split('\n  deploy:')[1] || '';

test('manual protected Main Pages release must retain approval and environment gates', () => {
  assert.match(workflow, /workflow_dispatch:[\s\S]+?release_approved:[\s\S]+?default: false/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main' && inputs\.release_approved == true/);
  assert.match(deploy, /environment:[\s\S]+?name: github-pages/);
  assert.match(deploy, /actions\/deploy-pages@v4/);
});

test('deployed live JS and CSS must byte-match the versioned protected Main assets', () => {
  assert.match(deploy, /expected_js_file=/);
  assert.match(deploy, /expected_css_file=/);
  assert.match(deploy, /grep -Fq "src=/);
  assert.match(deploy, /grep -Fq "href=/);
  assert.match(deploy, /cmp -s "\$expected_js_file" \/tmp\/hris-live\.js/);
  assert.match(deploy, /cmp -s "\$expected_css_file" \/tmp\/hris-live\.css/);
  assert.match(deploy, /Published Pages bundle does not match the exact protected Main assets/);
  assert.match(deploy, /exit 1/);
  assert.doesNotMatch(deploy, /PASS: live HRIS serves compiled JS\/CSS and the password-reset entry/);
});

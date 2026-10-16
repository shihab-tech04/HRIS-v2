import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mainWorkflow = readFileSync(new URL('../../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');
const candidateWorkflow = readFileSync(new URL('../../../HRIS-Candidate-v2/.github/workflows/release-preview.yml', import.meta.url), 'utf8');

for (const [name, workflow] of [['Main', mainWorkflow], ['Candidate', candidateWorkflow]]) {
  test(`${name} Pages deployment requires explicit owner approval on main`, () => {
    assert.match(workflow, /workflow_dispatch:\s+inputs:\s+release_approved:[\s\S]*?required: true[\s\S]*?type: boolean[\s\S]*?default: false/);
    assert.doesNotMatch(workflow, /^\s+push:/m);
    assert.match(workflow, /if: github\.ref == 'refs\/heads\/main' && inputs\.release_approved == true/);
  });
}

test('Main Pages write and OIDC permissions are limited to the deploy job', () => {
  assert.match(mainWorkflow, /permissions:\s+contents: read\s+(?:\S[^\n]*\n)?concurrency:/);
  assert.match(mainWorkflow, /deploy:[\s\S]*?permissions:\s+pages: write\s+id-token: write/);
});

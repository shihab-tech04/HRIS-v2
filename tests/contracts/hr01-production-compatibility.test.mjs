import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readPhaseReadiness } from '../../scripts/phase-readiness.mjs';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const stories = JSON.parse(read('docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json')).stories;
const readiness = readPhaseReadiness('05');
const page = read('src/live/OrganizationEmployeeDirectory.tsx');
const locale = read('src/live/project-locale.ts');
const browser = read('tests/sql/isolated-auth/run-employee-directory-browser.mjs');
const runner = read('tests/sql/isolated-auth/run-local.mjs');
const ledger = read('docs/programme/PHASE05_PEOPLE_MASTER_READINESS_2026-10-18.md');
const hostedEvidence = read('docs/evidence/hr01-production-contact-contract-gap-20261020.md');
const activationBrowser = read('tests/sql/isolated-auth/run-hr01-01-employee-creation-browser.mjs');
const overlay = JSON.parse(read('docs/programme/USER_STORY_ACCEPTANCE_OVERLAY.json'));

function story(id) {
  const result = stories.find(item => item.story_id === id);
  assert.ok(result, `canonical story ${id} exists`);
  return result;
}

function readinessRow(id) {
  const result = readiness.stories.find(item => item.story_id === id);
  assert.ok(result, `phase readiness includes ${id}`);
  return result;
}

test('HR01-01 is partial only for verified candidate activation; HR01-05 history remains unclassified', () => {
  assert.equal(story('HR01-01').verbatim_requirement, 'As HR, I want to create employee records.');
  assert.equal(story('HR01-05').verbatim_requirement, 'As HR, I want to preserve employment history.');
  assert.equal(readinessRow('HR01-01').status, 'PARTIAL_ACCEPTANCE');
  assert.equal(readinessRow('HR01-05').status, 'NOT_CLASSIFIED');
  assert.equal(readinessRow('HR01-01').hosted_accepted, false);
  assert.equal(readinessRow('HR01-05').hosted_accepted, false);
  const evidence = overlay.open_story_evidence.find(item => item.id === 'hr01-employee-creation-candidate-activation-partial-20261020');
  assert.deepEqual(evidence.story_ids, ['HR01-01']);
  assert.equal(evidence.classification, 'PARTIAL_ACCEPTANCE');
  assert.equal(evidence.hosted_cross_system_acceptance, 'NOT_VERIFIED');
  assert.equal(evidence.runtime_marker, 'HR01-01_PARTIAL_CANDIDATE_ACTIVATION_BROWSER_PASS');
  assert.match(activationBrowser, /HR01-01_PARTIAL_CANDIDATE_ACTIVATION_BROWSER_PASS/);
  assert.ok(runner.includes("record('HR01-01 partial: the HR workspace activates a verified candidate into a tenant employee record with safe retry'"));
  assert.ok(ledger.includes('HR01-01 (“create employee records”) is **PARTIAL**'));
  assert.ok(ledger.includes('HR01-05 (“preserve employment history”) remains **NOT CLASSIFIED**'));
});

test('HR01-02/06 contact RPC source migration remains replayable after current authorization migrations', () => {
  assert.equal(story('HR01-02').verbatim_requirement, 'As HR, I want to update employee records.');
  assert.equal(story('HR01-06').verbatim_requirement, 'As HR, I want changes to sensitive information auditable.');
  assert.ok(runner.includes('20261014171952_employee_contact_details_editing.sql'));
  assert.ok(runner.includes("record('HR01-02/06 contact RPC source migration reapplies after current authorization schema with the expected signatures, ACL, and search path'"));
  assert.match(runner, /read_empty_search_path[\s\S]*authenticated_execute[\s\S]*anon_denied[\s\S]*service_role_denied/);
  assert.match(hostedEvidence, /contact_rpc_source_replay=.*PASS/);
  assert.match(hostedEvidence, /hosted cross-system acceptance remains `NOT_VERIFIED`/i);
});

test('HR01-02 is partial because the live record editor updates contact fields only', () => {
  assert.equal(story('HR01-02').verbatim_requirement, 'As HR, I want to update employee records.');
  assert.equal(readinessRow('HR01-02').status, 'PARTIAL_ACCEPTANCE');
  assert.match(page, /hris_update_tenant_employee_contact_details/);
  assert.match(page, /isContactApiUnavailable\(cause\)/);
  assert.match(browser, /HR01-02_CONTACT_ONLY_UPDATE_SCOPE_BROWSER_PASS/);
  assert.match(runner, /run-employee-directory-browser\.mjs/);
  assert.match(runner, /employeeDirectoryBrowserOutput\.includes\('HR01-02_CONTACT_ONLY_UPDATE_SCOPE_BROWSER_PASS'\)/);
  assert.match(ledger, /HR01-02 remains \*\*partial\*\*/);
});

test('HR01-06 deployed contact RPC absence is readable, localized, and fails closed', () => {
  assert.equal(story('HR01-06').verbatim_requirement, 'As HR, I want changes to sensitive information auditable.');
  assert.equal(readinessRow('HR01-06').status, 'PARTIAL_ACCEPTANCE');
  assert.match(page, /function isContactApiUnavailable\(cause: unknown\)[\s\S]*?PGRST202/);
  assert.match(page, /Contact editing is currently unavailable\. Contact your administrator\./);
  assert.match(locale, /'Contact editing is currently unavailable\. Contact your administrator\.': '[^']+'/);
  assert.match(browser, /missingContactReadApi = true/);
  assert.match(browser, /missingContactWriteApi = true/);
  assert.match(browser, /HR01-06_PGRST202_CONTACT_READ_SAFE_BROWSER_PASS/);
  assert.match(browser, /HR01-06_PGRST202_CONTACT_UPDATE_SAFE_BROWSER_PASS/);
  assert.match(runner, /employeeDirectoryBrowserOutput\.includes\('HR01-06_PGRST202_CONTACT_READ_SAFE_BROWSER_PASS'\)/);
  assert.match(runner, /employeeDirectoryBrowserOutput\.includes\('HR01-06_PGRST202_CONTACT_UPDATE_SAFE_BROWSER_PASS'\)/);
  assert.match(runner, /run-employee-directory-browser\.mjs/);
  assert.match(hostedEvidence, /contact_read_rpc_present=false/);
  assert.match(hostedEvidence, /contact_update_rpc_present=false/);
  assert.match(hostedEvidence, /20261020044145/);
  assert.equal(readinessRow('HR01-06').hosted_accepted, false);
});

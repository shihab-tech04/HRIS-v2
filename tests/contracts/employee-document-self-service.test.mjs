import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const canonicalPath = '../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json';
const canonicalBytes = readFileSync(new URL(canonicalPath, import.meta.url));
const canonical = JSON.parse(canonicalBytes.toString('utf8'));
const migration = read('../../supabase/migrations/20261017010000_hris_employee_document_self_service.sql');
const component = read('../../src/live/EmployeeDocumentVault.tsx');
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const locale = read('../../src/live/project-locale.ts');
const fixture = read('../sql/isolated-auth/fixture.sql');
const runner = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-leave-evidence-browser.mjs');

test('recovered E03 requirements remain byte-verified and unchanged in source', () => {
  assert.equal(createHash('sha256').update(canonicalBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  assert.equal(canonical.story_total, 1047);
  assert.equal(canonical.module_total, 153);
  const stories = canonical.stories.filter(story => story.module_id === 'E03');
  assert.equal(stories.length, 8);
  assert.deepEqual(stories.map(story => story.story_id), [
    'E03-01', 'E03-02', 'E03-03', 'E03-04', 'E03-05', 'E03-06', 'E03-07', 'E03-08',
  ]);
  assert.deepEqual(stories.map(story => story.verbatim_requirement), [
    'As an employee, I want to view documents stored against my employment record.',
    'As an employee, I want to upload documents HR allows me to provide.',
    'As an employee, I want to replace an expired document.',
    'As an employee, I want to see document verification status.',
    'As an employee, I want to see document expiry dates.',
    'As an employee, I want reminders for documents approaching expiry.',
    'As an employee, I want to download documents I am permitted to access.',
    'As an employee, I want rejected documents to show the reason so I can correct them.',
  ]);
});

test('E03 self-service projection is bound to the authenticated employee and active tenant', () => {
  assert.match(migration, /private\.hris_get_my_employee_documents\(p_tenant_id uuid\)[\s\S]+?SECURITY DEFINER[\s\S]+?SET search_path = ''/);
  assert.match(migration, /auth\.uid\(\) IS NULL OR NOT public\.is_live_session\(\)/);
  assert.match(migration, /public\.hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(migration, /WHEN lower\(COALESCE\(d\.verification_status, ''\)\) = 'rejected' THEN d\.verification_note/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_get_my_employee_documents\(uuid\) FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.hris_get_my_employee_documents\(uuid\) TO authenticated/);
  assert.match(runner, /hris_get_my_employee_documents/);
  assert.match(runner, /mismatched tenant, cross-tenant identity, manager, and anonymous sessions/);
  assert.match(fixture, /Synthetic correction reason for the employee\./);
});

test('E03 read, download, retry, refresh and responsive bilingual journeys are mounted for employees only', () => {
  assert.match(workspace, /if \(isEmployee\) items\.push\(\{ id: 'my-documents', label: 'My Documents'/);
  assert.match(workspace, /page === 'my-documents' && isEmployee && <EmployeeDocumentVault/);
  assert.match(component, /supabase\.rpc\('hris_get_my_employee_documents'/);
  assert.match(component, /function ownerDocumentPath/);
  assert.match(component, /parsed\.origin !== configured\.origin/);
  assert.match(component, /parts\[0\] !== userId/);
  assert.match(component, /status === 'rejected' && document\.verification_note/);
  assert.match(component, /Unable to load your documents\./);
  assert.match(component, /Download started/);
  for (const text of ['My Documents', 'Correction required', 'Refresh documents', 'No documents are available yet']) {
    assert.ok(locale.includes(`'${text}':`), `Missing Bengali translation for ${text}`);
  }
  assert.match(browser, /EMPLOYEE_DOCUMENTS_BROWSER_ACCEPTANCE=PASS/);
  assert.match(browser, /Employee document self-service mobile/);
  assert.match(browser, /Employee documents Bengali mobile/);
  assert.match(browser, /Synthetic temporary outage\./);
  assert.match(runner, /20261017010000_hris_employee_document_self_service\.sql/);
  assert.match(runner, /Employee document self-service browser reads, recovers, downloads, localizes, and stays responsive/);
});

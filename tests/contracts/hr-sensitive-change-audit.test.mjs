import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalogue = JSON.parse(read('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json'));
const contactSql = read('../../supabase/migrations/20261014171952_employee_contact_details_editing.sql');
const runner = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-employee-directory-browser.mjs');

test('HR01-06 records a verified partial boundary for sensitive contact-change auditing', () => {
  const story = catalogue.stories.find(item => item.story_id === 'HR01-06');
  assert.ok(story);
  assert.equal(story.module_id, 'HR01');
  assert.equal(story.role_name, 'HR');
  assert.equal(story.source_locator.line, 873);
  assert.equal(story.verbatim_requirement, 'As HR, I want changes to sensitive information auditable.');
  assert.equal(story.status, 'NOT TESTED');

  assert.ok(contactSql.includes('INSERT INTO public.admin_audit_logs'));
  assert.ok(contactSql.includes('employee.contact_details_updated'));
  assert.ok(contactSql.includes('changed_fields'));
  assert.ok(runner.includes('contactAudit.count === 1'));
  assert.ok(runner.includes("contactAudit.details.includes('official_email')"));
  assert.ok(runner.includes("contactAudit.details.includes('emergency_contact_phone')"));
  assert.ok(runner.includes('const contactAuditRedactionComplete = contactAudit.count === 1'));
  assert.ok(runner.includes('contactAuditPayload.tenant_id === ids.tenantA'));
  assert.ok(runner.includes('Object.keys(contactUpdatePayload).sort()'));
  assert.ok(runner.includes('Object.values(contactUpdatePayload).some'));
  assert.ok(runner.includes('&& contactAuditRedactionComplete'));
  assert.ok(runner.includes("record('HR01-06 partial: authorized HR contact changes emit a redacted changed-field audit event'"));
  assert.ok(runner.includes("employeeDirectoryBrowserOutput.includes('HR01-06_CONTACT_AUDIT_BROWSER_PASS')"));
  assert.ok(browser.includes('HR01-06_CONTACT_AUDIT_BROWSER_PASS'));
});

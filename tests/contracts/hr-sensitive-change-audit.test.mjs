import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalogue = JSON.parse(read('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json'));
const contactSql = read('../../supabase/migrations/20261014171952_employee_contact_details_editing.sql');
const profileChangeSql = read('../../supabase/migrations/20261017130000_employee_profile_change_schema_contract.sql');
const runner = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-employee-directory-browser.mjs');

test('HR01-06 records a partial boundary and verifies redacted auditing for all supported contact fields', () => {
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
  for (const field of [
    'official_email', 'personal_email', 'phone', 'official_phone', 'address',
    'mailing_address', 'emergency_contact_name', 'emergency_contact_phone',
    'emergency_contact_relation',
  ]) assert.ok(contactSql.includes(`v_before.${field} IS DISTINCT FROM`), `SQL does not track ${field}.`);
  assert.ok(runner.includes('contactAudit.count === 1'));
  assert.ok(runner.includes('auditedContactFieldNames.every(field => contactAudit.details.includes(field))'));
  assert.ok(runner.includes('.every(value => !contactAudit.details.includes(value))'));
  assert.ok(runner.includes("auditedContactFieldNames = Object.keys(contactUpdatePayload)"));
  assert.ok(runner.includes("record('HR01-06 partial: authorized HR contact changes emit a redacted changed-field audit event'"));
  assert.ok(runner.includes("employeeDirectoryBrowserOutput.includes('HR01-06_CONTACT_AUDIT_BROWSER_PASS')"));
  assert.ok(browser.includes('HR01-06_CONTACT_AUDIT_BROWSER_PASS'));

  const protectedProfileFields = [
    'full_name', 'official_email', 'personal_email', 'official_phone', 'address', 'mailing_address',
    'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation',
  ];
  for (const field of protectedProfileFields) {
    assert.ok(profileChangeSql.includes(`'${field}'`), `Deployed profile contract does not support ${field}.`);
    assert.ok(runner.includes(`'${field}'`), `Runtime redaction test does not cover ${field}.`);
  }
  assert.ok(profileChangeSql.includes("jsonb_build_object('employee_id', r.employee_id, 'field_key', r.field_key)"));
  assert.ok(runner.includes("record('HR01-06 partial: all nine supported protected profile fields persist with field-only audit events'"));
});

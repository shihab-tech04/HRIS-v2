import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const profile = read('../../src/live/EmployeeProfileFigma.tsx');
const modal = read('../../src/live/EmployeeProfileEditModal.tsx');
const history = read('../../src/live/ProfileChangeRequests.tsx');
const browser = read('../browser/employee-profile-figma.spec.ts');

test('Employee Profile reads through the tenant-scoped projection and retains the approved Figma anchors', () => {
  assert.match(profile, /supabase\.rpc\('employee_get_my_profile_v1', \{ p_tenant_id: tenantId \}\)/);
  assert.match(profile, /response\.tenant_id !== tenantId/);
  assert.match(profile, /data-figma-node="66:72042"/);
  assert.match(profile, /data-figma-node="66:72092"/);
  assert.match(profile, /aria-label=.*words\.personalDetails/);
  assert.match(profile, /aria-label={words\.editContactDetails}/);
  assert.match(profile, /aria-label={words\.editContactDetails}[\s\S]*kind:'request-contact'/);
  assert.doesNotMatch(profile + modal, /from\('(employees|employee_education|employee_experience|employee_family_members|employee_training|employee_certifications)'/);
});

test('profile correction controls use the approved HR review RPC and tenant/value/reason arguments', () => {
  const personal = modal.match(/'request-personal': \[([^\]]+)\]/)?.[1] || '';
  const contact = modal.match(/'request-contact': \[([^\]]+)\]/)?.[1] || '';
  const fields = source => [...source.matchAll(/'([a-z_]+)'/g)].map(match => match[1]);
  assert.deepEqual(fields(personal), [
    'full_name','father_name','mother_name','date_of_birth','birthplace','blood_group','gender',
    'religion','nationality','marital_status','nid_number','passport_number','etin_number',
  ]);
  assert.deepEqual(fields(contact), [
    'official_email','phone','personal_email','official_phone','address','mailing_address',
    'emergency_contact_name','emergency_contact_phone','emergency_contact_relation',
  ]);
  assert.match(modal, /supabase\.rpc\('employee_submit_profile_change_request'/);
  assert.match(modal, /p_tenant_id: tenantId, p_field_key: selectedField/);
  assert.match(modal, /p_requested_value: proposed, p_reason:/);
  assert.match(modal, /maxLength=\{1000\}/);
  assert.match(modal, /<form noValidate onSubmit=/);
  assert.match(modal, /selectedField === 'gender' \? <select/);
  assert.doesNotMatch(modal, /from\('employees'\)|\.from\('employee_profile_change_requests'\)/);
});

test('profile record editors call only tenant-scoped v1 save RPCs for Figma-backed fields', () => {
  const expected = [
    'employee_save_my_education_v1','employee_save_my_experience_v1','employee_save_my_training_v1',
    'employee_save_my_certification_v1','employee_save_my_family_member_v1','employee_save_my_bank_v1',
  ];
  const actual = [...modal.matchAll(/supabase\.rpc\('(employee_save_my_[a-z_]+_v1)'/g)].map(match => match[1]);
  assert.deepEqual(actual.sort(), expected.sort());
  assert.doesNotMatch(modal, /supabase\.rpc\(\s*[a-zA-Z_$][\w$]*\s*[,)]/,
    'each profile save RPC must remain a statically inventoried literal');
  assert.match(modal, /p_tenant_id: tenantId, p_payload: payload/);
  assert.match(modal, /employee-documents'\)\.upload\(path, file/);
  assert.match(modal, /file\.size > 10 \* 1024 \* 1024/);
  assert.match(modal, /upsert: false/);
  assert.match(modal, /currently_studying/);
  assert.match(modal, /company_website/);
  assert.match(modal, /present_address/);
  assert.doesNotMatch(modal, /account_name/);
  assert.match(history, /employee_get_my_profile_change_requests/);
});

test('employee profile acceptance covers errors, responsive EN/BN, sensitive-value masking, and persisted sections', () => {
  for (const token of [
    'state=save-error','Check the highlighted fields','employee_submit_profile_change_request',
    'synthetic-bank-secret-123456','Synthetic family member','Synthetic certification',
    'locale=bn','document.documentElement.scrollWidth',
  ]) assert.ok(browser.includes(token));
  assert.match(browser, /375, 768, 1280, 1920/);
  assert.match(browser, /toHaveLength\(0\)/);
});

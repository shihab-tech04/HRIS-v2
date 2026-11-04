import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// E02-09 historical branch forward-port: preserve the official department,
// designation and grade codes without replacing the approved Figma layout.
const profile = readFileSync(new URL('../../src/live/EmployeeProfileFigma.tsx', import.meta.url), 'utf8');
const contract = readFileSync(new URL('../../supabase/migrations/20261024082000_employee_employment_details_e02_09.sql', import.meta.url), 'utf8');

test('employment names retain approved codes from the tenant-scoped RPC', () => {
  assert.ok(profile.includes("'employee_get_my_employment_info_v1', { p_tenant_id: tenantId }"));
  for (const code of ['department_code', 'designation_code', 'grade_code']) {
    assert.ok(profile.includes("'" + code + "'"), 'missing allowed E02-09 code: ' + code);
    assert.ok(contract.includes(code), 'missing approved SQL field: ' + code);
  }
  for (const pair of [
    "employmentNameWithCode('designation_title', 'designation_code')",
    "employmentNameWithCode('department_name', 'department_code')",
    "employmentNameWithCode('grade_name', 'grade_code')"
  ]) assert.ok(profile.includes(pair), 'missing name/code field: ' + pair);
  assert.ok(profile.includes("if (typeof code !== 'string' || !code.trim()) return label"));
  assert.ok(!profile.includes(".from('employees')"), 'must not query private employee table directly');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// E02-09 historical branch forward-port: preserve the official department,
// designation and grade codes, but never roll back the approved Figma layout.
const profile = readFileSync(new URL('../../src/live/EmployeeProfileFigma.tsx', import.meta.url), 'utf8');
const contract = readFileSync(new URL('../../supabase/migrations/20261024082000_employee_employment_details_e02_09.sql', import.meta.url), 'utf8');

test('employment names retain their approved codes without a second private data source', () => {
  assert.match(profile, /'employee_get_my_employment_info_v1', \\{ p_tenant_id: tenantId \\}/);
  for (const code of ['department_code', 'designation_code', 'grade_code']) {
    assert.match(profile, new RegExp(`'${code}'`), `missing allowed E02-09 code: ${code}`);
    assert.match(contract, new RegExp(`\\b${code}\\b`), `missing approved SQL field: ${code}`);
  }
  assert.match(profile, /employmentNameWithCode\\('designation_title', 'designation_code'\\)/);
  assert.match(profile, /employmentNameWithCode\\('department_name', 'department_code'\\)/);
  assert.match(profile, /employmentNameWithCode\\('grade_name', 'grade_code'\\)/);
  assert.match(profile, /if \\(typeof code !== 'string' \\|\\| !code\\.trim\\(\\)\\) return label/);
  assert.doesNotMatch(profile, /\\.from\\(['"](?:employees|employee_employment_details)['"]\\)/);
});

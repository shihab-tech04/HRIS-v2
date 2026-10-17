import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalogue = JSON.parse(read('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json'));
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const locale = read('../../src/live/project-locale.ts');
const runtime = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-leave-evidence-browser.mjs');
const availabilityMigration = read('../../supabase/migrations/20261017060001_hris_employee_unavailable_leave_type_reason.sql');

test('E07-01 through E07-04 render the authenticated employee’s permitted types and persisted leave balances in EN/BN', () => {
  const stories = new Map(catalogue.stories.map(story => [story.story_id, story]));
  assert.equal(stories.get('E07-01')?.verbatim_requirement, 'As an employee, I want to see all leave types available to me.');
  assert.equal(stories.get('E07-02')?.verbatim_requirement, 'As an employee, I want to see available balance.');
  assert.equal(stories.get('E07-03')?.verbatim_requirement, 'As an employee, I want to see used leave.');
  assert.equal(stories.get('E07-04')?.verbatim_requirement, 'As an employee, I want to see pending leave.');
  assert.match(workspace, /data-testid=\{`personal-leave-balance-\$\{String\(row\.leave_type_id \|\| index\)\}`\}/);
  assert.match(workspace, /personal-leave-available-balance[\s\S]*?displayLocalizedNumber\(row\.available_days, locale\)/);
  assert.match(workspace, /displayLocalizedNumber\(row\.used_days, locale\)/);
  assert.match(workspace, /displayLocalizedNumber\(row\.pending_days, locale\)/);
  assert.match(locale, /'Used': 'ব্যবহৃত'/);
  assert.match(locale, /'Pending': 'অপেক্ষমাণ'/);
  assert.match(runtime, /const personalLeaveBalanceResponse = queryAs\(employeeA,[\s\S]*?hris_get_my_dashboard_data/);
  assert.match(runtime, /HRIS_LOCAL_LEAVE_BALANCE_USED_DAYS: String\(personalLeaveBalance\.used_days\)/);
  assert.match(runtime, /HRIS_LOCAL_LEAVE_BALANCE_PENDING_DAYS: String\(personalLeaveBalance\.pending_days\)/);
  assert.match(runtime, /HRIS_LOCAL_LEAVE_BALANCE_AVAILABLE_DAYS: String\(personalLeaveBalance\.available_days\)/);
  assert.match(runtime, /HRIS_LOCAL_LEAVE_TYPES_JSON: JSON\.stringify\(personalLeaveTypes\.map/);
  assert.match(browser, /LEAVE_BALANCE_DETAIL_BROWSER_ACCEPTANCE=PASS/);
  assert.match(browser, /LEAVE_TYPES_VISIBLE_BROWSER_ACCEPTANCE=PASS/);
  assert.match(browser, /personal-leave-available-balance/);
  assert.match(browser, /HRIS_LOCAL_LEAVE_BALANCE_AVAILABLE_DAYS, 'bn'/);
  assert.match(browser, /getByText\(\`\$\{localizedBalance\(process\.env\.HRIS_LOCAL_LEAVE_BALANCE_USED_DAYS, 'bn'\)\} দিন\`/);
  assert.match(browser, /getByText\(\`\$\{localizedBalance\(process\.env\.HRIS_LOCAL_LEAVE_BALANCE_PENDING_DAYS, 'bn'\)\} দিন\`/);
});

test('E07-08 explains existing leave eligibility without exposing profile values or changing request options', () => {
  const stories = new Map(catalogue.stories.map(story => [story.story_id, story]));
  assert.equal(stories.get('E07-08')?.verbatim_requirement,
    'As an employee, I want to understand why a leave type is unavailable to me.');
  assert.match(availabilityMigration, /'unavailable_leave_types',coalesce\(/);
  assert.match(availabilityMigration, /'availability_reason_code','profile_eligibility'/);
  assert.match(availabilityMigration, /lt\.tenant_id=p_tenant_id AND lt\.active IS TRUE/);
  assert.match(availabilityMigration, /upper\(lt\.applicable_gender\)<>upper\(coalesce\(v_gender,''\)\)/);
  assert.doesNotMatch(availabilityMigration, /'applicable_gender'\s*,/);
  assert.doesNotMatch(availabilityMigration, /'gender'\s*,v_gender/);
  assert.match(workspace, /personal-leave-unavailable-types/);
  assert.match(workspace, /personal-leave-unavailability-reason/);
  assert.match(locale, /'Unavailable leave types': 'যেসব ছুটির ধরন পাওয়া যাচ্ছে না'/);
  assert.match(locale, /'This leave type does not meet the eligibility requirements for your employee profile\.'/);
  assert.match(runtime, /E07-08 explains an unavailable active leave type without exposing profile values or crossing tenants/);
  assert.match(runtime, /HRIS_LOCAL_UNAVAILABLE_LEAVE_TYPES_JSON/);
  assert.match(browser, /unavailable leave type appeared in the request form options/);
  assert.match(browser, /Employee leave availability explanation mobile after refresh/);
});

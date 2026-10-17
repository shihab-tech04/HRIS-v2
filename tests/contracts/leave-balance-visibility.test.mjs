import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalogue = JSON.parse(read('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json'));
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const locale = read('../../src/live/project-locale.ts');
const runtime = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-leave-evidence-browser.mjs');

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

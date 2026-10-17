import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalogueBytes = readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url));
const catalogue = JSON.parse(catalogueBytes.toString('utf8'));
const component = read('../../src/live/EmployeeDashboardQuickAccess.tsx');
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const browser = read('../sql/isolated-auth/run-employee-dashboard-attendance-browser.mjs');
const locale = read('../../src/live/project-locale.ts');

test('dashboard quick access implements the byte-verified E01-09 story against existing routes', () => {
  assert.equal(createHash('sha256').update(catalogueBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  const story = catalogue.stories.find(item => item.story_id === 'E01-09');
  assert.equal(story?.module_id, 'E01');
  assert.equal(story?.source_locator.line, 19);
  assert.equal(story?.verbatim_requirement, 'As an employee, I want quick access to frequently used actions such as attendance, leave, payslip, profile, and requests.');
  for (const label of ['Attendance', 'Leave', 'My Payslips', 'My profile', 'My Requests']) {
    assert.match(component, new RegExp(`label: '${label}'`));
  }
  assert.match(workspace, /onOpenLeave=\{\(\) => navigate\('my-leave'\)\}/);
  assert.match(workspace, /onOpenPayslips=\{\(\) => navigate\('my-payslips'\)\}/);
  assert.match(workspace, /onOpenRequests=\{\(\) => navigate\('my-service-requests'\)\}/);
  assert.match(workspace, /onOpenAttendance=\{\(\) => \{[\s\S]*?employee-today-heading/);
  assert.match(workspace, /onOpenProfile=\{\(\) => \{[\s\S]*?employee-profile-heading/);
  for (const text of ['Quick access', 'My Payslips', 'My profile']) assert.ok(locale.includes(`'${text}':`));
});

test('isolated employee browser journey activates each shortcut in EN/BN on mobile and desktop', () => {
  assert.match(browser, /EMPLOYEE_DASHBOARD_QUICK_ACCESS_BROWSER_ACCEPTANCE=PASS/);
  for (const route of ['Personal leave', 'My Payslips', 'My Service Requests']) assert.ok(browser.includes(route));
  assert.match(browser, /Employee dashboard quick access mobile/);
  assert.match(browser, /Employee dashboard quick access desktop/);
  assert.match(browser, /Quick access.*দ্রুত প্রবেশ|দ্রুত প্রবেশ/);
  assert.match(browser, /উপস্থিতি/);
});

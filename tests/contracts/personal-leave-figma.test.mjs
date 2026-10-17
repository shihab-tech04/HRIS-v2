import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const browser = read('../sql/isolated-auth/run-leave-evidence-browser.mjs');
const personalLeave = workspace.slice(workspace.indexOf('function EmployeePersonalLeave('), workspace.indexOf('type TimesheetDraftEntry'));

test('Personal Leave preserves its workflow while matching the approved Figma frame 3:39880 summary and history layout', () => {
  assert.match(personalLeave, /data-testid="personal-leave-summary"[\s\S]*?md:grid-cols-\[minmax\(190px,0\.62fr\)_minmax\(0,2fr\)\]/);
  assert.match(personalLeave, /2xl:grid-cols-\[358px_minmax\(0,1fr\)\]/);
  assert.match(personalLeave, /summaryLayout showBalances=\{false\} showHistory=\{false\}/);
  assert.match(personalLeave, /aria-labelledby="personal-leave-balance-heading"[^>]*className="[^"]*md:border-l/);
  assert.match(personalLeave, /grid-cols-2 gap-1\.5 sm:grid-cols-3 lg:grid-cols-6/);
  assert.match(personalLeave, /Available leave breakdown/);
  assert.match(personalLeave, /id="personal-leave-history-heading"/);
  assert.match(personalLeave, /Leave history of/);
  assert.match(personalLeave, /Export CSV/);
  assert.ok(personalLeave.indexOf('data-testid="personal-leave-history"') < personalLeave.indexOf('<EmployeeLeaveCalendar'),
    'the primary history should appear before the additional calendar, as in the reference frame');
  assert.match(personalLeave, /EmployeeLeaveCalendar key=\{tenantId\}/);
  assert.match(personalLeave, /historyHasEvidence \? 'min-w-\[860px\]' : 'min-w-\[720px\]'/);
});

test('isolated Personal Leave acceptance checks the summary layout on mobile and desktop without changing leave policy calculations', () => {
  assert.match(browser, /getByTestId\('personal-leave-summary'\)/);
  assert.match(browser, /personalLeaveSummaryColumns/);
  assert.match(browser, /Personal leave summary mobile/);
  assert.match(browser, /Personal leave summary desktop/);
  assert.match(browser, /width: 1920, height: 1080/);
  assert.match(browser, /358px request panel at 1920px/);
  assert.match(browser, /personal-leave-history/);
  assert.match(browser, /My leave calendar/);
  assert.doesNotMatch(personalLeave, /reduce\([^\n]*available_days|sum\([^\n]*available_days/);
});

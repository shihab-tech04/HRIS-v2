import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isValidIsoCalendarDate } from '../../src/live/iso-calendar-date.mjs';

test('shared calendar validation rejects impossible dates in both shifts and timesheets', () => {
  for (const value of ['2024-02-29', '2000-02-29', '2026-02-28', '2026-04-30', '2026-12-31']) {
    assert.equal(isValidIsoCalendarDate(value), true, value);
  }
  for (const value of ['2026-02-29', '2026-02-31', '1900-02-29', '2026-04-31', '2026-11-31',
    '2026-13-01', '2026-01-00', '0000-01-01', '2026-1-01', '', null, undefined]) {
    assert.equal(isValidIsoCalendarDate(value), false, String(value));
  }
});

test('E15 editor rejects empty drafts and bad dates before saving without changing existing period rules', () => {
  const source = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
  const editorStart = source.indexOf('function EmployeeTimesheets(');
  const editorEnd = source.indexOf('function ProjectTimesheetReviewQueue(');
  const editor = source.slice(editorStart, editorEnd);
  assert.ok(editorStart > 0 && editorEnd > editorStart);
  assert.match(editor, /!isValidIsoCalendarDate\(periodStart\) \|\| !isValidIsoCalendarDate\(periodEnd\)/);
  assert.match(editor, /entries\.length === 0/);
  assert.match(editor, /!isValidIsoCalendarDate\(entry\.work_date\)/);
  assert.match(editor, /A daily timesheet must use one date/);
  assert.match(editor, /A weekly timesheet can cover up to seven consecutive dates/);
  assert.match(editor, /A day cannot contain more than 24 total hours/);
  const locale = readFileSync(new URL('../../src/live/project-locale.ts', import.meta.url), 'utf8');
  assert.match(locale, /'Add at least one timesheet entry\.': 'অন্তত একটি টাইমশিট এন্ট্রি যোগ করুন।'/);
  assert.match(locale, /'Choose valid timesheet period dates\.':/);
  const browser = readFileSync(new URL('../browser/employee-timesheets.spec.ts', import.meta.url), 'utf8');
  assert.match(browser, /toContainText\('অন্তত একটি টাইমশিট এন্ট্রি যোগ করুন।'\)/);
  assert.match(browser, /expect\(rpcPayloads\)\.toHaveLength\(0\)/);
});

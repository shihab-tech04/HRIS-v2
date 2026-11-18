import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isValidRosterDate, rosterRangeIssue, isDateWithinRosterRange } from '../../src/live/roster-date-utils.mjs';

test('calendar validation rejects rolled-over dates without excluding leap years', () => {
  for (const date of ['2024-02-29', '2000-02-29', '2026-02-28', '2026-04-30', '2026-12-31']) {
    assert.equal(isValidRosterDate(date), true, date);
  }
  for (const date of ['2026-02-29', '2026-02-31', '1900-02-29', '2026-04-31', '2026-13-01',
    '2026-00-01', '2026-01-00', '0000-01-01', '2026-1-01', '', null, undefined]) {
    assert.equal(isValidRosterDate(date), false, String(date));
  }
});

test('31-day inclusive roster window allows valid boundaries and denies bad ranges', () => {
  assert.equal(rosterRangeIssue('2026-01-01', '2026-01-31'), null);
  assert.equal(rosterRangeIssue('2026-01-01', '2026-02-01'), 'too_long');
  assert.equal(rosterRangeIssue('2026-02-27', '2026-03-01'), null);
  assert.equal(rosterRangeIssue('2026-02-31', '2026-03-01'), 'invalid');
  assert.equal(rosterRangeIssue('2026-07-05', '2026-07-04'), 'invalid');
});

test('date-filtered roster response must contain only in-range calendar dates', () => {
  assert.equal(isDateWithinRosterRange('2026-11-20', '2026-11-18', '2026-11-24'), true);
  assert.equal(isDateWithinRosterRange('2026-11-17', '2026-11-18', '2026-11-24'), false);
  assert.equal(isDateWithinRosterRange('2026-11-25', '2026-11-18', '2026-11-24'), false);
  assert.equal(isDateWithinRosterRange('2026-11-31', '2026-11-18', '2026-12-10'), false);
});

test('E12/E13 roster UI uses guards before RPC and for returned shift/change records', () => {
  const source = readFileSync(new URL('../../src/live/MyEmployeeRoster.tsx', import.meta.url), 'utf8');
  assert.match(source, /return isValidRosterDate\(value\);/);
  assert.match(source, /rosterRangeIssue\(start, end\)/);
  assert.match(source, /!isDateWithinRosterRange\(row\.assignment_date, rangeStart, rangeEnd\)/);
  assert.match(source, /const invalidRange = rangeError\(rangeStart, rangeEnd, locale\);/);
  assert.match(source, /const invalidRange = rangeError\(draftStart, draftEnd, locale\);/);
});

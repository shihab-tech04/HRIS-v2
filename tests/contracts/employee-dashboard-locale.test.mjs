import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const localeSource = read('../../src/live/project-locale.ts');
const browser = read('../sql/isolated-auth/run-employee-dashboard-attendance-browser.mjs');

const componentSections = [
  workspace.slice(workspace.indexOf('function PersonalLeaveRequests('), workspace.indexOf('function EmployeePersonalLeave(')),
  workspace.slice(workspace.indexOf('function PersonalAttendanceCorrections('), workspace.indexOf('function EmployeeOverview(')),
  workspace.slice(workspace.indexOf('function EmployeeOverview('), workspace.indexOf('export function LiveHrisWorkspace(')),
];

test('employee dashboard and inline request journeys have unique Bengali translations for literal keys', () => {
  const entries = [...localeSource.matchAll(/^\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)',?\s*$/gm)];
  const translations = new Map(entries.map(([, key, value]) => [key.replaceAll("\\'", "'"), value.replaceAll("\\'", "'")]));
  assert.equal(translations.size, entries.length, 'Bengali translation keys must be unique');
  for (const section of componentSections) {
    for (const [, rawKey] of section.matchAll(/\btxf?\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      const key = rawKey.replaceAll("\\'", "'");
      assert.ok(translations.has(key), `missing Bengali dictionary entry: ${key}`);
      assert.notEqual(translations.get(key), key, `translation is only copied in English: ${key}`);
    }
  }
  for (const phrase of ['Personal Dashboard', 'Today’s attendance', 'Attendance month', 'Request attendance correction', 'No complete check-in and check-out pairs are available for {month}.']) {
    assert.ok(translations.get(phrase)?.length > 0, `missing Employee Dashboard translation: ${phrase}`);
    assert.notEqual(translations.get(phrase), phrase, `${phrase} is not translated`);
  }
  for (const phrase of ['Weekly work-hours data', 'Week', 'Complete check-in pairs']) {
    assert.ok(translations.get(phrase)?.length > 0, `missing accessible weekly attendance translation: ${phrase}`);
    assert.notEqual(translations.get(phrase), phrase, `${phrase} is not translated`);
  }
});

test('Employee Dashboard shares the active locale with date, number, leave, and correction views', () => {
  assert.match(workspace, /function EmployeeOverview\(\{ tenantId, tenantName, userId, locale \}/);
  assert.match(workspace, /<EmployeeOverview tenantId=\{tenantId\} tenantName=\{tenantName\} userId=\{userId\} locale=\{locale\} \/>/);
  assert.match(workspace, /showHistory=\{false\} locale=\{locale\} \/>/);
  assert.ok(workspace.includes('onRefresh={() => load(false)} locale={locale} />'));
  assert.match(workspace, /toLocaleString\(locale === 'bn' \? 'bn-BD' : 'en-US'/);
  assert.match(workspace, /toLocaleDateString\(locale === 'bn' \? 'bn-BD' : 'en-US'/);
  assert.match(workspace, /const noticeDate = \(value: string\) => locale === 'bn' \? employeeDate\(value\) : value;/);
});

test('real Auth/Postgres browser journey checks Bengali persistence, validation, cancellation, and both viewport sizes', () => {
  for (const phrase of [
    'Switch language to Bengali', 'ব্যক্তিগত ড্যাশবোর্ড', 'synesis-hris-locale',
    'উপস্থিতির মাস', 'সংশোধনের জন্য অন্তত একটি উপস্থিতির তথ্য দিন।',
    'Employee attendance month Bengali mobile', 'page.reload()',
  ]) assert.ok(browser.includes(phrase), `browser acceptance is missing ${phrase}`);
});

test('employee attendance chart exposes its computed weekly values as an accessible table', () => {
  const employeeOverview = workspace.slice(workspace.indexOf('function EmployeeOverview('), workspace.indexOf('export function LiveHrisWorkspace('));
  assert.match(workspace, /function displayAttendanceStatus\(value: unknown\)/);
  assert.match(employeeOverview, /tx\(displayAttendanceStatus\(todayRecord\.status\)\)/);
  assert.match(employeeOverview, /tx\(displayAttendanceStatus\(row\.status\)\)/);
  assert.match(employeeOverview, /<div className="sr-only">\s*<table aria-label=\{tx\('Weekly work-hours data'\)\}>/);
  assert.match(employeeOverview, /weekBuckets\.map\(\(bucket, index\) => <tr key=\{bucket\.label\}>/);
  assert.match(employeeOverview, /employeeNumber\(bucket\.hours, 1\)/);
  assert.match(employeeOverview, /employeeNumber\(bucket\.count\)/);
  assert.match(browser, /getByRole\('table', \{ name: 'Weekly work-hours data', exact: true \}\)/);
  assert.match(browser, /getByRole\('table', \{ name: 'সাপ্তাহিক কাজের সময়ের তথ্য', exact: true \}\)/);
});

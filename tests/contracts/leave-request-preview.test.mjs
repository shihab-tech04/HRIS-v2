import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalogueBytes = readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url));
const catalogue = JSON.parse(catalogueBytes.toString('utf8'));
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const locale = read('../../src/live/project-locale.ts');
const sql = read('../../supabase/migrations/20261016183000_hris_leave_balance_allocation_snapshot.sql');
const runtime = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-leave-evidence-browser.mjs');

test('E08-07 through E08-09 map to the exact catalogue and mirror the existing isolated leave contract', () => {
  assert.equal(createHash('sha256').update(catalogueBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  const stories = new Map(catalogue.stories.map(story => [story.story_id, story]));
  assert.equal(stories.get('E08-07')?.verbatim_requirement, 'As an employee, I want the system to calculate requested leave days correctly.');
  assert.equal(stories.get('E08-08')?.verbatim_requirement, 'As an employee, I want holidays and weekends handled according to policy.');
  assert.equal(stories.get('E08-09')?.verbatim_requirement, 'As an employee, I want to know whether I have sufficient balance before submission.');

  assert.match(workspace, /calculateLeaveDaysPreview\(fromDate, toDate, dayPortion,[\s\S]*?leave\.weekly_off_days, leave\.holidays/);
  assert.match(workspace, /data-testid="leave-request-days-preview" role="status" aria-live="polite"/);
  assert.match(workspace, /selectedAvailableDays !== null && Number\.isFinite\(selectedAvailableDays\)/);
  assert.match(workspace, /The current balance covers this request; the server will check again\./);
  assert.match(workspace, /This request exceeds the current balance; the server will check again\./);
  assert.match(sql, /extract\(dow FROM g\.d\)::integer=ANY\(v_weekly_off\)/);
  assert.match(sql, /g\.d::date BETWEEN h\.start_date AND h\.end_date/);
  assert.match(sql, /v_days := 0\.5/);
  for (const phrase of [
    'Estimated chargeable days',
    'The estimate uses your current weekly-off schedule and tenant-wide holidays. The server validates again on submission.',
    'These dates contain no chargeable leave days.',
    'Current available balance',
    'The current balance covers this request; the server will check again.',
    'This request exceeds the current balance; the server will check again.',
    'The server checks balance separately for each calendar year when submitted.',
  ]) assert.match(locale, new RegExp(`'${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}':`));

  assert.match(runtime, /HRIS_LOCAL_LEAVE_BALANCES_JSON: JSON\.stringify/);
  assert.match(runtime, /E08-07 the employee preview matches requested days persisted by the real leave RPC/);
  assert.match(runtime, /E08-08 preview applies the employee weekly-off schedule and tenant-wide holidays/);
  assert.match(runtime, /E08-09 selected-year balance status uses the authenticated employee’s persisted leave ledger/);
  assert.match(browser, /HRIS_LOCAL_LEAVE_PREVIEW_HOLIDAY_DATE/);
  assert.match(browser, /HRIS_LOCAL_LEAVE_PREVIEW_WEEKEND_DATE/);
  assert.match(browser, /previewedRequestedDays: requestedDaysPreview/);
  assert.match(browser, /previewedHalfDayDays: requestedHalfDayPreview/);
  assert.match(browser, /Employee leave request preview mobile/);
  assert.match(browser, /Employee leave request preview desktop/);
});

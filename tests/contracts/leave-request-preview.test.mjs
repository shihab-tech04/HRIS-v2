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
const leaveForm = workspace.slice(workspace.indexOf('function PersonalLeaveRequests('), workspace.indexOf('function EmployeePersonalLeave('));

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
  assert.match(browser, /getByText\('হিসাব করা ছুটির দিন:', \{ exact: true \}\)/);
  assert.match(browser, /Employee leave request preview mobile/);
  assert.match(browser, /Employee leave request preview desktop/);
});

test('E08-10 maps employee-visible overlap detection to the existing tenant-authorized submission constraint', () => {
  assert.equal(createHash('sha256').update(catalogueBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  const stories = new Map(catalogue.stories.map(story => [story.story_id, story]));
  assert.equal(stories.get('E08-10')?.verbatim_requirement, 'As an employee, I want to know when my request overlaps an existing request.');
  assert.match(workspace, /request\.status !== 'pending' && request\.status !== 'approved'/);
  assert.match(workspace, /requestFrom > toDate \|\| requestTo < fromDate/);
  assert.match(workspace, /request\.day_portion !== dayPortion/);
  assert.match(workspace, /These dates overlap with an existing pending or approved leave request\./);
  assert.match(workspace, /failureCode === '23505'[\s\S]*?Overlapping leave request already exists/);
  assert.match(sql, /daterange\(r\.from_date,r\.to_date,'\[\]'\) && daterange\(v_from,v_to,'\[\]'\)/);
  assert.match(locale, /'These dates overlap with an existing pending or approved leave request\.':/);
  assert.match(browser, /E08_OVERLAP_BROWSER_ACCEPTANCE=PASS/);
  assert.match(browser, /const overlapHistory = overlapEmployee\.getByRole\('table'/);
  assert.match(browser, /2026-10-20\.\*Synthetic evidence-required leave/);
  assert.match(runtime, /E08-10 employee sees the overlap in their own history and the server rejects a duplicate without creating a row/);
});

test('E08-11 maps configured leave restrictions to persisted server validation and localized recovery messages', () => {
  assert.equal(createHash('sha256').update(catalogueBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  const stories = new Map(catalogue.stories.map(story => [story.story_id, story]));
  assert.equal(stories.get('E08-11')?.verbatim_requirement, 'As an employee, I want to know when leave conflicts with another configured rule.');
  assert.match(workspace, /selectedLeaveType\?\.min_days_notice/);
  assert.match(workspace, /selectedLeaveType\?\.requires_document_proof === true/);
  assert.match(workspace, /failureCode === '42501'[\s\S]*?This leave type is not available to this employee/);
  assert.match(workspace, /requires \\d\+ day\\\(s\\\) advance notice/);
  assert.match(workspace, /These dates contain no chargeable leave days\./);
  for (const phrase of [
    'This leave type is not available to your employee profile.',
    'This leave type is no longer available. Refresh and choose another type.',
    'These dates do not meet the configured advance notice for this leave type.',
  ]) assert.match(locale, new RegExp(`'${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}':`));
  assert.match(runtime, /E08-11 configured leave-type restrictions are explained in the UI and enforced without writes/);
});

test('E08-01 through E08-06 map the real employee leave form to persisted request fields and private evidence', () => {
  assert.equal(createHash('sha256').update(catalogueBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  const stories = new Map(catalogue.stories.map(story => [story.story_id, story]));
  const requirements = [
    ['E08-01', 119, 'As an employee, I want to apply for leave.'],
    ['E08-02', 120, 'As an employee, I want to select leave type.'],
    ['E08-03', 121, 'As an employee, I want to select start and end dates.'],
    ['E08-04', 122, 'As an employee, I want to apply for half-day leave where permitted.'],
    ['E08-05', 123, 'As an employee, I want to enter the reason for leave.'],
    ['E08-06', 124, 'As an employee, I want to attach supporting documents where required.'],
  ];
  for (const [id, line, requirement] of requirements) {
    assert.equal(stories.get(id)?.module_id, 'E08');
    assert.equal(stories.get(id)?.source_locator.line, line);
    assert.equal(stories.get(id)?.verbatim_requirement, requirement);
  }
  for (const field of ['personal-leave-type', 'personal-leave-from', 'personal-leave-to',
    'personal-leave-portion', 'personal-leave-reason', 'personal-leave-evidence']) {
    assert.ok(leaveForm.includes(`id="${field}"`), `missing leave form field ${field}`);
  }
  assert.match(leaveForm, /requires_document_proof === true/);
  assert.match(leaveForm, /hris_employee_submit_leave_request/);
  assert.match(sql, /INSERT INTO public\.leave_requests/);
  assert.match(sql, /INSERT INTO private\.hris_leave_balance_allocations/);
  assert.match(browser, /LEAVE_UI_REQUEST_ACCEPTANCE=/);
  assert.match(browser, /LEAVE_EVIDENCE_BROWSER_ACCEPTANCE=PASS/);
});

test('E08-12 through E08-14, E08-17 and E08-18 map to the existing reviewer route, status, rejection note and ledger', () => {
  assert.equal(createHash('sha256').update(catalogueBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  const stories = new Map(catalogue.stories.map(story => [story.story_id, story]));
  const requirements = [
    ['E08-12', 130, 'As an employee, I want to submit the leave request.'],
    ['E08-13', 131, 'As an employee, I want to see the approval route.'],
    ['E08-14', 132, 'As an employee, I want to see request status.'],
    ['E08-17', 135, 'As an employee, I want to see rejection reasons.'],
    ['E08-18', 136, 'As an employee, I want approved leave to update my leave balance and attendance correctly.'],
  ];
  for (const [id, line, requirement] of requirements) {
    assert.equal(stories.get(id)?.module_id, 'E08');
    assert.equal(stories.get(id)?.source_locator.line, line);
    assert.equal(stories.get(id)?.verbatim_requirement, requirement);
  }
  assert.match(leaveForm, /After submission, an authorized leave manager in this organization reviews your request\./);
  assert.match(sql, /has_tenant_permission\(r\.tenant_id, 'leave\.manage'\)/);
  assert.match(sql, /status=p_decision,resolved_by=auth\.uid\(\),resolved_at=now\(\)/);
  assert.match(sql, /resolution_note=nullif\(btrim\(coalesce\(p_note,''\)\),''\)/);
  assert.match(sql, /used_days=b\.used_days\+CASE WHEN p_decision='approved'/);
  assert.match(runtime, /Real manager leave UI approves the persisted employee request and updates its ledger once/);
  assert.match(runtime, /Real manager UI rejection persists its note, releases pending balance, and refreshes employee history/);
  assert.match(browser, /E08_APPROVAL_ROUTE_BROWSER_ACCEPTANCE=PASS/);
});

test('E08-15 and E08-16 remain explicitly gated without invented employee edit or withdrawal contracts', () => {
  assert.equal(createHash('sha256').update(catalogueBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  const stories = new Map(catalogue.stories.map(story => [story.story_id, story]));
  assert.equal(stories.get('E08-15')?.verbatim_requirement, 'As an employee, I want to edit a pending request where allowed.');
  assert.equal(stories.get('E08-16')?.verbatim_requirement, 'As an employee, I want to cancel or withdraw a request where allowed.');
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.hris_employee_(?:edit|withdraw|cancel)_leave_request/);
});

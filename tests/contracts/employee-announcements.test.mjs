import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const sourcePath = new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url);
const sourceBytes = readFileSync(sourcePath);
const source = JSON.parse(sourceBytes.toString('utf8'));
const migration = readFileSync(new URL('../../supabase/migrations/20261017030000_hris_employee_announcement_audience.sql', import.meta.url), 'utf8');
const component = readFileSync(new URL('../../src/live/MyEmployeeAnnouncements.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const locale = readFileSync(new URL('../../src/live/project-locale.ts', import.meta.url), 'utf8');
const authRunner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../sql/isolated-auth/run-employee-announcements-browser.mjs', import.meta.url), 'utf8');
const dashboardBrowser = readFileSync(new URL('../sql/isolated-auth/run-employee-dashboard-attendance-browser.mjs', import.meta.url), 'utf8');

test('employee announcement requirements resolve to the verified source catalogue', () => {
  assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  assert.equal(source.module_total, 153);
  assert.equal(source.story_total, 1047);
  const stories = source.stories.filter(story => /^E35-0[1-5]$/.test(story.story_id));
  assert.deepEqual(stories.map(story => story.story_id), ['E35-01', 'E35-02', 'E35-03', 'E35-04', 'E35-05']);
  assert.equal(stories[0].verbatim_requirement, 'As an employee, I want to see announcements relevant to me.');
  assert.equal(stories[1].verbatim_requirement, 'As an employee, I want important notices highlighted.');
  assert.equal(stories[2].verbatim_requirement, 'As an employee, I want to open attachments.');
  assert.equal(stories[3].verbatim_requirement, 'As an employee, I want to acknowledge mandatory announcements where required.');
  assert.equal(stories[4].verbatim_requirement, 'As an employee, I want expired announcements removed from active view while remaining historically available if required.');
});

test('announcement RLS enforces active tenant membership or employee identity and audience without inferring location', () => {
  assert.match(migration, /CREATE POLICY hris_notices_membership_guard[\s\S]+?AS RESTRICTIVE FOR SELECT TO authenticated/);
  assert.match(migration, /has_tenant_permission\(tenant_id, 'notices\.view'\)/);
  assert.match(migration, /has_tenant_permission\(tenant_id, 'notices\.manage'\)/);
  assert.match(migration, /active IS TRUE[\s\S]+?t\.is_active IS TRUE[\s\S]+?hris_is_active_tenant_member\(tenant_id\)[\s\S]+?hris_own_employee_for_tenant\(tenant_id\)/);
  assert.match(migration, /audience_type = 'all'/);
  assert.match(migration, /audience_type = 'department'[\s\S]+?e\.department_id = notices\.audience_id/);
  assert.doesNotMatch(migration, /audience_type\s*=\s*'location'/);
  assert.match(authRunner, /unsupported location audiences remain private/);
  assert.match(authRunner, /managerANoticeIds/);
});

test('employee announcement UI supports pinned items, attachment links, recovery, mobile, and EN/BN', () => {
  assert.match(workspace, /page === 'my-announcements' && isEmployee && <MyEmployeeAnnouncements/);
  assert.match(workspace, /id: 'my-announcements', label: 'Announcements'/);
  assert.match(component, /from\('notices'\)/);
  assert.match(component, /\.eq\('active', true\)/);
  assert.match(component, /data-announcement-id/);
  assert.match(component, /target="_blank" rel="noopener noreferrer"/);
  assert.match(component, /No active announcements are available\./);
  assert.match(locale, /'Announcements': 'ঘোষণা'/);
  assert.match(browser, /journey passed at 375px mobile and 1280px desktop, EN\/BN, retry, refresh, empty, audience and attachment states/);
  assert.match(browser, /page\.reload\(\)/);
});

test('E01-08 shows a recent employee-safe dashboard preview and opens the existing announcement history', () => {
  const story = source.stories.find(item => item.story_id === 'E01-08');
  assert.equal(story?.module_id, 'E01');
  assert.equal(story?.source_locator.line, 18);
  assert.equal(story?.verbatim_requirement, 'As an employee, I want to see recent HR announcements.');
  assert.match(component, /compact\?: boolean/);
  assert.match(component, /if \(compact\) \{[\s\S]*?\.select\('id,title,category,pinned,published_at'\)[\s\S]*?\.limit\(3\)/);
  assert.match(component, /\.select\('id,title,category,body,attachment_url,pinned,published_at'\)[\s\S]*?\.limit\(50\)/);
  assert.match(workspace, /<MyEmployeeAnnouncements tenantId=\{tenantId\} locale=\{locale\} compact onOpen=\{onOpenAnnouncements\}/);
  assert.match(dashboardBrowser, /EMPLOYEE_DASHBOARD_ANNOUNCEMENTS_BROWSER_ACCEPTANCE=PASS/);
  assert.match(authRunner, /E01-08 recent HR announcements appear on the employee dashboard/);
});

test('announcement outage injection starts only after the employee opens the announcement page', () => {
  assert.match(browser, /let armInitialReadFailure = false/);
  assert.match(browser, /fullNoticeRetryCounts\.push\(Number\(request\.headers\(\)\['x-retry-count'\] \|\| 0\)\)/);
  assert.match(browser, /if \(armInitialReadFailure\) \{[\s\S]*?status: 503/);
  assert.match(browser, /async function waitForFullNoticeReadsToSettle\(\)[\s\S]*?await pinnedNotice\.waitFor\(\{ state: 'visible' \}\)[\s\S]*?await waitForFullNoticeReadsToSettle\(\)[\s\S]*?const fullNoticeReadCountBeforeFailure = fullNoticeReadCount[\s\S]*?armInitialReadFailure = true/);
  assert.match(browser, /failureRetryCounts\.length < 2/);
  assert.match(browser, /fullNoticeReadCount !== fullNoticeReadCountBeforeFailure \+ failureRetryCounts\.length/);
  assert.match(browser, /refresh-triggered 503 retry sequence completed, but the employee UI did not show its retry alert/);
});

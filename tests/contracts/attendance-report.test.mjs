import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261012183000_hris_attendance_report_team_name.sql', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const searchAsset = readFileSync(new URL('../../src/assets/attendance-search.svg', import.meta.url), 'utf8');
const downloadAsset = readFileSync(new URL('../../src/assets/attendance-download.png', import.meta.url));
const filterAsset = readFileSync(new URL('../../src/assets/attendance-filter.svg', import.meta.url), 'utf8');
const teamSortAsset = readFileSync(new URL('../../src/assets/attendance-team-sort.svg', import.meta.url), 'utf8');
const fixture = readFileSync(new URL('../sql/isolated-auth/fixture.sql', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../browser/attendance-information.spec.ts', import.meta.url), 'utf8');

test('attendance report team labels come from tenant-checked employee team joins', () => {
  assert.match(migration, /'team_name',x\.team_name/);
  assert.match(migration, /LEFT JOIN public\.teams t ON t\.id=e\.team_id AND t\.tenant_id=p_tenant_id/);
  assert.match(migration, /GROUP BY e\.id,e\.employee_number,e\.full_name,d\.name,ds\.title,t\.name,s\.full_day_hours/);
  assert.match(migration, /public\.has_tenant_permission\(p_tenant_id, 'reports\.view'\)/);
  assert.match(migration, /FROM PUBLIC, anon/);
  assert.match(migration, /TO authenticated, service_role/);
});

test('attendance report export includes the displayed Team Name field', () => {
  assert.match(workspace, /'designation_title', 'team_name', 'department_name'/);
  assert.match(workspace, /'Designation', 'Team Name', 'Department'/);
  assert.match(browser, /Synthetic Product Team/);
});

test('Figma team filter applies to visible attendance rows and CSV exports', () => {
  assert.match(workspace, /label htmlFor="attendance-team"[^>]*>Select Team/);
  assert.match(workspace, /setAppliedTeamFilter\(selectedTeamFilter\)/);
  assert.match(workspace, /const exportRows = filteredRows/);
  assert.match(workspace, /No attendance report rows match the selected team/);
  assert.match(browser, /selectOption\('Synthetic Design Team'\)/);
  assert.match(browser, /expect\(filteredCsv\)\.not\.toContain\('Synthetic Product Team'\)/);
});

test('Figma Team Name sort order is accessible and shared by table and CSV', () => {
  assert.match(workspace, /attendance-team-sort\.svg/);
  assert.doesNotMatch(workspace, /ArrowDownUp/);
  assert.match(teamSortAsset, /<svg[^>]*width="14" height="11\.5957" viewBox="0 0 14 11\.5957"/);
  assert.doesNotMatch(workspace, /figma\.com\/api\/mcp\/asset/);
  assert.match(workspace, /setTeamSortDirection\(value => value === 'asc' \? 'desc' : 'asc'\)/);
  assert.match(workspace, /aria-sort=\{aggregateOnly && label === 'Team Name'/);
  assert.match(workspace, /return matchingRows\.map\(\(row, index\) =>/);
  assert.match(browser, /Sort by Team Name ascending/);
  assert.match(browser, /Sort by Team Name descending/);
});

test('Figma report toolbar uses exact local icons, order, and component dimensions', () => {
  const start = workspace.indexOf('<form aria-label="Attendance report controls"');
  const end = workspace.indexOf('</form>', start);
  assert.ok(start >= 0 && end > start);
  const toolbar = workspace.slice(start, end);
  assert.ok(toolbar.indexOf('Download Report') < toolbar.indexOf('aria-label="Filters"'));
  assert.match(toolbar, /lg:w-\[334px\]/);
  assert.match(toolbar, /lg:w-\[184px\]/);
  assert.match(toolbar, /w-16/);
  assert.match(toolbar, /attendanceSearchIcon/);
  assert.match(toolbar, /attendanceDownloadIcon/);
  assert.match(toolbar, /attendanceFilterIcon/);
  assert.match(searchAsset, /width="12\.4444" height="12\.4444"/);
  assert.match(filterAsset, /width="18" height="18"/);
  assert.deepEqual([...downloadAsset.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.match(browser, /controlBounds/);
});

test('attendance report filter disclosure keeps its controlled panel target mounted', () => {
  assert.match(workspace, /id="attendance-filters" hidden=\{!filtersOpen\}/);
  assert.match(workspace, /aria-controls="attendance-filters" onClick/);
  assert.match(browser, /getByRole\('button', \{ name: 'Filters', exact: true \}\)/);
  assert.match(browser, /attendance-filters/);
});

test('shared CSV export neutralizes formula-leading text while preserving numeric literals', () => {
  const start = workspace.indexOf('function csvCell(');
  const end = workspace.indexOf('\nfunction downloadCsv', start);
  const cell = workspace.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(cell, /startsWithFormula/);
  assert.match(cell, /isNumericLiteral/);
  assert.match(cell, /safeText/);
  assert.match(browser, /'=HYPERLINK/);
  assert.match(browser, /"-0\.7"/);
});

test('Figma Apply Filter commits aggregate date and Team drafts together', () => {
  assert.match(workspace, /value=\{aggregateOnly \? draftFrom : from\}/);
  assert.match(workspace, /value=\{aggregateOnly \? draftTo : to\}/);
  assert.match(workspace, /onClick=\{applyReportFilters\}/);
  assert.match(workspace, /setFrom\(draftFrom\);\s*setTo\(draftTo\);\s*setAppliedTeamFilter\(selectedTeamFilter\)/);
  assert.match(browser, /reportCallsBeforeDraft/);
  assert.match(browser, /p_start === '2026-10-01'/);
});

test('synthetic RLS fixture covers valid and cross-tenant employee team references', () => {
  assert.match(fixture, /CREATE TABLE public\.teams/);
  assert.match(fixture, /team_id uuid REFERENCES public\.teams\(id\)/);
  assert.match(fixture, /QA A Team/);
  assert.match(fixture, /QA B Team/);
  assert.match(fixture, /QA-A-002','Synthetic Absent Employee A/);
});

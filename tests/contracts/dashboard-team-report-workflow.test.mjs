import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261015120000_hris_dashboard_team_report_date_filter.sql', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const locale = readFileSync(new URL('../../src/live/project-locale.ts', import.meta.url), 'utf8');
const sqlRunner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const browserRunner = readFileSync(new URL('../sql/isolated-auth/run-dashboard-team-report-browser.mjs', import.meta.url), 'utf8');
const browserSpec = readFileSync(new URL('../browser/managerial-dashboard.spec.ts', import.meta.url), 'utf8');

test('dashboard team report date selection keeps tenant permissions and tenant-local defaults', () => {
  assert.match(migration, /DROP FUNCTION IF EXISTS public\.hris_get_tenant_dashboard_team_report\(uuid\)/);
  assert.match(migration, /p_report_date date DEFAULT NULL/);
  assert.match(migration, /has_tenant_permission\(p_tenant_id, 'dashboard\.view'\)/);
  assert.match(migration, /has_tenant_permission\(p_tenant_id, 'reports\.view'\)/);
  assert.match(migration, /coalesce\(p_report_date, \(now\(\) AT TIME ZONE v_timezone\)::date\)/);
  assert.match(migration, /a\.attendance_date = v_report_date/);
  assert.match(migration, /e\.tenant_id = p_tenant_id/);
  assert.match(workspace, /p_report_date: teamReportDateFilter \|\| null/);
  assert.match(workspace, /id="dashboard-team-report-date" type="date"/);
  assert.match(workspace, /onClick=\{applyTeamReportDate\}/);
});

test('team detail RPC returns only the selected tenant team and retains aggregate-only reporting fields', () => {
  const detailRpc = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.hris_get_tenant_dashboard_team_details'));
  assert.match(detailRpc, /p_team_id uuid,\s+p_unassigned boolean,\s+p_report_date date/);
  assert.match(detailRpc, /has_tenant_permission\(p_tenant_id, 'reports\.view'\)/);
  assert.match(detailRpc, /t\.id = p_team_id AND t\.tenant_id = p_tenant_id/);
  assert.match(detailRpc, /CASE WHEN p_unassigned THEN t\.id IS NULL ELSE t\.id = p_team_id END/);
  assert.match(detailRpc, /e\.tenant_id = p_tenant_id/);
  assert.match(detailRpc, /REVOKE ALL ON FUNCTION public\.hris_get_tenant_dashboard_team_details\(uuid, uuid, boolean, date\) FROM PUBLIC, anon/);
  assert.match(workspace, /rpc\('hris_get_tenant_dashboard_team_details'/);
  assert.match(workspace, /p_team_id: teamReportDetail\.isUnassigned \? null : teamReportDetail\.teamId/);
  assert.match(workspace, /p_unassigned: teamReportDetail\.isUnassigned/);
  assert.match(workspace, /teamReportDetailSequence/);
});

test('filtered dashboard totals and CSV use the same visible aggregate team rows', () => {
  assert.match(workspace, /const teamReportTotals = useMemo\(\(\) => \{[\s\S]*for \(const row of visibleTeamReportRows\)/);
  assert.match(workspace, /const rows = visibleTeamReportRows\.map/);
  assert.match(workspace, /rows\.push\(\[teamReportDate, tx\('Filtered total'\), teamReportTotals\.present_members/);
  assert.match(workspace, /teamReportTotals\.total_members\.toLocaleString\(\)/);
  assert.match(workspace, /disabled=\{teamReportLoading \|\| !visibleTeamReportRows\.length\}/);
});

test('isolated acceptance covers selected dates, role denials, team scoping, retry, refresh, CSV, and responsive layout', () => {
  for (const label of [
    'Manager dashboard team report applies the selected report date',
    'Team detail RPC returns only the selected authorized tenant team',
    'Unassigned team detail includes only employees without a same-tenant team join',
    'Team detail RPC denies cross-tenant and dashboard-ineligible report viewers',
  ]) assert.ok(sqlRunner.includes(label), `missing SQL acceptance: ${label}`);
  assert.match(browserRunner, /injected Team Report outage/);
  assert.match(browserRunner, /setViewportSize\(\{ width: 1280, height: 900 \}\)/);
  assert.match(browserSpec, /Apply date/);
  assert.match(browserSpec, /Filtered total/);
  assert.match(browserSpec, /উপস্থিতির বিস্তারিত দেখুন/);
  assert.match(browserSpec, /Switch language to Bengali/);
  assert.match(browserSpec, /375/);
  assert.match(browserSpec, /download/);
  for (const phrase of ['Team Report', 'Apply date', 'Filtered total', 'Team report details', 'View details', 'Employee number']) {
    assert.ok(locale.includes(`'${phrase}'`), `missing EN/BN translation: ${phrase}`);
  }
});

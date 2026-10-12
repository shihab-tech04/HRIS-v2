import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261012183000_hris_attendance_report_team_name.sql', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
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

test('synthetic RLS fixture covers valid and cross-tenant employee team references', () => {
  assert.match(fixture, /CREATE TABLE public\.teams/);
  assert.match(fixture, /team_id uuid REFERENCES public\.teams\(id\)/);
  assert.match(fixture, /QA A Team/);
  assert.match(fixture, /QA B Team/);
  assert.match(fixture, /QA-A-002','Synthetic Absent Employee A/);
});

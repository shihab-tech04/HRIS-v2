import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261013221600_hris_organization_holiday_calendar.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../src/live/LiveApp.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../src/live/OrganizationHolidayCalendar.tsx', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../sql/isolated-auth/run-holiday-calendar-browser.mjs', import.meta.url), 'utf8');
const fixture = readFileSync(new URL('../sql/isolated-auth/fixture.sql', import.meta.url), 'utf8');

test('holiday calendar RPCs require a live active tenant holidays.manage membership', () => {
  for (const name of ['hris_get_org_holiday_calendar', 'hris_save_org_holiday']) {
    const start = migration.indexOf(`FUNCTION private.${name}`);
    assert.notEqual(start, -1);
    const end = migration.indexOf('$function$;', migration.indexOf('AS $function$', start)) + 11;
    const definition = migration.slice(start, end);
    assert.match(definition, /auth\.uid\(\) IS NULL OR NOT public\.is_live_session\(\)/);
    assert.match(definition, /public\.has_tenant_permission\(p_tenant_id, 'holidays\.manage'\)/);
    assert.match(definition, /public\.tenants t WHERE t\.id=p_tenant_id AND t\.is_active IS TRUE/);
  }
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.holidays FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /holiday\.created/);
  assert.match(migration, /holiday\.updated/);
  assert.match(migration, /admin_audit_logs/);
  assert.match(migration, /p_end_date < p_start_date/);
});

test('holiday calendar is exposed only to the tenant permission and uses RPCs instead of direct table writes', () => {
  assert.match(app, /'holidays\.manage'/);
  assert.match(app, /holidayManage: grants\.get\('holidays\.manage'\) === true/);
  assert.match(workspace, /id: 'holidays', label: 'Holiday calendar'/);
  assert.match(workspace, /page === 'holidays' && permissions\.holidayManage && <OrganizationHolidayCalendar tenantId=\{tenantId\} locale=\{locale\} \/>/);
  assert.match(workspace, /Upcoming holidays/);
  assert.match(ui, /hris_get_org_holiday_calendar/);
  assert.match(ui, /hris_save_org_holiday/);
  assert.match(ui, /No active holidays/);
  assert.match(ui, /projectText\(locale, value\)/);
  assert.match(ui, /toLocaleDateString\(locale === 'bn' \? 'bn-BD' : 'en-US'/);
  assert.match(ui, /Retry/);
  assert.match(ui, /Deactivate/);
  assert.doesNotMatch(ui, /\.from\(['"]holidays['"]\)/);
});

test('local Auth/Postgres and browser acceptance exercises tenant denial and the holiday management journey', () => {
  assert.match(runner, /hris_get_org_holiday_calendar/);
  assert.match(runner, /holidayCrossTenantUpdate/);
  assert.match(runner, /holidayDirectInsert/);
  assert.match(runner, /run-holiday-calendar-browser\.mjs/);
  assert.match(runner, /HRIS_LOCAL_HOLIDAY_EMPLOYEE_EMAIL/);
  assert.match(browser, /Synthetic temporary holiday calendar outage/);
  assert.match(browser, /My Overview/);
  assert.match(browser, /Deactivate/);
  assert.match(browser, /Activate/);
  assert.match(browser, /assertNoOverflow\(page, 'Holiday calendar mobile'\)/);
  assert.match(browser, /assertNoOverflow\(page, 'Holiday calendar desktop'\)/);
  assert.match(fixture, /holiday_type text NOT NULL DEFAULT 'general'/);
  assert.match(fixture, /updated_at timestamptz NOT NULL DEFAULT now\(\)/);
});

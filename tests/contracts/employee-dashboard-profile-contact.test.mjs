import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20261016233237_employee_dashboard_official_phone.sql');
const identityMigration = read('../../supabase/migrations/20261017040000_hris_employee_dashboard_work_identity.sql');
const teamMigration = read('../../supabase/migrations/20261017050000_hris_employee_dashboard_team_identity.sql');
const component = read('../../src/live/LiveHrisWorkspace.tsx');
const runner = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-employee-dashboard-attendance-browser.mjs');
const upcomingTraining = read('../../src/live/EmployeeUpcomingTraining.tsx');
const locale = read('../../src/live/project-locale.ts');
const catalogue = JSON.parse(read('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json'));

test('employee profile phone uses the existing authenticated linked-employee dashboard projection', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.hris_get_my_dashboard_data\(p_tenant_id uuid\)/);
  assert.match(migration, /v_employee := public\.hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(migration, /'official_phone',e\.official_phone/);
  assert.match(migration, /e\.id=v_employee AND e\.tenant_id=p_tenant_id/);
  assert.match(component, /data-employee-contact="official-phone"/);
  assert.match(component, /employee\?\.official_phone/);
  const phoneMigration = runner.indexOf('20261016233237_employee_dashboard_official_phone.sql');
  assert.ok(phoneMigration > runner.indexOf('20261016230201_hris_employee_roster_notifications.sql'));
  assert.ok(phoneMigration < runner.indexOf('20261017010000_hris_employee_document_self_service.sql'));
  assert.match(runner, /20261016233237_employee_dashboard_official_phone\.sql/);
  assert.match(runner, /employeeSummaryA\.employee\.official_phone === '\+880 2 5550001'/);
  assert.match(runner, /employeeSummaryB\.employee\.official_phone === null/);
  assert.match(browser, /data-employee-contact="official-phone"/);
  assert.match(browser, /1280px|setViewportSize/);
});

test('employee profile includes the existing team assignment through a same-tenant Figma-aligned projection', () => {
  assert.match(teamMigration, /'team_name',t\.name/);
  assert.match(teamMigration, /LEFT JOIN public\.teams t ON t\.id=e\.team_id AND t\.tenant_id=e\.tenant_id/);
  assert.match(teamMigration, /v_employee := public\.hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(component, /data-employee-profile="team"/);
  assert.match(runner, /Employee dashboard profile resolves team names only through a same-tenant team join/);
  assert.match(browser, /HRIS_LOCAL_DASHBOARD_TEAM_NAME/);
});

test('employee dashboard upcoming training uses only future sessions confirmed by the employee enrollment RPC', () => {
  assert.match(upcomingTraining, /hris_get_my_learning_context/);
  assert.match(upcomingTraining, /data\.tenant_id !== requestedTenant/);
  assert.match(upcomingTraining, /enrollment\?\.status === 'enrolled'/);
  assert.match(upcomingTraining, /enrolledSessions\.has\(session\.id\)/);
  assert.match(upcomingTraining, /Date\.parse\(session\.start_at\) <= now/);
  assert.doesNotMatch(upcomingTraining, /meeting_url/);
  assert.match(browser, /EMPLOYEE_UPCOMING_TRAINING_BROWSER_ACCEPTANCE=PASS/);
  assert.match(browser, /HRIS_LOCAL_UPCOMING_TRAINING_SESSION_ID/);
  assert.match(locale, /'Upcoming training': 'আসন্ন প্রশিক্ষণ'/);
  assert.match(locale, /'Open My Learning': 'আমার শেখার পৃষ্ঠা খুলুন'/);
  const sourceStory = catalogue.stories.find(story => story.story_id === 'E01-06');
  assert.equal(sourceStory?.verbatim_requirement,
    'As an employee, I want to see upcoming interviews, training, reviews, or company events relevant to me.');
  assert.equal(sourceStory?.source_locator.line, 16);
  assert.match(runner, /E01-06 training visibility is partially implemented/);
});

test('E02-01 links the canonical personal-information story to the authenticated own-profile view', () => {
  const story = catalogue.stories.find(item => item.story_id === 'E02-01');
  assert.ok(story);
  assert.equal(story.module_id, 'E02');
  assert.equal(story.role_name, 'Employee');
  assert.equal(story.verbatim_requirement, 'As an employee, I want to view my personal information.');
  assert.equal(story.source_locator.line, 26);
  assert.equal(story.status, 'NOT TESTED');
  assert.deepEqual(story.test_ids, []);

  for (const field of [
    'v_employee := public.hris_own_employee_for_tenant(p_tenant_id)',
    "'full_name',e.full_name",
    "'official_email',e.official_email",
    "'official_phone',e.official_phone",
    'e.id=v_employee AND e.tenant_id=p_tenant_id',
  ]) assert.ok(identityMigration.includes(field), `Employee profile projection is missing ${field}.`);
  assert.ok(component.includes('aria-labelledby="employee-profile-heading"'));
  assert.ok(component.includes('employee?.official_email'));
  assert.ok(component.includes('employee?.official_phone'));
  assert.match(runner, /E02-01 employee profile shows its linked personal identity and denies cross-tenant, global-only, and anonymous access/);
  assert.match(browser, /E02-01_PERSONAL_INFORMATION_BROWSER_PASS/);
  assert.ok(browser.includes('Synthetic Employee A'));
  assert.ok(browser.includes('employee-a@hris.test'));
});

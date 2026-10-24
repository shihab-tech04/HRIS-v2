import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const catalogueBytes = readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url));
const catalogue = JSON.parse(catalogueBytes.toString('utf8'));
const component = read('../../src/live/EmployeeUpcomingReviews.tsx');
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const migration = read('../../supabase/migrations/20261013124000_hris_appraisal_narrative_workflow.sql');
const runner = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-employee-dashboard-attendance-browser.mjs');

test('E01-06 maps to its exact verified canonical source and uses the linked employee appraisal RPC', () => {
  assert.equal(createHash('sha256').update(catalogueBytes).digest('hex'), 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520');
  const story = catalogue.stories.find(item => item.story_id === 'E01-06');
  assert.equal(story?.module_id, 'E01');
  assert.equal(story?.source_locator.line, 16);
  assert.equal(story?.verbatim_requirement, 'As an employee, I want to see upcoming interviews, training, reviews, or company events relevant to me.');
  assert.match(component, /supabase\.rpc\('hris_get_my_appraisal_work'/);
  assert.match(migration, /public\.hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(migration, /a\.employee_id=v_employee_id OR a\.reviewer_employee_id=v_employee_id/);
  assert.match(component, /row\.status === 'draft'/);
  assert.match(component, /row\.status === 'submitted_by_employee'/);
  assert.match(component, /row\.reviewer_employee_id === employeeId/);
  assert.match(component, /row\.self_review_deadline > dashboardDate/);
  assert.match(component, /row\.manager_review_deadline > dashboardDate/);
  assert.doesNotMatch(component, /manager_scores|final_rating|weight|score/);
});

test('upcoming review cards provide retry, refresh, existing performance navigation and localized accessible states', () => {
  assert.match(workspace, /<EmployeeUpcomingReviews tenantId=\{tenantId\} employeeId=\{employeeId\}/);
  assert.match(component, /activeTenant\.current === requestedTenant/);
  assert.match(component, /aria-labelledby="employee-upcoming-reviews-heading"/);
  for (const phrase of ['Upcoming reviews', 'Review deadlines assigned to you.', 'Refresh upcoming reviews',
    'Loading upcoming reviews…', 'Unable to load your upcoming reviews. Refresh to try again.',
    'No upcoming review deadlines.', 'Self-review due', 'Assigned review due', 'Open My Performance']) {
    assert.match(read('../../src/live/project-locale.ts'), new RegExp(`'${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}':`));
  }
  assert.match(runner, /E01-06 upcoming appraisal deadlines use the authenticated employee appraisal RPC/);
  assert.match(browser, /EMPLOYEE_DASHBOARD_UPCOMING_REVIEWS_BROWSER_ACCEPTANCE=PASS/);
  assert.match(browser, /failNextDashboardReviewRead = true;\s+await upcomingReviews\.getByRole\('button', \{ name: 'Refresh upcoming reviews', exact: true \}\)\.click\(\)/,
    'the injected failure must occur at the refresh action being asserted, after dashboard navigation');
  assert.match(browser, /Employee upcoming reviews mobile/);
  assert.match(browser, /Employee upcoming reviews desktop/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261013100001_hris_project_tasks_and_peer_reviews.sql', import.meta.url), 'utf8');
const eligibilityMigration = readFileSync(new URL('../../supabase/migrations/20261013184000_hris_peer_review_eligibility_enforcement.sql', import.meta.url), 'utf8');
const notificationMigration = readFileSync(new URL('../../supabase/migrations/20261013222433_hris_peer_review_in_app_notifications.sql', import.meta.url), 'utf8');
const unifiedInboxMigration = readFileSync(new URL('../../supabase/migrations/20261014160002_hris_system_notifications_inbox.sql', import.meta.url), 'utf8');
const taskEditMigration = readFileSync(new URL('../../supabase/migrations/20261013224251_hris_project_task_edit_workflow.sql', import.meta.url), 'utf8');
const taskPortfolioMigration = readFileSync(new URL('../../supabase/migrations/20261013225608_hris_project_manager_task_portfolio.sql', import.meta.url), 'utf8');
const managerUi = readFileSync(new URL('../../src/live/ProjectTaskManager.tsx', import.meta.url), 'utf8');
const portfolioUi = readFileSync(new URL('../../src/live/ProjectTaskPortfolio.tsx', import.meta.url), 'utf8');
const employeeUi = readFileSync(new URL('../../src/live/MyProjectWork.tsx', import.meta.url), 'utf8');
const performanceUi = readFileSync(new URL('../../src/live/MyPerformance.tsx', import.meta.url), 'utf8');
const notificationUi = readFileSync(new URL('../../src/live/ProjectNotifications.tsx', import.meta.url), 'utf8');
const organizationProjects = readFileSync(new URL('../../src/live/OrganizationProjects.tsx', import.meta.url), 'utf8');
const myProjects = readFileSync(new URL('../../src/live/MyProjects.tsx', import.meta.url), 'utf8');
const localeUi = readFileSync(new URL('../../src/live/project-locale.ts', import.meta.url), 'utf8');

test('project task and peer-review tables use tenant and assignment composite keys with RLS', () => {
  for (const table of ['project_tasks', 'project_task_assignments', 'project_task_peer_reviews']) {
    assert.match(migration, new RegExp(`CREATE TABLE public\\.${table} \\(`));
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }
  assert.match(migration, /project_allocation_id, employee_id\)\s+REFERENCES public\.project_allocations \(tenant_id, project_id, id, employee_id\)/);
  assert.match(migration, /reviewer_task_assignment_id,[\s\S]*?reviewee_task_assignment_id/);
  assert.match(migration, /reviewer_employee_id <> employee_id/);
  assert.match(migration, /GRANT SELECT ON public\.project_tasks, public\.project_task_assignments, public\.project_task_peer_reviews\s+TO authenticated/);
  assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE|ALL) ON public\.project_tasks/);
});

test('only the assigned Project Manager can manage tasks; release and completion generate overlapping peer obligations', () => {
  for (const rpc of ['hris_create_project_task', 'hris_start_project_task', 'hris_assign_project_task_member', 'hris_release_project_task_member', 'hris_complete_project_task']) {
    const start = migration.indexOf(`FUNCTION public.${rpc}`);
    assert.notEqual(start, -1, `missing RPC: ${rpc}`);
    const body = migration.slice(start, migration.indexOf('$function$;', migration.indexOf('AS $function$', start)) + 11);
    assert.match(body, /hris_can_manage_project_tasks/);
  }
  const release = migration.slice(migration.indexOf('FUNCTION public.hris_release_project_task_member'), migration.indexOf('FUNCTION public.hris_complete_project_task'));
  const complete = migration.slice(migration.indexOf('FUNCTION public.hris_complete_project_task'), migration.indexOf('FUNCTION public.hris_get_project_task_workspace'));
  assert.match(release, /peer\.assigned_at < v_assignment\.released_at/);
  assert.match(release, /reviewee_task_assignment_id[\s\S]*?v_assignment\.id/);
  assert.match(complete, /a\.assigned_at < COALESCE\(b\.released_at/);
  assert.match(complete, /b\.assigned_at < COALESCE\(a\.released_at/);
  assert.match(complete, /ON CONFLICT \(tenant_id,task_id,reviewer_employee_id,employee_id\) DO NOTHING/);
  assert.doesNotMatch(complete, /feedback_pending\s*>\s*0|pending review/i);
});

test('review submissions separate Not Observed from 0–5 numeric values and cannot be rewritten', () => {
  assert.match(migration, /quality_of_work_score BETWEEN 0 AND 5/);
  assert.match(migration, /quality_of_work_not_observed AND quality_of_work_score IS NULL/);
  assert.match(migration, /jsonb_typeof\(p_scores->k\)<>'number'/);
  assert.match(migration, /p_scores->>k !~ '\^\[0-5\]\$'/);
  assert.match(migration, /reviewer_employee_id=v_employee_id AND r\.status='pending'/);
  assert.match(migration, /'reviewer_project_allocation_id',r\.reviewer_project_allocation_id/);
  assert.match(migration, /'reviewee_project_allocation_id',r\.reviewee_project_allocation_id/);
  assert.match(migration, /'reviewee_employee_id',r\.employee_id/);
});

test('the submission RPC revalidates task state and overlapping assignment eligibility server-side', () => {
  const submission = eligibilityMigration.slice(eligibilityMigration.indexOf('FUNCTION public.hris_submit_project_peer_review'));
  assert.match(submission, /t\.status='completed' OR reviewee_assignment\.released_at IS NOT NULL/);
  assert.match(submission, /reviewer_assignment\.assigned_at < COALESCE\(reviewee_assignment\.released_at,'infinity'::timestamptz\)/);
  assert.match(submission, /reviewee_assignment\.assigned_at < COALESCE\(reviewer_assignment\.released_at,'infinity'::timestamptz\)/);
  assert.match(submission, /reviewer_assignment\.employee_id=r\.reviewer_employee_id/);
  assert.match(submission, /reviewee_assignment\.employee_id=r\.employee_id/);
  assert.match(submission, /Pending eligible peer review assigned to this employee was not found/);
});

test('a released reviewer can submit their overlap-based obligation before completion without blocking the task', () => {
  const runner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
  assert.match(runner, /releasedReviewerObligation/);
  assert.match(runner, /p_review_id: releasedReviewerObligation\?\.id/);
  assert.match(runner, /followupReviewState\.reviewer_released/);
  assert.match(runner, /followupCompletion\.data\?\.feedback_pending === 1/);
  assert.match(runner, /Released reviewers can submit their eligible task review and task completion stays non-blocking/);
  assert.match(runner, /reviewee_employee_id === '55555555-5555-4555-8555-555555555555' && row\.task_id === projectTaskId/);
});

test('the disposable Auth/RLS runner accepts explicit loopback ports while retaining safe defaults', () => {
  const runner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
  assert.match(runner, /HRIS_SUPABASE_API_PORT \|\| '55421'/);
  assert.match(runner, /HRIS_SUPABASE_DB_PORT \|\| '55422'/);
  assert.match(runner, /HRIS_SUPABASE_API_URL/);
  assert.match(runner, /override\.hostname !== '127\.0\.0\.1'/);
  assert.match(runner, /apiUrl\.hostname !== '127\.0\.0\.1'/);
  assert.match(runner, /databaseUrl\.hostname !== '127\.0\.0\.1'/);
  assert.match(runner, /apiUrl\.port !== expectedApiPort/);
  assert.match(runner, /databaseUrl\.port !== expectedDatabasePort/);
});

test('eligible peer reviews create tenant-scoped in-app notifications and the isolated runner applies that migration', () => {
  assert.match(notificationMigration, /CREATE TABLE public\.hris_in_app_notifications/);
  assert.match(notificationMigration, /ALTER TABLE public\.hris_in_app_notifications ENABLE ROW LEVEL SECURITY/);
  assert.match(notificationMigration, /recipient_employee_id = public\.hris_own_employee_for_tenant\(tenant_id\)/);
  assert.match(notificationMigration, /AFTER INSERT OR UPDATE OF status ON public\.project_task_peer_reviews/);
  assert.match(notificationMigration, /t\.status = 'completed' OR reviewee_assignment\.released_at IS NOT NULL/);
  assert.match(notificationMigration, /reviewer_assignment\.assigned_at < COALESCE\(reviewee_assignment\.released_at/);
  assert.match(notificationMigration, /ON CONFLICT \(tenant_id, recipient_employee_id, peer_review_id\) DO NOTHING/);
  assert.match(notificationMigration, /CREATE OR REPLACE FUNCTION public\.hris_get_my_project_notifications/);
  assert.match(notificationMigration, /read_at = COALESCE\(n\.read_at, NEW\.submitted_at/);
  assert.match(notificationMigration, /REVOKE ALL ON FUNCTION public\.hris_get_my_project_notifications[^;]+FROM PUBLIC, anon/);
  const runner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
  assert.match(runner, /supabase\/migrations\/20261013222433_hris_peer_review_in_app_notifications\.sql/);
  const browser = readFileSync(new URL('../sql/isolated-auth/run-project-browser.mjs', import.meta.url), 'utf8');
  assert.match(browser, /getByRole\('button', \{ name: 'Open review' \}\)/);
  assert.match(browser, /Review for Synthetic Employee A completed/);
});

test('unified inbox keeps database keyset order while merging tenant-scoped learning and project events', () => {
  assert.match(unifiedInboxMigration, /CREATE OR REPLACE FUNCTION public\.hris_get_my_notifications/);
  assert.match(unifiedInboxMigration, /FROM public\.learning_completion_notifications/);
  assert.match(unifiedInboxMigration, /FROM public\.hris_in_app_notifications/);
  assert.match(unifiedInboxMigration, /\(n\.created_at,n\.source,n\.id\) < \(p_before_created_at,p_before_source,p_before_id\)/);
  assert.match(unifiedInboxMigration, /ORDER BY n\.created_at DESC,n\.source DESC,n\.id DESC/);
  assert.match(unifiedInboxMigration, /'unread_project_reviews',coalesce\(v_unread_project_reviews,0\)/);
  assert.match(unifiedInboxMigration, /REVOKE ALL ON FUNCTION public\.hris_get_my_notifications[^;]+FROM PUBLIC,anon/);
  assert.match(unifiedInboxMigration, /GRANT EXECUTE ON FUNCTION public\.hris_get_my_notifications[^;]+TO authenticated,service_role/);
  assert.match(notificationUi, /function uniqueNotifications\(rows: Notification\[\]\)/);
  assert.match(notificationUi, /return rows\.filter\(row =>/);
  assert.doesNotMatch(notificationUi, /\.sort\(/, 'the browser must preserve server ordering and timestamp precision');
  assert.match(notificationUi, /last\.source/);
});

test('unfinished task edits persist through a tenant-scoped assigned-Project-Manager RPC', () => {
  assert.match(taskEditMigration, /ADD COLUMN IF NOT EXISTS updated_at timestamptz/);
  assert.match(taskEditMigration, /CREATE OR REPLACE FUNCTION public\.hris_update_project_task/);
  assert.match(taskEditMigration, /hris_can_manage_project_tasks\(p_tenant_id, v_task\.project_id\)/);
  assert.match(taskEditMigration, /v_task\.status = 'completed'/);
  assert.match(taskEditMigration, /updated_at = clock_timestamp\(\)/);
  assert.match(taskEditMigration, /REVOKE ALL ON FUNCTION public\.hris_update_project_task[^;]+FROM PUBLIC, anon/);
  assert.match(taskEditMigration, /GRANT EXECUTE ON FUNCTION public\.hris_update_project_task[^;]+TO authenticated, service_role/);
  const runner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
  assert.match(runner, /20261013224251_hris_project_task_edit_workflow\.sql/);
  assert.match(runner, /Task details persist only through the assigned Project Manager/);
  assert.match(runner, /completedTaskEdit\.error\?\.code === '42501'/);
});

test('Project Manager task portfolio is server-scoped and returns review-safe task summaries', () => {
  assert.match(taskPortfolioMigration, /CREATE OR REPLACE FUNCTION public\.hris_get_my_project_task_portfolio\(p_tenant_id uuid\)/);
  assert.match(taskPortfolioMigration, /SECURITY DEFINER\s+SET search_path = ''/);
  assert.match(taskPortfolioMigration, /public\.hris_own_employee_for_tenant\(p_tenant_id\)/);
  assert.match(taskPortfolioMigration, /p\.project_lead_id = v_employee_id/);
  assert.match(taskPortfolioMigration, /'feedback_pending'/);
  assert.match(taskPortfolioMigration, /'members'/);
  assert.match(taskPortfolioMigration, /REVOKE ALL ON FUNCTION public\.hris_get_my_project_task_portfolio[^;]+FROM PUBLIC, anon/);
  assert.match(taskPortfolioMigration, /GRANT EXECUTE ON FUNCTION public\.hris_get_my_project_task_portfolio[^;]+TO authenticated, service_role/);
  assert.doesNotMatch(taskPortfolioMigration, /quality_of_work_score|collaboration_teamwork_score|comments/);
  assert.match(portfolioUi, /hris_get_my_project_task_portfolio/);
  assert.match(portfolioUi, /Feedback Pending/);
  assert.match(portfolioUi, /onOpenProject\(project\.project_id\)/);
  assert.match(organizationProjects, /workspace\.projects\.some\(project => project\.can_manage\)/);
  assert.match(organizationProjects, /organization-project-heading-/);
  const runner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
  assert.match(runner, /20261013225608_hris_project_manager_task_portfolio\.sql/);
  assert.match(runner, /taskPortfolioMember\.error\?\.code === '42501'/);
  assert.match(runner, /taskPortfolioCrossTenant\.error\?\.code === '42501'/);
  assert.match(runner, /taskPortfolioGlobalOnly\.error\?\.code === '42501'/);
  assert.match(runner, /taskPortfolioAnonymous\.ok/);
  const browser = readFileSync(new URL('../sql/isolated-auth/run-project-browser.mjs', import.meta.url), 'utf8');
  assert.match(browser, /Temporary task portfolio outage\./);
  assert.match(browser, /Mobile task portfolio and navigation/);
});

test('manager and employee screens complete task, release, review, and performance-history journeys', () => {
  for (const rpc of ['hris_create_project_task', 'hris_update_project_task', 'hris_start_project_task', 'hris_assign_project_task_member', 'hris_release_project_task_member', 'hris_complete_project_task']) {
    assert.ok(managerUi.includes(`'${rpc}'`), `manager UI must call ${rpc}`);
  }
  assert.match(managerUi, /role="alertdialog" aria-modal="true"/);
  assert.match(managerUi, /Collaborators whose assignments overlapped will receive required peer reviews/);
  assert.doesNotMatch(managerUi, /window\.confirm/);
  const browser = readFileSync(new URL('../sql/isolated-auth/run-project-browser.mjs', import.meta.url), 'utf8');
  assert.match(browser, /getByRole\('button', \{ name: 'Release Synthetic Absent Employee A from '/);
  assert.match(browser, /pmPage\.keyboard\.press\('Escape'\)/);
  assert.match(managerUi, /Feedback Pending/);
  assert.match(managerUi, /Edit task/);
  assert.match(managerUi, /Task details saved\./);
  assert.match(organizationProjects, /project\.can_manage && <ProjectTaskManager/);
  assert.match(myProjects, /<MyProjectWork tenantId=\{tenantId\} locale=\{locale\} \/>/);
  assert.match(employeeUi, /hris_get_my_project_tasks/);
  assert.match(employeeUi, /hris_get_my_project_peer_reviews/);
  assert.match(employeeUi, /Not Observed/);
  assert.match(employeeUi, /Submit review/);
  assert.match(performanceUi, /ProjectPeerReviewHistory tenantId=\{tenantId\} employeeId=\{ownEmployeeId\} locale=\{locale\}/);
  assert.match(performanceUi, /do not alter annual appraisal scores/);
});

test('project, task, peer-review, notification, and performance-history journey follows the persisted EN/BN locale', () => {
  assert.match(localeUi, /export type Locale = 'en' \| 'bn'/);
  assert.match(localeUi, /'Quality of Work': 'কাজের মান'/);
  assert.match(localeUi, /'Not Observed': 'পর্যবেক্ষণ করা হয়নি'/);
  assert.match(localeUi, /'Feedback Pending': 'মতামত অপেক্ষমাণ'/);
  assert.match(employeeUi, /projectText\(locale, english\)/);
  assert.match(managerUi, /projectText\(locale, english\)/);
  assert.match(portfolioUi, /projectText\(locale, english\)/);
  assert.match(organizationProjects, /ProjectTaskManager tenantId=\{tenantId\} projectId=\{project\.id\} locale=\{locale\}/);
  const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(workspace, /localStorage\.setItem\('synesis-hris-locale', locale\)/);
  assert.match(workspace, /document\.documentElement\.lang = locale/);
  const pageSources = [workspace, organizationProjects, myProjects, employeeUi, notificationUi, performanceUi, managerUi, portfolioUi];
  const translatedKeys = new Set([...localeUi.matchAll(/^\s*'([^']+)'\s*:/gm)].map(([, key]) => key));
  const uncovered = [...new Set(pageSources.flatMap(source => [...source.matchAll(/tx\('([^']+)'\)/g)].map(([, key]) => key)))].filter(key => !translatedKeys.has(key));
  assert.deepEqual(uncovered, [], 'all literal project-task-review UI labels must have a Bengali translation');
});

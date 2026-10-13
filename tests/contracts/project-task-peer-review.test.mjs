import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../supabase/migrations/20261013100001_hris_project_tasks_and_peer_reviews.sql', import.meta.url), 'utf8');
const managerUi = readFileSync(new URL('../../src/live/ProjectTaskManager.tsx', import.meta.url), 'utf8');
const employeeUi = readFileSync(new URL('../../src/live/MyProjectWork.tsx', import.meta.url), 'utf8');
const performanceUi = readFileSync(new URL('../../src/live/MyPerformance.tsx', import.meta.url), 'utf8');
const organizationProjects = readFileSync(new URL('../../src/live/OrganizationProjects.tsx', import.meta.url), 'utf8');
const myProjects = readFileSync(new URL('../../src/live/MyProjects.tsx', import.meta.url), 'utf8');

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

test('manager and employee screens complete task, release, review, and performance-history journeys', () => {
  for (const rpc of ['hris_create_project_task', 'hris_start_project_task', 'hris_assign_project_task_member', 'hris_release_project_task_member', 'hris_complete_project_task']) {
    assert.ok(managerUi.includes(`'${rpc}'`), `manager UI must call ${rpc}`);
  }
  assert.match(managerUi, /window\.confirm\('Mark this operational task complete\?/);
  assert.match(managerUi, /Feedback Pending/);
  assert.match(organizationProjects, /project\.can_manage && <ProjectTaskManager/);
  assert.match(myProjects, /<MyProjectWork tenantId=\{tenantId\} \/>/);
  assert.match(employeeUi, /hris_get_my_project_tasks/);
  assert.match(employeeUi, /hris_get_my_project_peer_reviews/);
  assert.match(employeeUi, /Not Observed/);
  assert.match(employeeUi, /Submit review/);
  assert.match(performanceUi, /ProjectPeerReviewHistory tenantId=\{tenantId\} employeeId=\{ownEmployeeId\}/);
  assert.match(performanceUi, /do not alter annual appraisal scores/);
});

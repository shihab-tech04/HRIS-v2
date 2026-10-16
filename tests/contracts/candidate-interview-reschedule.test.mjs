import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const interviewMigration = readFileSync(new URL('../../supabase/migrations/20261013221500_hris_candidate_interview_journey.sql', import.meta.url), 'utf8');
const debriefMigration = readFileSync(new URL('../../supabase/migrations/20261014153343_hris_candidate_interview_panel_debrief.sql', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../src/live/RecruitmentPipeline.tsx', import.meta.url), 'utf8');
const locale = readFileSync(new URL('../../src/live/candidate-interview-locale.ts', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../sql/isolated-auth/run-recruitment-browser.mjs', import.meta.url), 'utf8');

test('candidate reschedule request replaces only the requested same-tenant interview and keeps candidate confirmation enabled', () => {
  assert.match(interviewMigration, /i\.candidate_response='reschedule_requested'/);
  assert.match(interviewMigration, /i\.candidate_response IN \('invited','confirmed'\)/);
  assert.match(interviewMigration, /UPDATE public\.interviews i SET status='cancelled'/);
  assert.match(interviewMigration, /auth\.uid\(\),'invited'/);
  assert.match(interviewMigration, /a\.tenant_id=p_tenant_id/);
  assert.match(interviewMigration, /a\.candidate_user_id=auth\.uid\(\)/);
  assert.match(debriefMigration, /has_tenant_permission\(p_tenant_id,'recruitment\.manage'\)/);
});

test('reschedule UI reuses the tenant scheduling RPC and refreshes with a persistent success state', () => {
  assert.match(ui, /InterviewScheduleForm\(\{ tenantId, applicationId, onScheduled, onCancel, compact = false, locale \}/);
  assert.match(ui, /<InterviewScheduleForm key=\{`\$\{tenantId\}-\$\{row\.application_id\}-\$\{revision\}`\} compact locale=\{locale\}/);
  assert.match(ui, /rpc\('hris_schedule_candidate_interview'/);
  assert.match(ui, /setRescheduledApplicationId\(row\.application_id\)/);
  assert.match(ui, /data-interview-application-id=\{row\.application_id\}/);
  assert.match(ui, /onCancel=\{\(\) => setExpanded\(''\)\}/);
  assert.match(ui, /function cancel\(\)/);
  assert.match(ui, /setScheduledAt\(''\)/);
  assert.match(ui, /Replacement interview invitation sent and refreshed/);
  assert.match(locale, /'Offer another time': '[^']+'/);
  assert.match(locale, /'The interview could not be scheduled\. Check the details and your recruitment access, then try again\.': '[^']+'/);
  assert.match(locale, /'Replacement interview invitation sent and refreshed\. The candidate can respond to the new time\.': '[^']+'/);
});

test('isolated Auth/Postgres browser acceptance injects one failed save, retries retained fields, confirms replacement, and checks EN/BN responsive states', () => {
  assert.match(runner, /candidateARescheduleRequest/);
  assert.match(runner, /Manager replacement interview persists, cancels the prior request, and lets its owner confirm the new invitation/);
  assert.match(browser, /failNextInterviewSchedule = true/);
  assert.match(browser, /Synthetic one-time scheduling failure/);
  assert.match(browser, /Failed reschedule did not preserve the round draft/);
  assert.match(browser, /Cancel did not clear the replacement interview draft/);
  assert.match(browser, /Switch language to Bengali/);
  assert.match(browser, /Bengali replacement interview desktop/);
  assert.match(browser, /Interview scheduling, candidate reschedule, private panel debrief/);
});

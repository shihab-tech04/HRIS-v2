import { expect, test } from '@playwright/test';

const userId = 'e3333333-3333-4333-8333-333333333333';
const tenantId = 'e4444444-4444-4444-8444-444444444444';
const candidateId = 'e5555555-5555-4555-8555-555555555555';
const applicationId = 'e6666666-6666-4666-8666-666666666666';
const user = { id: userId, aud: 'authenticated', role: 'authenticated',
  email: 'synthetic-recruiter@example.org', app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {}, created_at: '2026-01-01T00:00:00.000Z' };
const jwtHeader = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
const jwtPayload = Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated',
  role: 'authenticated', email: user.email,
  iss: 'https://oslgwxaqfbteqtwqvdzs.supabase.co/auth/v1',
  exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
const jwt = [jwtHeader, jwtPayload, 'synthetic-signature'].join('.');

function localDateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function futureLocalDateTime(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 30, 0, 0);
  return `${localDateInput(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

test('recruiter reviews an application, signs a private CV link and persists a stage decision', async ({ page }) => {
  let stage = 'submitted';
  let stageWrites = 0;
  let interviewWrites = 0;
  let assessmentWrites = 0;
  let assessmentReviews = 0;
  let signedCvRequests = 0;
  const interviews: Record<string, unknown>[] = [];
  const assessments: Record<string, unknown>[] = [{
    id: 'e7777777-7777-4777-8777-777777777777', application_id: applicationId,
    title: 'Synthetic take-home assessment', assessment_type: 'Technical assessment',
    instructions: 'Submit the exercise.', deadline_date: localDateInput(new Date(Date.now() + 86400000)),
    status: 'submitted', submission_data: { submission_text: 'Candidate evaluation sample output.' },
    submitted_at: '2026-10-15T12:00:00Z'
  }];
  const permissionChecks: string[] = [];
  let activeMembershipReads = 0;
  await page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token')) {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ access_token: jwt, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user }) });
      return;
    }
    if (path.endsWith('/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
      return;
    }
    await route.fulfill({ status: 400, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.split('/').pop();
    if (endpoint === 'has_permission') {
      const permission = (request.postDataJSON() as { p_permission_id?: string }).p_permission_id || '';
      permissionChecks.push(permission);
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(permission === 'recruitment.view' || permission === 'recruitment.manage') });
      return;
    }
    if (endpoint === 'admin_get_recruitment_data') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ applications: [{
        id: applicationId, candidate_user_id: candidateId, full_name: 'Synthetic Candidate',
        email: 'candidate@example.org', phone: '+8801000000000', current_location: 'Dhaka',
        years_experience: 4, skills: ['TypeScript', 'PostgreSQL'], cv_url: `${candidateId}/cv.pdf`,
        cover_letter: 'Synthetic application for browser acceptance.',
        application_data: { answers: [{ questionId: 'q1', answer: 'Yes' }] },
        stage, status_note: 'Synthetic internal recruiter note', applied_at: '2026-10-15T09:00:00Z',
        job_title: 'Software Engineer', job_reference: 'SYN-01', stage_history: []
      }], interviews, assessments }) });
      return;
    }
    if (endpoint === 'admin_update_application_stage') {
      const body = request.postDataJSON() as { p_application_id: string; p_stage: string; p_note: string | null };
      expect(body.p_application_id).toBe(applicationId);
      expect(body.p_stage).toBe('shortlisted');
      expect(body.p_note).toBe('Reviewed in synthetic browser test');
      stage = body.p_stage;
      stageWrites += 1;
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (endpoint === 'admin_schedule_interview') {
      const body = request.postDataJSON() as { p_application_id: string; p_payload: Record<string, unknown> };
      expect(body.p_application_id).toBe(applicationId);
      expect(new Date(String(body.p_payload.scheduled_at)).getTime()).toBeGreaterThan(Date.now());
      expect(body.p_payload.timezone).toBeTruthy();
      expect(body.p_payload.panel_members).toEqual(['Synthetic Panelist', 'Synthetic Recruiter']);
      interviews.push({
        id: 'e8888888-8888-4888-8888-888888888888', application_id: applicationId,
        scheduled_at: body.p_payload.scheduled_at, interview_type: body.p_payload.interview_type,
        location_or_link: body.p_payload.location_or_link, status: 'scheduled',
        timezone: body.p_payload.timezone, duration_minutes: body.p_payload.duration_minutes,
        instructions: body.p_payload.instructions, panel_members: body.p_payload.panel_members,
        panel_notes: body.p_payload.panel_notes, candidate_response: 'invited'
      });
      stage = 'interview';
      interviewWrites += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify('e8888888-8888-4888-8888-888888888888') });
      return;
    }
    if (endpoint === 'admin_assign_assessment') {
      const body = request.postDataJSON() as { p_application_id: string; p_payload: Record<string, unknown> };
      expect(body.p_application_id).toBe(applicationId);
      expect(body.p_payload.title).toBe('Synthetic system design');
      expect(body.p_payload.assessment_type).toBe('Technical assessment');
      expect(body.p_payload.instructions).toBe('Complete the documented system design task.');
      expect(body.p_payload.deadline_date).toBeTruthy();
      assessments.push({
        id: 'e9999999-9999-4999-8999-999999999999', application_id: applicationId,
        title: body.p_payload.title, assessment_type: body.p_payload.assessment_type,
        instructions: body.p_payload.instructions, deadline_date: body.p_payload.deadline_date,
        status: 'pending'
      });
      stage = 'assessment';
      assessmentWrites += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify('e9999999-9999-4999-8999-999999999999') });
      return;
    }
    if (endpoint === 'admin_review_assessment') {
      const body = request.postDataJSON() as { p_assessment_id: string; p_note: string | null };
      expect(body.p_assessment_id).toBe('e7777777-7777-4777-8777-777777777777');
      expect(body.p_note).toBe('Panel recommends progression to final review.');
      const submitted = assessments.find(item => item.id === body.p_assessment_id);
      expect(submitted?.status).toBe('submitted');
      Object.assign(submitted!, { status: 'reviewed', review_note: body.p_note });
      assessmentReviews += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, status: 'reviewed' }) });
      return;
    }

    let data: unknown = [];
    if (endpoint === 'tenant_memberships') {
      activeMembershipReads += 1;
      data = [{ tenant_id: tenantId, role: 'hr_admin', status: 'active' }];
    } else if (endpoint === 'admin_users') data = { active: true, is_super_admin: false };
    else if (endpoint === 'tenants') data = url.searchParams.get('select') === 'id'
      ? { id: tenantId } : [{ id: tenantId, name: 'Synthetic Synesis', slug: 'synesis-it', timezone: 'Asia/Dhaka' }];
    if (request.method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' }, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.route('**/storage/v1/object/sign/candidate-documents/**', async route => {
    signedCvRequests += 1;
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ signedURL: `/storage/v1/object/sign/candidate-documents/${candidateId}/cv.pdf?token=synthetic` }) });
  });

  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  const moduleNav = page.getByRole('navigation', { name: 'HRIS modules' });
  await expect(moduleNav).toBeVisible();
  expect(activeMembershipReads).toBeGreaterThan(0);
  await moduleNav.getByRole('button', { name: /Candidate pipeline/ }).click();
  const pipeline = page.getByRole('region', { name: 'Recruiter candidate pipeline' });
  await expect(pipeline.getByText('Synthetic Candidate')).toBeVisible();
  await expect(pipeline.getByText('Synthetic internal recruiter note')).toBeVisible();

  await pipeline.getByRole('button', { name: 'Prepare private CV link' }).click();
  await expect(pipeline.getByRole('link', { name: 'Open CV (valid 1 minute)' })).toBeVisible();
  expect(signedCvRequests).toBe(1);

  await pipeline.getByLabel('Next stage').selectOption('shortlisted');
  await pipeline.getByLabel('Internal note').fill('Reviewed in synthetic browser test');
  await pipeline.getByRole('button', { name: 'Save decision' }).click();
  await expect(pipeline.getByText('Application stage updated to Shortlisted.')).toBeVisible();
  await expect(pipeline.getByText('shortlisted', { exact: true })).toBeVisible();
  expect(stageWrites).toBe(1);

  await expect(pipeline.getByText('Candidate evaluation sample output.')).toBeVisible();
  await pipeline.getByLabel('Panel evaluation note').fill('Panel recommends progression to final review.');
  await pipeline.getByRole('button', { name: 'Save panel evaluation' }).click();
  await expect(pipeline.getByText('Assessment evaluation saved in HRIS.')).toBeVisible();
  await expect(pipeline.getByText('Synthetic take-home assessment · reviewed', { exact: true })).toBeVisible();
  expect(assessmentReviews).toBe(1);

  await pipeline.getByRole('region', { name: `Interview coordination for Synthetic Candidate` }).locator('summary').click();
  await pipeline.getByLabel(/Date and time/).fill(futureLocalDateTime());
  await pipeline.getByLabel('Interview type').fill('Technical panel interview');
  await pipeline.getByLabel('Meeting location or link').fill('https://meet.example.test/synthetic');
  await pipeline.getByLabel('Panel members').fill('Synthetic Panelist, Synthetic Recruiter');
  await pipeline.getByLabel('Candidate instructions').fill('Bring your portfolio.');
  await pipeline.getByLabel('Private panel notes').fill('Keep panel discussion private.');
  await pipeline.getByRole('button', { name: 'Schedule interview' }).click();
  await expect(pipeline.getByText('Interview scheduled in HRIS and the candidate has been notified.')).toBeVisible();
  await expect(pipeline.getByText(/Technical panel interview/)).toBeVisible();
  expect(interviewWrites).toBe(1);

  await pipeline.getByRole('region', { name: `Assessment review for Synthetic Candidate` }).locator('summary').click();
  await pipeline.getByLabel('Assessment title').fill('Synthetic system design');
  await pipeline.getByLabel('Assessment type').fill('Technical assessment');
  await pipeline.getByLabel('Candidate assessment instructions').fill('Complete the documented system design task.');
  const deadline = new Date(); deadline.setDate(deadline.getDate() + 2);
  await pipeline.getByLabel('Deadline').fill(localDateInput(deadline));
  await pipeline.getByRole('button', { name: 'Assign assessment' }).click();
  await expect(pipeline.getByText('Assessment assigned in HRIS and the candidate has been notified.')).toBeVisible();
  await expect(pipeline.getByText(/Synthetic system design/)).toBeVisible();
  expect(assessmentWrites).toBe(1);

  expect(permissionChecks).toContain('recruitment.view');
  expect(permissionChecks).toContain('recruitment.manage');
});

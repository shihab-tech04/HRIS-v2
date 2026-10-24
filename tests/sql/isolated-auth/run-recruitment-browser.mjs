// Exercises the HRIS recruiter queue against real local Auth, RPC, and Postgres rows.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_RECRUITMENT_EMAIL', 'HRIS_LOCAL_TENANT_ID',
  'HRIS_LOCAL_ASSESSMENT_TITLE', 'HRIS_LOCAL_ASSESSMENT_REVIEW_NOTE',
  'HRIS_LOCAL_INTERVIEW_ID', 'HRIS_LOCAL_INTERVIEW_PANEL_NOTES',
  'HRIS_LOCAL_APPLICATION_A2_ID',
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing integration setting ${key}.`);

const repo = process.cwd();
const port = '48373';
const origin = `http://127.0.0.1:${port}`;
const server = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
  cwd: repo,
  env: {
    ...process.env,
    VITE_SUPABASE_URL: process.env.HRIS_LOCAL_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: process.env.HRIS_LOCAL_SUPABASE_ANON_KEY,
  },
  stdio: 'ignore',
});

let browser;
async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Local Vite server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(origin);
      if (response.ok && (await response.text()).includes('Synesis HRIS 360°')) return;
    } catch { /* server is starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the local HRIS UI server.');
}

async function signIn(page) {
  await page.goto(origin);
  await page.getByLabel('Email', { exact: true }).waitFor({ state: 'visible' });
  await page.getByLabel('Email', { exact: true }).fill(process.env.HRIS_LOCAL_RECRUITMENT_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(process.env.HRIS_LOCAL_TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation menu' }).waitFor({ state: 'visible' });
}

async function openRecruitmentPipeline(page) {
  const navigation = page.getByRole('navigation', { name: 'HRIS modules' });
  const menu = page.getByRole('button', { name: 'Open navigation menu' });
  if (!(await navigation.isVisible())) await menu.click();
  await navigation.getByRole('button', { name: 'Candidate pipeline', exact: true }).click();
  await page.getByRole('heading', { name: 'Candidate pipeline' }).waitFor({ state: 'visible' });
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  if (dimensions.document > dimensions.viewport) throw new Error(`${label} overflowed: ${JSON.stringify(dimensions)}.`);
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const directoryReads = [];
  let failNextPanelNotesSave = true;
  let failNextInterviewSchedule = true;
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/rest/v1/employees') && url.searchParams.get('select') === 'id,full_name,employee_number,employment_status') {
      directoryReads.push('employees');
    }
    if (url.pathname.endsWith('/rest/v1/departments')) directoryReads.push('departments');
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/rest/v1/rpc/hris_save_candidate_interview_panel_notes') && failNextPanelNotesSave) {
      failNextPanelNotesSave = false;
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic one-time save failure.' }) });
    }
    if (url.pathname.endsWith('/rest/v1/rpc/hris_schedule_candidate_interview') && failNextInterviewSchedule) {
      failNextInterviewSchedule = false;
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'Synthetic one-time scheduling failure.' }) });
    }
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
  await signIn(page);
  if (directoryReads.length) throw new Error(`Recruitment-only membership attempted unrelated directory reads: ${directoryReads.join(', ')}.`);
  await openRecruitmentPipeline(page);
  const applicationA2 = page.locator(`[data-application-id="${process.env.HRIS_LOCAL_APPLICATION_A2_ID}"]`);
  await page.getByText('Candidate A One', { exact: true }).waitFor({ state: 'visible' });
  await applicationA2.waitFor({ state: 'visible' });
  if (await page.getByText('Candidate B Only', { exact: true }).count()) throw new Error('Tenant B candidate appeared in tenant A queue.');
  for (const marker of ['private-email-a@candidate.test', 'private-phone-a', 'private-cv-url-a', 'private-cover-letter-a', 'private-reviewer-note-a']) {
    if (await page.getByText(marker, { exact: false }).count()) throw new Error(`Private application content was rendered: ${marker}.`);
  }
  await page.getByText('Candidate A One', { exact: true }).locator('xpath=ancestor::li').getByText('View candidate-visible milestones').click();
  await page.getByText('Screening', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Recruitment pipeline mobile');

  await page.getByLabel('Search candidate applications').fill('Platform Engineer');
  const searchResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_recruitment_pipeline'));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await searchResponse;
  await applicationA2.waitFor({ state: 'detached' });
  await page.getByText('Candidate A One', { exact: true }).waitFor({ state: 'visible' });
  if (await applicationA2.count()) throw new Error('Recruitment search did not filter the current application set.');
  const stageResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_recruitment_pipeline'));
  await page.getByLabel('Filter candidate applications by stage').selectOption('submitted');
  await stageResponse;
  await applicationA2.waitFor({ state: 'detached' });
  await page.getByText('Candidate A One', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Recruitment filtered mobile');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Refresh candidate applications' }).click();
  await page.getByText('Candidate A One', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Recruitment desktop');

  await page.getByLabel('Filter candidate applications by stage').selectOption('');
  await page.getByLabel('Search candidate applications').fill('');
  const resetResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_recruitment_pipeline'));
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await resetResponse;
  await applicationA2.waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 375, height: 812 });
  const firstApplication = page.getByText('Candidate A One', { exact: true }).locator('xpath=ancestor::li');
  await firstApplication.getByText('Update application progress', { exact: true }).click();
  await firstApplication.getByLabel('Next application stage for Candidate A One').selectOption('under_review');
  let updateResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_update_candidate_application_stage'));
  await firstApplication.getByRole('button', { name: 'Save stage', exact: true }).click();
  await updateResponse;
  await firstApplication.getByText('Under Review', { exact: true }).first().waitFor({ state: 'visible' });

  await firstApplication.getByLabel('Next application stage for Candidate A One').selectOption('screening');
  updateResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_update_candidate_application_stage'));
  await firstApplication.getByRole('button', { name: 'Save stage', exact: true }).click();
  await updateResponse;
  await firstApplication.getByText('Screening', { exact: true }).first().waitFor({ state: 'visible' });
  await firstApplication.getByText('View candidate-visible milestones', { exact: true }).click();
  await firstApplication.getByText('Screening', { exact: true }).last().waitFor({ state: 'visible' });

  await assertNoOverflow(page, 'Recruitment stage update mobile');

  await page.getByRole('button', { name: 'Refresh candidate applications' }).click();
  await page.getByText('Candidate A One', { exact: true }).waitFor({ state: 'visible' });
  const refreshedFirstApplication = page.getByText('Candidate A One', { exact: true }).locator('xpath=ancestor::li');
  await refreshedFirstApplication.getByText('Screening', { exact: true }).first().waitFor({ state: 'visible' });
  await refreshedFirstApplication.getByText('View candidate-visible milestones', { exact: true }).click();
  await refreshedFirstApplication.getByText('Screening', { exact: true }).last().waitFor({ state: 'visible' });
  const refreshedSecondApplication = applicationA2;
  await refreshedSecondApplication.getByText('Interview Scheduled', { exact: true }).first().waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Recruitment stage update mobile refresh');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Refresh candidate applications' }).click();
  await page.getByText('Candidate A One', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Recruitment stage update desktop');
  await page.setViewportSize({ width: 375, height: 812 });
  const interviewSection = page.getByRole('region', { name: 'Interview responses' });
  const interviewCard = interviewSection.locator(`[data-interview-id="${process.env.HRIS_LOCAL_INTERVIEW_ID}"]`);
  await interviewCard.waitFor({ state: 'visible' });
  await interviewCard.getByText('Reschedule requested', { exact: true }).waitFor({ state: 'visible' });
  await interviewCard.getByText('The scheduled time conflicts with a client meeting.', { exact: false }).waitFor({ state: 'visible' });
  await interviewCard.getByRole('button', { name: 'Add panel notes', exact: true }).click();
  let panelNotesInput = interviewCard.getByLabel('Panel notes — Candidate A Two', { exact: true });
  await panelNotesInput.fill('Cancelled panel draft must not persist.');
  await interviewCard.getByRole('button', { name: 'Cancel', exact: true }).click();
  if (await panelNotesInput.count()) throw new Error('Cancel left the internal interview note form open.');
  let interviewRefresh = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_candidate_interview_responses'));
  await interviewSection.getByRole('button', { name: 'Refresh interview responses', exact: true }).click();
  await interviewRefresh;
  await interviewCard.getByText('No internal panel notes have been recorded.', { exact: true }).waitFor({ state: 'visible' });
  await interviewCard.getByRole('button', { name: 'Add panel notes', exact: true }).click();
  panelNotesInput = interviewCard.getByLabel('Panel notes — Candidate A Two', { exact: true });
  await panelNotesInput.fill(process.env.HRIS_LOCAL_INTERVIEW_PANEL_NOTES);
  let panelNotesResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_save_candidate_interview_panel_notes'));
  await interviewCard.getByRole('button', { name: 'Save panel notes', exact: true }).click();
  const transientNotesResponse = await panelNotesResponse;
  if (transientNotesResponse.status() !== 500) throw new Error(`Expected an injected one-time notes failure, received ${transientNotesResponse.status()}.`);
  await interviewCard.getByRole('alert').waitFor({ state: 'visible' });
  if (await panelNotesInput.inputValue() !== process.env.HRIS_LOCAL_INTERVIEW_PANEL_NOTES) throw new Error('Failed save did not preserve the panel note draft.');
  panelNotesResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_save_candidate_interview_panel_notes'));
  await interviewCard.getByRole('button', { name: 'Save panel notes', exact: true }).click();
  const savedPanelNotesResponse = await panelNotesResponse;
  if (!savedPanelNotesResponse.ok()) throw new Error(`Panel notes RPC failed with HTTP ${savedPanelNotesResponse.status()}.`);
  await interviewCard.getByText(process.env.HRIS_LOCAL_INTERVIEW_PANEL_NOTES, { exact: true }).waitFor({ state: 'visible' });
  interviewRefresh = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_candidate_interview_responses'));
  await interviewSection.getByRole('button', { name: 'Refresh interview responses', exact: true }).click();
  await interviewRefresh;
  await interviewCard.getByText(process.env.HRIS_LOCAL_INTERVIEW_PANEL_NOTES, { exact: true }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  const interviewSectionBn = page.getByRole('region', { name: 'সাক্ষাৎকারের উত্তর' });
  const interviewCardBn = interviewSectionBn.locator(`[data-interview-id="${process.env.HRIS_LOCAL_INTERVIEW_ID}"]`);
  await interviewCardBn.getByText('প্যানেলের অভ্যন্তরীণ নোট', { exact: true }).waitFor({ state: 'visible' });
  await interviewCardBn.getByRole('button', { name: 'প্যানেল নোট সম্পাদনা করুন', exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Bengali interview debrief mobile');
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Bengali interview debrief desktop');
  await page.getByRole('button', { name: 'Switch language to English' }).click();
  await page.setViewportSize({ width: 375, height: 812 });

  await interviewCard.getByText('The scheduled time conflicts with a client meeting.', { exact: false }).waitFor({ state: 'visible' });
  await interviewCard.getByText('Available after 3:00 PM on the next two working days.', { exact: false }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  const rescheduleCardBn = interviewSectionBn.locator(`[data-interview-application-id="${process.env.HRIS_LOCAL_APPLICATION_A2_ID}"]`);
  await rescheduleCardBn.getByText('সময় পরিবর্তনের অনুরোধ', { exact: true }).waitFor({ state: 'visible' });
  await rescheduleCardBn.getByText('প্রস্তাবিত সময়:', { exact: false }).waitFor({ state: 'visible' });
  await rescheduleCardBn.getByText('নতুন সময় দিন', { exact: true }).click();
  const rescheduleRound = rescheduleCardBn.getByLabel('সাক্ষাৎকারের ধাপ', { exact: true });
  const rescheduleDate = rescheduleCardBn.getByLabel('সাক্ষাৎকারের তারিখ ও সময় (প্রতিষ্ঠানের সময় অঞ্চল)', { exact: true });
  const rescheduleLink = rescheduleCardBn.getByLabel('নিরাপদ মিটিং লিংক', { exact: true });
  await rescheduleRound.fill('ফলো-আপ সাক্ষাৎকার');
  await rescheduleDate.fill(new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString().slice(0, 16));
  await rescheduleLink.fill('https://meet.example.test/hris-rescheduled-interview');
  const rescheduleDetails = rescheduleCardBn.locator('details');
  await rescheduleCardBn.getByRole('button', { name: 'বাতিল', exact: true }).click();
  if (await rescheduleDetails.evaluate(details => details.open)) throw new Error('Cancel did not close the replacement interview form.');
  await rescheduleCardBn.getByText('নতুন সময় দিন', { exact: true }).click();
  if (await rescheduleRound.inputValue() !== '' || await rescheduleDate.inputValue() !== '' || await rescheduleLink.inputValue() !== '') {
    throw new Error('Cancel did not clear the replacement interview draft.');
  }
  await rescheduleRound.fill('ফলো-আপ সাক্ষাৎকার');
  await rescheduleDate.fill(new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString().slice(0, 16));
  await rescheduleLink.fill('https://meet.example.test/hris-rescheduled-interview');
  let replacementResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_schedule_candidate_interview'));
  await rescheduleCardBn.getByRole('button', { name: 'সাক্ষাৎকারের আমন্ত্রণ পাঠান', exact: true }).click();
  const transientScheduleResponse = await replacementResponse;
  if (transientScheduleResponse.status() !== 500) throw new Error(`Expected an injected one-time scheduling failure, received ${transientScheduleResponse.status()}.`);
  await rescheduleCardBn.getByRole('alert').waitFor({ state: 'visible' });
  if (await rescheduleRound.inputValue() !== 'ফলো-আপ সাক্ষাৎকার') throw new Error('Failed reschedule did not preserve the round draft.');
  if (await rescheduleDate.inputValue() === '') throw new Error('Failed reschedule did not preserve the date draft.');
  if (await rescheduleLink.inputValue() !== 'https://meet.example.test/hris-rescheduled-interview') throw new Error('Failed reschedule did not preserve the meeting link draft.');
  replacementResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_schedule_candidate_interview'));
  const refreshResponses = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_candidate_interview_responses'), { timeout: 10000 }).catch(() => null);
  await rescheduleCardBn.getByRole('button', { name: 'সাক্ষাৎকারের আমন্ত্রণ পাঠান', exact: true }).click();
  const savedScheduleResponse = await replacementResponse;
  if (!savedScheduleResponse.ok()) {
    const responseBody = await savedScheduleResponse.text().catch(() => '');
    let requestBody = {};
    try { requestBody = JSON.parse(savedScheduleResponse.request().postData() || '{}'); } catch { /* retain safe empty diagnostic */ }
    throw new Error(`Replacement scheduling RPC failed with HTTP ${savedScheduleResponse.status()}: ${responseBody.slice(0, 500)}; tenant=${requestBody.p_tenant_id || 'missing'}; application=${requestBody.p_application_id || 'missing'}; expectedTenant=${process.env.HRIS_LOCAL_TENANT_ID}; expectedApplication=${process.env.HRIS_LOCAL_APPLICATION_A2_ID}.`);
  }
  if (!await refreshResponses) throw new Error('Replacement scheduling did not refresh the interview response list.');
  await interviewSectionBn.getByRole('status').filter({ hasText: 'নতুন সাক্ষাৎকারের আমন্ত্রণ পাঠানো ও তালিকা হালনাগাদ করা হয়েছে।' }).waitFor({ state: 'visible' });
  await rescheduleCardBn.getByText('ফলো-আপ সাক্ষাৎকার', { exact: false }).waitFor({ state: 'visible' });
  await rescheduleCardBn.getByText('প্রার্থীর উত্তরের অপেক্ষায়', { exact: true }).waitFor({ state: 'visible' });
  if (await rescheduleCardBn.getByText('নতুন সময় দিন', { exact: true }).count()) throw new Error('A replacement interview still appeared as an unresolved reschedule request.');
  await assertNoOverflow(page, 'Bengali replacement interview mobile');
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Bengali replacement interview desktop');
  await page.getByRole('button', { name: 'Switch language to English' }).click();
  await page.setViewportSize({ width: 375, height: 812 });

  const assessmentCard = page.getByText(process.env.HRIS_LOCAL_ASSESSMENT_TITLE, { exact: true }).locator('xpath=ancestor::li');
  await assessmentCard.getByRole('button', { name: 'Review submission', exact: true }).click();
  const reviewNoteInput = page.getByLabel('Internal review note', { exact: false });
  await reviewNoteInput.fill('This draft note is cancelled and must not persist.');
  await assessmentCard.getByRole('button', { name: 'Cancel', exact: true }).click();
  if (await reviewNoteInput.count()) throw new Error('Cancel did not close the internal review note form.');
  const reviewResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_review_candidate_assessment'));
  await assessmentCard.getByRole('button', { name: 'Review submission', exact: true }).click();
  await page.getByLabel('Internal review note', { exact: false }).fill(process.env.HRIS_LOCAL_ASSESSMENT_REVIEW_NOTE);
  await assessmentCard.getByRole('button', { name: 'Mark review complete', exact: true }).click();
  const savedReviewResponse = await reviewResponse;
  if (!savedReviewResponse.ok()) throw new Error(`Assessment review RPC failed with HTTP ${savedReviewResponse.status()}.`);
  await assessmentCard.getByText('Review complete', { exact: true }).waitFor({ state: 'visible' });
  await assessmentCard.getByText(process.env.HRIS_LOCAL_ASSESSMENT_REVIEW_NOTE, { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Candidate assessment review mobile');
  const refreshAssessmentResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_candidate_assessments'));
  await page.getByRole('button', { name: 'Refresh candidate assessments', exact: true }).click();
  await refreshAssessmentResponse;
  await assessmentCard.getByText(process.env.HRIS_LOCAL_ASSESSMENT_REVIEW_NOTE, { exact: true }).waitFor({ state: 'visible' });

  await page.getByRole('button', { name: 'Switch language to Bengali' }).click();
  await page.getByRole('heading', { name: 'প্রার্থীর মূল্যায়ন' }).waitFor({ state: 'visible' });
  await assessmentCard.getByText('পর্যালোচনা সম্পন্ন', { exact: true }).waitFor({ state: 'visible' });
  await assessmentCard.getByText(process.env.HRIS_LOCAL_ASSESSMENT_REVIEW_NOTE, { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Bengali candidate assessment review mobile');

  const bengaliFirstApplication = page.getByText('Candidate A One', { exact: true }).locator('xpath=ancestor::li');
  await bengaliFirstApplication.getByText('মূল্যায়ন বরাদ্দ করুন', { exact: true }).click();
  await bengaliFirstApplication.getByLabel('মূল্যায়নের শিরোনাম — Candidate A One').fill('QA Assessment UI Assignment');
  await bengaliFirstApplication.getByLabel('মূল্যায়নের ধরন — Candidate A One').fill('Technical');
  await bengaliFirstApplication.getByLabel('মূল্যায়নের নির্দেশনা — Candidate A One').fill('Complete this additional live assignment from the candidate task list.');
  const dueDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await bengaliFirstApplication.getByLabel('শেষ তারিখ — Candidate A One').fill(dueDate);
  const assignmentResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_assign_candidate_assessment'));
  await bengaliFirstApplication.getByRole('button', { name: 'প্রার্থীকে বরাদ্দ করুন', exact: true }).click();
  const savedAssignmentResponse = await assignmentResponse;
  if (!savedAssignmentResponse.ok()) throw new Error(`Assessment assignment RPC failed with HTTP ${savedAssignmentResponse.status()}.`);
  await page.getByText('QA Assessment UI Assignment', { exact: true }).waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await assertNoOverflow(page, 'Candidate assessment assignment Bengali desktop');
  console.log('Interview scheduling, candidate reschedule, private panel debrief, failure retry, EN/BN, refresh, and 375px/1280px passed.');
  console.log('Candidate assessment assignment and internal review note persisted after refresh; EN/BN, cancel, mobile, and desktop passed.');
  console.log('Local Auth-to-Postgres recruitment stage workflow passed at 375px and 1280px; mobile+desktop refresh recovery passed.');
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
}

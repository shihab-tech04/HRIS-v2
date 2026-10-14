// Exercises the HRIS recruiter queue against real local Auth, RPC, and Postgres rows.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const required = [
  'HRIS_LOCAL_SUPABASE_URL', 'HRIS_LOCAL_SUPABASE_ANON_KEY', 'HRIS_LOCAL_TEST_PASSWORD',
  'HRIS_LOCAL_RECRUITMENT_EMAIL', 'HRIS_LOCAL_TENANT_ID',
  'HRIS_LOCAL_ASSESSMENT_TITLE', 'HRIS_LOCAL_ASSESSMENT_REVIEW_NOTE',
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
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/rest/v1/employees') && url.searchParams.get('select') === 'id,full_name,employee_number,employment_status') {
      directoryReads.push('employees');
    }
    if (url.pathname.endsWith('/rest/v1/departments')) directoryReads.push('departments');
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
  await signIn(page);
  if (directoryReads.length) throw new Error(`Recruitment-only membership attempted unrelated directory reads: ${directoryReads.join(', ')}.`);
  await openRecruitmentPipeline(page);
  await page.getByText('Candidate A One', { exact: true }).waitFor({ state: 'visible' });
  await page.getByText('Candidate A Two', { exact: true }).waitFor({ state: 'visible' });
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
  await page.getByText('Candidate A Two', { exact: true }).waitFor({ state: 'detached' });
  await page.getByText('Candidate A One', { exact: true }).waitFor({ state: 'visible' });
  if (await page.getByText('Candidate A Two', { exact: true }).count()) throw new Error('Recruitment search did not filter the current application set.');
  const stageResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_get_recruitment_pipeline'));
  await page.getByLabel('Filter candidate applications by stage').selectOption('submitted');
  await stageResponse;
  await page.getByText('Candidate A Two', { exact: true }).waitFor({ state: 'detached' });
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
  await page.getByText('Candidate A Two', { exact: true }).waitFor({ state: 'visible' });
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

  const secondApplication = page.getByText('Candidate A Two', { exact: true }).locator('xpath=ancestor::li');
  await secondApplication.getByText('Update application progress', { exact: true }).click();
  await secondApplication.getByLabel('Next application stage for Candidate A Two').selectOption('rejected');
  await secondApplication.getByRole('button', { name: 'Save stage', exact: true }).click();
  await secondApplication.getByRole('alertdialog', { name: 'Confirm application rejection' }).waitFor({ state: 'visible' });
  await secondApplication.getByRole('button', { name: 'Cancel', exact: true }).click();
  if (await secondApplication.getByRole('alertdialog', { name: 'Confirm application rejection' }).count()) {
    throw new Error('Rejection confirmation did not cancel.');
  }
  await secondApplication.getByRole('button', { name: 'Save stage', exact: true }).click();
  await secondApplication.getByRole('alertdialog', { name: 'Confirm application rejection' }).waitFor({ state: 'visible' });
  updateResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/hris_update_candidate_application_stage'));
  await secondApplication.getByRole('button', { name: 'Confirm rejection', exact: true }).click();
  await updateResponse;
  await secondApplication.getByText('Rejected', { exact: true }).first().waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Recruitment stage update mobile');

  await page.getByRole('button', { name: 'Refresh candidate applications' }).click();
  await page.getByText('Candidate A One', { exact: true }).waitFor({ state: 'visible' });
  const refreshedFirstApplication = page.getByText('Candidate A One', { exact: true }).locator('xpath=ancestor::li');
  await refreshedFirstApplication.getByText('Screening', { exact: true }).first().waitFor({ state: 'visible' });
  await refreshedFirstApplication.getByText('View candidate-visible milestones', { exact: true }).click();
  await refreshedFirstApplication.getByText('Screening', { exact: true }).last().waitFor({ state: 'visible' });
  const refreshedSecondApplication = page.getByText('Candidate A Two', { exact: true }).locator('xpath=ancestor::li');
  await refreshedSecondApplication.getByText('Rejected', { exact: true }).first().waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Recruitment stage update mobile refresh');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Refresh candidate applications' }).click();
  await page.getByText('Candidate A One', { exact: true }).waitFor({ state: 'visible' });
  await assertNoOverflow(page, 'Recruitment stage update desktop');
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
  console.log('Candidate assessment assignment and internal review note persisted after refresh; EN/BN, cancel, mobile, and desktop passed.');
  console.log('Local Auth-to-Postgres recruitment stage workflow passed at 375px and 1280px; mobile+desktop refresh recovery passed.');
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
}

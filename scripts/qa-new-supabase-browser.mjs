import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

// No credentials are used. This is the public sign-in view of the QA bundle.
const browser = await chromium.launch({ headless: true });
const errorLog = [];
try {
  for (const width of [375, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 840 } });
    const originalRequests = [];
    page.on('request', request => {
      if (request.url().includes('oslgwxaqfbteqtwqvdzs.supabase.co')) originalRequests.push(request.url());
    });
    page.on('pageerror', error => errorLog.push(String(error).slice(0, 200)));
    try {
      const response = await page.goto('http://127.0.0.1:4179/HRIS-v2/app.html', {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      assert.equal(response?.status(), 200, 'QA HTML must be served');
      await page.locator('#root').waitFor({ state: 'visible', timeout: 20_000 });
      await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 20_000 });
      await page.locator('input[type="password"]').waitFor({ state: 'visible', timeout: 20_000 });
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(documentWidth <= width + 2, 'Login screen overflows ' + width + 'px (document: ' + documentWidth + ')');
      assert.equal(originalRequests.length, 0, 'QA bundle must never call original Supabase');
      assert.equal(errorLog.length, 0, 'Client error: ' + errorLog.join('; '));
      mkdirSync('ui-evidence', { recursive: true });
      await page.screenshot({ path: 'ui-evidence/new-supabase-admin-login-' + width + '.png', fullPage: true });
      console.log('HRIS_ADMIN_NEW_DB_BROWSER_LOGIN_PASS width=' + width);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

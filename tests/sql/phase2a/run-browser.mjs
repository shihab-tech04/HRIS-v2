import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

export async function runPhase2aBrowserAcceptance({ root, apiUrl, anonKey, password, superAdmin, moduleClient, moduleTenantId, moduleTenantName, ordinary, firstAdmin, secondAdmin, admin, check }) {
  const port = '48383';
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', port, '--strictPort'], {
    cwd: root,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: apiUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: anonKey,
      VITE_ENABLE_PLATFORM_TENANTS: 'true',
    },
    stdio: 'ignore',
  });
  let browser;
  const pageErrors = [];
  const created = [];
  const stamp = `${Date.now()}`;
  async function waitForServer() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (server.exitCode !== null) throw new Error(`Local Vite server exited with ${server.exitCode}.`);
      try {
        const response = await fetch(origin);
        if (response.ok) {
          const html = await response.text();
          assert.match(html, /Synesis HRIS 360°/);
          return;
        }
      } catch { /* Vite is still starting */ }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for local HRIS UI at ${origin}.`);
  }
  async function signIn(page, email, expectPlatformPage = true) {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Email', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    if (expectPlatformPage) {
      await page.getByRole('heading', { name: 'Platform tenants', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
    } else {
      await page.getByRole('heading', { name: 'No authorized HRIS organization', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
    }
  }
  async function assertNoHorizontalOverflow(page, label) {
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(dimensions.document <= dimensions.viewport, `${label} overflowed ${dimensions.viewport}px to ${dimensions.document}px.`);
  }
  async function cardFor(page, name) {
    const heading = page.getByRole('heading', { name, exact: true });
    await heading.waitFor({ state: 'visible', timeout: 15000 });
    return page.locator('article').filter({ has: heading }).first();
  }

  async function moduleRow(card, label) {
    return card.locator('div.rounded-md.border').filter({ hasText: label }).first();
  }
  async function assertModuleState(moduleKey, expected) {
    const result = await moduleClient.rpc('platform_hris_list_tenant_modules', { p_tenant_id: moduleTenantId });
    assert.ifError(result.error);
    const row = result.data.find(item => item.module_key === moduleKey);
    assert.ok(row, 'Missing module state for ' + moduleKey);
    assert.equal(row.enabled, expected, 'Unexpected persisted state for ' + moduleKey);
  }
  async function confirmModuleToggle(page, card, moduleKey, label, enabled, cancel = false) {
    const row = await moduleRow(card, label);
    await row.getByRole('button', { name: enabled ? 'Enable' : 'Disable', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.waitFor({ state: 'visible' });
    if (cancel) {
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await assertModuleState(moduleKey, !enabled);
      await check('Optional module confirmation can be cancelled without changing ' + label);
      return;
    }
    await dialog.getByRole('button', { name: 'Confirm change', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await row.getByText(enabled ? 'Enabled' : 'Disabled · historical records preserved', { exact: true })
      .waitFor({ state: 'visible', timeout: 15000 });
    await assertModuleState(moduleKey, enabled);
    await check('Optional module confirmation persists the ' + label + ' setting');
  }
  async function openAdministratorControls(card) {
    const details = card.locator('details').filter({ hasText: 'Manage tenant administrator' });
    if (!(await details.evaluate(element => element.open))) await details.locator('summary').click();
    await details.getByLabel('Administrator email address').waitFor({ state: 'visible' });
  }
  async function createTenant(page, code, slug, name, adminEmail) {
    await page.getByRole('button', { name: 'Create tenant', exact: true }).click();
    await page.getByLabel('Tenant code').fill(code);
    await page.getByLabel('URL key').fill(slug);
    await page.getByLabel('Organization name').fill(name);
    await page.getByLabel('IANA time zone').fill('Asia/Dhaka');
    await page.getByLabel('Default language').selectOption('bn');
    await page.getByLabel('First administrator email').fill(adminEmail);
  }

  try {
    await waitForServer();
    browser = await chromium.launch({ headless: true });
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    desktop.on('pageerror', error => pageErrors.push(error.message));
    await desktop.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      return route.abort();
    });
    await signIn(desktop, superAdmin.email);
    await check('Desktop Super Admin reaches the protected platform tenant workspace');
    await desktop.getByRole('button', { name: 'Switch language to Bengali' }).click();
    await desktop.getByRole('heading', { name: 'প্ল্যাটফর্মের প্রতিষ্ঠানসমূহ', exact: true }).waitFor({ state: 'visible' });
    assert.equal(await desktop.getByRole('button', { name: 'প্রতিষ্ঠান তৈরি করুন', exact: true }).count(), 1);
    await desktop.getByRole('button', { name: 'Switch language to English' }).click();
    await desktop.getByRole('heading', { name: 'Platform tenants', exact: true }).waitFor({ state: 'visible' });
    await check('Desktop platform tenant journey switches between English and Bengali');

    const seededModuleCard = await cardFor(desktop, moduleTenantName);
    await seededModuleCard.getByRole('button', { name: 'Optional modules', exact: true }).click();
    for (const [moduleKey, label] of [['travel', 'Travel requests'], ['expenses', 'Expense claims'], ['learning', 'Learning']]) {
      const row = await moduleRow(seededModuleCard, label);
      await row.getByText('Disabled · historical records preserved', { exact: true }).waitFor({ state: 'visible' });
      await assertModuleState(moduleKey, false);
    }
    await confirmModuleToggle(desktop, seededModuleCard, 'travel', 'Travel requests', true, true);
    await confirmModuleToggle(desktop, seededModuleCard, 'travel', 'Travel requests', true);
    await confirmModuleToggle(desktop, seededModuleCard, 'expenses', 'Expense claims', true);
    await confirmModuleToggle(desktop, seededModuleCard, 'learning', 'Learning', true);
    await assertNoHorizontalOverflow(desktop, 'Desktop optional-module controls');
    await assertNoHorizontalOverflow(desktop, 'Desktop platform tenant workspace');
    await desktop.getByRole('button', { name: 'Create tenant', exact: true }).click();
    await desktop.getByLabel('Tenant code').fill(`P2A_CANCEL_${stamp.slice(-6)}`);
    await desktop.locator('form').filter({ has: desktop.getByLabel('Tenant code') })
      .getByRole('button', { name: 'Cancel', exact: true }).click();
    await desktop.getByLabel('Tenant code').waitFor({ state: 'hidden' });
    const cancelledTenant = await admin.from('tenants').select('id').eq('code', `P2A_CANCEL_${stamp.slice(-6)}`).maybeSingle();
    assert.ifError(cancelledTenant.error);
    assert.equal(cancelledTenant.data, null);
    await check('Cancel closes and clears the unsaved tenant form without creating a record');
    await desktop.getByRole('button', { name: 'Create tenant', exact: true }).click();
    const code = `P2A_UI_${stamp.slice(-8)}`;
    const slug = `p2a-ui-${stamp.slice(-10)}`;
    const name = `Phase2A UI Tenant ${stamp.slice(-6)}`;
    await desktop.getByLabel('Tenant code').fill(code);
    await desktop.getByLabel('URL key').fill(slug);
    await desktop.getByLabel('Organization name').fill(name);
    await desktop.getByLabel('IANA time zone').fill('Asia/Dhaka');
    await desktop.getByLabel('Default language').selectOption('bn');
    const firstAdminEmail = desktop.getByLabel('First administrator email');
    await firstAdminEmail.fill('not-an-email');
    assert.equal(await firstAdminEmail.evaluate(input => input.checkValidity()), false);
    await check('Invalid administrator email is rejected by the form before sending a write');
    await firstAdminEmail.fill(firstAdmin.email);
    await desktop.getByRole('button', { name: 'Create inactive tenant', exact: true }).click();
    await desktop.getByRole('status').filter({ hasText: 'Tenant created and left inactive' }).waitFor({ state: 'visible', timeout: 15000 });
    let tenantCard = await cardFor(desktop, name);
    await assertNoHorizontalOverflow(desktop, 'Desktop tenant creation');
    assert.equal(await tenantCard.getByTestId('tenant-active-admin-count').innerText(), '1');
    assert.equal(await tenantCard.getByText('Inactive', { exact: true }).count(), 1);
    const createdRow = await admin.from('tenants').select('id,code,slug,name,is_active,default_locale')
      .eq('code', code).single();
    assert.ifError(createdRow.error);
    assert.equal(createdRow.data.slug, slug);
    assert.equal(createdRow.data.name, name);
    assert.equal(createdRow.data.is_active, false);
    assert.equal(createdRow.data.default_locale, 'bn');
    created.push(createdRow.data.id);
    await check('Tenant creation persists its selected locale, first administrator, and inactive state');

    await tenantCard.getByRole('button', { name: 'Edit details' }).click();
    await tenantCard.getByLabel('Organization name').fill(`${name} Updated`);
    await tenantCard.getByLabel('IANA time zone').fill('Mars/Martian');
    await tenantCard.getByRole('button', { name: 'Save details' }).click();
    await desktop.getByRole('alert').filter({ hasText: 'Invalid tenant configuration' }).waitFor({ state: 'visible' });
    await check('Server validation error is shown and the metadata form remains recoverable');
    await tenantCard.getByLabel('IANA time zone').fill('Asia/Tokyo');
    await tenantCard.getByRole('button', { name: 'Save details' }).click();
    await desktop.getByRole('status').filter({ hasText: 'Tenant details saved.' }).waitFor({ state: 'visible', timeout: 15000 });
    tenantCard = await cardFor(desktop, `${name} Updated`);
    const metadataRead = await admin.from('tenants').select('name,timezone,default_locale,is_active')
      .eq('id', createdRow.data.id).single();
    assert.ifError(metadataRead.error);
    assert.equal(metadataRead.data.name, `${name} Updated`);
    assert.equal(metadataRead.data.timezone, 'Asia/Tokyo');
    assert.equal(metadataRead.data.default_locale, 'bn');
    assert.equal(metadataRead.data.is_active, false);
    await check('Metadata update survives refresh and database read-back without activating the tenant');

    await openAdministratorControls(tenantCard);
    await tenantCard.getByLabel('Administrator email address').fill(secondAdmin.email);
    await tenantCard.getByRole('button', { name: 'Assign administrator', exact: true }).click();
    await desktop.getByRole('status').filter({ hasText: 'Administrator assignment saved.' }).waitFor({ state: 'visible', timeout: 15000 });
    tenantCard = await cardFor(desktop, `${name} Updated`);
    assert.equal(await tenantCard.getByTestId('tenant-active-admin-count').innerText(), '2');
    const assigned = await admin.from('tenant_memberships').select('role,status')
      .eq('tenant_id', createdRow.data.id).eq('user_id', secondAdmin.id).single();
    assert.ifError(assigned.error);
    assert.deepEqual(assigned.data, { role: 'hr_admin', status: 'active' });
    await check('Administrator assignment is persisted and the displayed active count refreshes');

    await openAdministratorControls(tenantCard);
    await tenantCard.getByLabel('Administrator email address').fill(secondAdmin.email);
    await tenantCard.getByRole('button', { name: 'Revoke by email', exact: true }).click();
    const revokeDialog = desktop.getByRole('alertdialog', { name: 'Revoke tenant administrator?' });
    await revokeDialog.waitFor({ state: 'visible' });
    const revokeCancel = revokeDialog.getByRole('button', { name: 'Cancel', exact: true });
    const revokeConfirm = revokeDialog.getByRole('button', { name: 'Confirm revocation', exact: true });
    if (!(await revokeCancel.evaluate(element => element === document.activeElement))) throw new Error('Tenant administrator dialog did not move keyboard focus to Cancel.');
    await desktop.keyboard.press('Shift+Tab');
    if (!(await revokeConfirm.evaluate(element => element === document.activeElement))) throw new Error('Shift+Tab escaped the tenant administrator dialog.');
    await desktop.keyboard.press('Tab');
    if (!(await revokeCancel.evaluate(element => element === document.activeElement))) throw new Error('Tab escaped the tenant administrator dialog.');
    await desktop.keyboard.press('Escape');
    await revokeDialog.waitFor({ state: 'hidden' });
    const stillAssigned = await admin.from('tenant_memberships').select('status')
      .eq('tenant_id', createdRow.data.id).eq('user_id', secondAdmin.id).single();
    assert.ifError(stillAssigned.error);
    assert.equal(stillAssigned.data.status, 'active');
    await check('Cancel preserves the administrator assignment and closes the confirmation');
    await tenantCard.getByRole('button', { name: 'Revoke by email', exact: true }).click();
    await desktop.getByRole('alertdialog', { name: 'Revoke tenant administrator?' }).waitFor({ state: 'visible' });
    await desktop.getByRole('button', { name: 'Confirm revocation', exact: true }).click();
    await desktop.getByRole('status').filter({ hasText: 'Administrator access revoked.' }).waitFor({ state: 'visible', timeout: 15000 });
    tenantCard = await cardFor(desktop, `${name} Updated`);
    assert.equal(await tenantCard.getByTestId('tenant-active-admin-count').innerText(), '1');
    const revoked = await admin.from('tenant_memberships').select('role,status')
      .eq('tenant_id', createdRow.data.id).eq('user_id', secondAdmin.id).single();
    assert.ifError(revoked.error);
    assert.equal(revoked.data.status, 'inactive');
    await check('Confirmed administrator revocation is persisted and the refreshed count returns to one');

    await desktop.getByRole('button', { name: 'Sign out' }).click();
    await signIn(desktop, ordinary.email, false);
    assert.equal(await desktop.getByRole('button', { name: 'Platform tenants', exact: true }).count(), 0);
    assert.equal(await desktop.getByRole('heading', { name: 'Platform tenants', exact: true }).count(), 0);
    await check('Ordinary authenticated account has no platform tenant navigation or page');

    await desktop.getByRole('button', { name: 'Sign out' }).click();
    const disableSeedTenant = await admin.from('tenants').update({ is_active: false }).eq('slug', 'synesis-it').select('id').single();
    assert.ifError(disableSeedTenant.error);
    try {
      await signIn(desktop, superAdmin.email);
      await check('Super Admin can reach tenant provisioning when no tenant is active');
    } finally {
      const restoreSeedTenant = await admin.from('tenants').update({ is_active: true }).eq('id', disableSeedTenant.data.id);
      assert.ifError(restoreSeedTenant.error);
    }

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    mobile.on('pageerror', error => pageErrors.push(error.message));
    await mobile.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      return route.abort();
    });
    await signIn(mobile, superAdmin.email);
    await assertNoHorizontalOverflow(mobile, 'Mobile platform tenant workspace');
    await mobile.getByRole('button', { name: 'Open navigation menu' }).click();
    await mobile.getByRole('navigation', { name: 'HRIS modules' }).getByRole('button', { name: 'Platform tenants', exact: true }).click();
    await mobile.getByRole('heading', { name: 'Platform tenants', exact: true }).waitFor({ state: 'visible' });
    const mobileModuleCard = await cardFor(mobile, moduleTenantName);
    await mobileModuleCard.getByRole('button', { name: 'Optional modules', exact: true }).click();
    const mobileLearningRow = await moduleRow(mobileModuleCard, 'Learning');
    await mobileLearningRow.getByText('Enabled', { exact: true }).waitFor({ state: 'visible' });
    await confirmModuleToggle(mobile, mobileModuleCard, 'learning', 'Learning', false);
    await confirmModuleToggle(mobile, mobileModuleCard, 'learning', 'Learning', true);
    await assertNoHorizontalOverflow(mobile, 'Mobile optional-module controls');
    const mobileCode = `P2A_MB_${stamp.slice(-8)}`;
    const mobileSlug = `p2a-mobile-${stamp.slice(-10)}`;
    const mobileName = `Phase2A Mobile ${stamp.slice(-6)}`;
    await createTenant(mobile, mobileCode, mobileSlug, mobileName, firstAdmin.email);
    await assertNoHorizontalOverflow(mobile, 'Mobile tenant form');
    await mobile.getByRole('button', { name: 'Create inactive tenant', exact: true }).click();
    await mobile.getByRole('status').filter({ hasText: 'Tenant created and left inactive' }).waitFor({ state: 'visible', timeout: 15000 });
    const mobileRow = await admin.from('tenants').select('id,is_active').eq('code', mobileCode).single();
    assert.ifError(mobileRow.error);
    assert.equal(mobileRow.data.is_active, false);
    created.push(mobileRow.data.id);
    await assertNoHorizontalOverflow(mobile, 'Mobile tenant creation');
    await check('Mobile navigation and tenant creation complete without horizontal overflow');

    assert.deepEqual(pageErrors, [], `Browser runtime errors: ${pageErrors.join(' | ')}`);
    await check('Authenticated desktop and mobile journeys have no browser runtime errors');
    return created;
  } finally {
    await browser?.close().catch(() => {});
    server.kill('SIGTERM');
  }
}

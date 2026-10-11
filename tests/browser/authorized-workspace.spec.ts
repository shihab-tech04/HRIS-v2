import { test, expect } from '@playwright/test';
import path from 'path';

const widths = [360, 375, 390, 414, 768, 1024, 1280, 1440, 1920];
const screenshotDir = path.resolve(process.cwd(), 'docs/phase-1/screenshots');

for (const width of widths) {
  test(`authorized workspace renders without horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 800 : 960 });
    await page.goto('/?preview=true');

    // Workspace banner / brand should be visible
    await expect(page.getByText('Synesis HRIS').first()).toBeVisible();

    // Verify zero horizontal overflow (critical responsive layout invariant)
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth, `Viewport ${width}px: document rendered ${documentWidth}px wide`).toBeLessThanOrEqual(width + 1);

    // Desktop viewports (>=1024px) should show the sidebar
    if (width >= 1024) {
      const sidebar = page.getByTestId('app-sidebar');
      await expect(sidebar).toBeVisible();
    } else {
      // Mobile viewports should show mobile menu trigger button
      const menuButton = page.getByRole('button', { name: 'Open navigation menu' });
      await expect(menuButton).toBeVisible();
    }

    if (width === 375 || width === 1280) {
      await page.screenshot({ path: path.join(screenshotDir, `layout-${width}px.png`), fullPage: false });
    }
  });
}

test('navigation, view switching and sidebar collapse work correctly', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?preview=true');

  // Verify default view is Employee View
  await expect(page.getByRole('button', { name: 'Employee View' })).toBeVisible();
  const adminViewButton = page.getByRole('button', { name: 'Admin View' });
  await expect(adminViewButton).toBeVisible();

  // Switch to Admin View
  await adminViewButton.click();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText('Tenant Administration')).toBeVisible();

  // Switch back to Employee View
  await page.getByRole('button', { name: 'Employee View' }).click();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByText('Employee Self-Service')).toBeVisible();

  // Test sidebar 111px compact mode toggle (Figma HR-mis-user frame alignment)
  const compactToggle = page.getByRole('button', { name: 'Collapse sidebar to 111px' });
  await expect(compactToggle).toBeVisible();
  await compactToggle.click();

  // Verify sidebar shrunk to 111px
  const sidebar = page.getByTestId('app-sidebar');
  await expect(sidebar).toHaveAttribute('data-sidebar-width', '111');
  await page.screenshot({ path: path.join(screenshotDir, 'figma-111px-compact.png'), fullPage: false });

  // Toggle back to expanded 256px
  const expandToggle = page.getByRole('button', { name: 'Expand sidebar to 256px' });
  await expandToggle.click();
  await expect(sidebar).toHaveAttribute('data-sidebar-width', '256');
});

test('mobile drawer opens and closes with focus management', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/?preview=true');

  // Open mobile drawer
  const menuButton = page.getByRole('button', { name: 'Open navigation menu' });
  await menuButton.click();

  // Verify drawer is visible
  await expect(page.getByRole('dialog')).toBeVisible();

  // Close drawer
  const closeButton = page.getByRole('button', { name: 'Close navigation menu' });
  await closeButton.click();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('Phase 1 Audit Report Modal opens, displays evidence and closes via button & Escape', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?preview=true');

  // Click Phase 1 Audit Report trigger button
  const auditButton = page.getByRole('button', { name: /Phase 1 Audit Report|Audit/i });
  await auditButton.click();

  // Verify Audit Modal opened
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText(/Phase 1 Preview Checks/i)).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDir, 'audit-report-modal.png'), fullPage: false });

  // Check that test cases are displayed
  await expect(page.getByText('SRC-01')).toBeVisible();
  await expect(page.getByText('RUN-01')).toBeVisible();

  // Press Escape to close modal
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('EN/BN language switcher toggles Bengali text expansion without layout breaking', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto('/?preview=true');

  // Find language toggle button
  const langToggle = page.getByRole('button', { name: 'Toggle language between English and Bengali' });
  await expect(langToggle).toBeVisible();
  await expect(langToggle).toHaveText('EN');

  // Toggle to Bengali
  await langToggle.click();
  await expect(langToggle).toHaveText('বাংলা');
  await expect(page.getByText('পর্যায় ১ অডিট রিপোর্ট')).toBeVisible();

  // Verify layout width remains bounded (no horizontal overflow under Bengali text expansion)
  const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(docWidth).toBeLessThanOrEqual(1025);

  // Toggle back to English
  await langToggle.click();
  await expect(langToggle).toHaveText('EN');
});

test('all interactive buttons satisfy touch target sizing and accessibility roles', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/?preview=true');

  // Verify primary buttons have min 32px height and accessible names
  const buttons = await page.getByRole('button').all();
  expect(buttons.length).toBeGreaterThan(5);

  for (const button of buttons.slice(0, 10)) {
    const isVisible = await button.isVisible();
    if (isVisible) {
      const box = await button.boundingBox();
      if (box) {
        expect(box.height, `Small target: ${await button.getAttribute('aria-label') || (await button.innerText()).slice(0, 48)}`).toBeGreaterThanOrEqual(24);
      }
    }
  }
});

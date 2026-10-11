# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: authorized-workspace.spec.ts >> authorized workspace renders without horizontal overflow at 375px
- Location: tests/browser/authorized-workspace.spec.ts:8:3

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 376
Received:    633
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e5]: Design Preview & E2E Testing Mode — Browser Layout & Accessibility Sandbox
    - link "Live Sign-in" [ref=e6] [cursor=pointer]:
      - /url: /
  - generic [ref=e7]:
    - banner [ref=e8]:
      - generic [ref=e9]:
        - button "Open navigation menu" [ref=e10]
        - link "S Synesis HRIS" [ref=e16] [cursor=pointer]:
          - /url: /
          - generic [ref=e17]: S
          - generic [ref=e18]: Synesis HRIS
      - generic [ref=e19]:
        - generic [ref=e20]:
          - button "Employee View" [ref=e21] [cursor=pointer]
          - button "Admin View" [ref=e22] [cursor=pointer]
        - button "ER" [ref=e25] [cursor=pointer]
        - button "Toggle language between English and Bengali" [ref=e29] [cursor=pointer]: EN
        - button "Audit" [ref=e30] [cursor=pointer]
    - main [ref=e38]:
      - generic [ref=e39]:
        - generic [ref=e41]:
          - generic [ref=e42]:
            - generic [ref=e43]: ER
            - generic [ref=e44]:
              - generic [ref=e45]:
                - heading "Elena Rostova" [level=1] [ref=e46]
                - generic [ref=e47]: ·
                - generic [ref=e48]: EMP-0104
                - generic [ref=e49]: ACTIVE
              - paragraph [ref=e52]: Staff Software Architect/Engineering & Cloud Systems
              - generic [ref=e53]:
                - generic [ref=e54]: New York, NY (HQ Hybrid)
                - generic [ref=e58]: ·
                - generic [ref=e59]:
                  - text: "Reports to:"
                  - strong [ref=e64]: Dr. Arthur Pendelton (VP Engineering)
          - generic [ref=e65]:
            - generic [ref=e70]:
              - generic [ref=e71]: Today's Attendance
              - text: Not Checked In
            - button "Web Check-In" [ref=e72] [cursor=pointer]
        - generic [ref=e74]:
          - generic [ref=e75]:
            - generic [ref=e76]:
              - generic [ref=e77]:
                - generic [ref=e78]:
                  - heading "My Matrix Project Allocations" [level=3] [ref=e79]
                  - paragraph [ref=e80]: "Demonstrating Dual Reporting: Distinct from your Departmental Manager"
                - button "View Timesheets" [ref=e82] [cursor=pointer]
              - generic [ref=e89]:
                - generic [ref=e90]:
                  - generic [ref=e91]:
                    - generic [ref=e92]:
                      - generic [ref=e93]: Titan Core NextGen Platform
                      - generic [ref=e94]: PRJ-TITAN
                      - generic [ref=e95]: active
                    - generic [ref=e98]:
                      - generic [ref=e99]:
                        - text: "Role:"
                        - strong [ref=e100]: Lead Architect
                      - generic [ref=e101]: ·
                      - generic [ref=e102]:
                        - text: "Project Lead:"
                        - strong [ref=e103]: Elena Rostova
                  - generic [ref=e104]:
                    - generic [ref=e105]: 60%
                    - generic [ref=e106]: FTE Share
                - generic [ref=e107]:
                  - generic [ref=e108]:
                    - generic [ref=e109]:
                      - generic [ref=e110]: Chronos Real-Time Telemetry
                      - generic [ref=e111]: PRJ-CHRONOS
                      - generic [ref=e112]: active
                    - generic [ref=e115]:
                      - generic [ref=e116]:
                        - text: "Role:"
                        - strong [ref=e117]: Distributed Systems Consultant
                      - generic [ref=e118]: ·
                      - generic [ref=e119]:
                        - text: "Project Lead:"
                        - strong [ref=e120]: David Chen
                  - generic [ref=e121]:
                    - generic [ref=e122]: 40%
                    - generic [ref=e123]: FTE Share
            - generic [ref=e128]:
              - strong [ref=e129]: "Employee-First Architecture:"
              - text: Your employment contract is anchored to the tenant organization (
              - strong [ref=e130]: Acme Global Dynamics
              - text: ). Releases from individual project allocations do not affect your active employment status.
          - generic [ref=e132]:
            - generic [ref=e133]:
              - generic [ref=e134]:
                - heading "Leave & Time Off Balances" [level=3] [ref=e135]
                - paragraph [ref=e136]: Governed by Acme Global Dynamics policies
              - button "Apply" [ref=e138] [cursor=pointer]
            - generic [ref=e141]:
              - generic [ref=e142]:
                - generic [ref=e143]:
                  - generic [ref=e144]: Paid Annual Vacation
                  - generic [ref=e145]: "Accrues monthly · Limit: 5d"
                - generic [ref=e146]:
                  - text: "20"
                  - generic [ref=e147]: Days / Yr
              - generic [ref=e148]:
                - generic [ref=e149]:
                  - generic [ref=e150]: Medical & Wellness Leave
                  - generic [ref=e151]: "Accrues annual · Limit: 0d"
                - generic [ref=e152]:
                  - text: "12"
                  - generic [ref=e153]: Days / Yr
              - generic [ref=e154]:
                - generic [ref=e155]:
                  - generic [ref=e156]: Parental Bonding Leave
                  - generic [ref=e157]: "Accrues annual · Limit: 0d"
                - generic [ref=e158]:
                  - text: "60"
                  - generic [ref=e159]: Days / Yr
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import path from 'path';
  3   | 
  4   | const widths = [360, 375, 390, 414, 768, 1024, 1280, 1440, 1920];
  5   | const screenshotDir = path.resolve(process.cwd(), 'docs/phase-1/screenshots');
  6   | 
  7   | for (const width of widths) {
  8   |   test(`authorized workspace renders without horizontal overflow at ${width}px`, async ({ page }) => {
  9   |     await page.setViewportSize({ width, height: width < 768 ? 800 : 960 });
  10  |     await page.goto('/?preview=true');
  11  | 
  12  |     // Workspace banner / brand should be visible
  13  |     await expect(page.getByText('Synesis HRIS').first()).toBeVisible();
  14  | 
  15  |     // Verify zero horizontal overflow (critical responsive layout invariant)
  16  |     const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
> 17  |     expect(documentWidth).toBeLessThanOrEqual(width + 1);
      |                           ^ Error: expect(received).toBeLessThanOrEqual(expected)
  18  | 
  19  |     // Desktop viewports (>=1024px) should show the sidebar
  20  |     if (width >= 1024) {
  21  |       const sidebar = page.getByTestId('app-sidebar');
  22  |       await expect(sidebar).toBeVisible();
  23  |     } else {
  24  |       // Mobile viewports should show mobile menu trigger button
  25  |       const menuButton = page.getByRole('button', { name: 'Open navigation menu' });
  26  |       await expect(menuButton).toBeVisible();
  27  |     }
  28  | 
  29  |     if (width === 375 || width === 1280) {
  30  |       await page.screenshot({ path: path.join(screenshotDir, `layout-${width}px.png`), fullPage: false });
  31  |     }
  32  |   });
  33  | }
  34  | 
  35  | test('navigation, view switching and sidebar collapse work correctly', async ({ page }) => {
  36  |   await page.setViewportSize({ width: 1280, height: 900 });
  37  |   await page.goto('/?preview=true');
  38  | 
  39  |   // Verify default view is Employee View
  40  |   await expect(page.getByRole('button', { name: 'Employee View' })).toBeVisible();
  41  |   const adminViewButton = page.getByRole('button', { name: 'Admin View' });
  42  |   await expect(adminViewButton).toBeVisible();
  43  | 
  44  |   // Switch to Admin View
  45  |   await adminViewButton.click();
  46  |   await expect(page.getByText('Tenant Administration')).toBeVisible();
  47  | 
  48  |   // Switch back to Employee View
  49  |   await page.getByRole('button', { name: 'Employee View' }).click();
  50  |   await expect(page.getByText('Employee Self-Service')).toBeVisible();
  51  | 
  52  |   // Test sidebar 111px compact mode toggle (Figma HR-mis-user frame alignment)
  53  |   const compactToggle = page.getByRole('button', { name: 'Collapse sidebar to 111px' });
  54  |   await expect(compactToggle).toBeVisible();
  55  |   await compactToggle.click();
  56  | 
  57  |   // Verify sidebar shrunk to 111px
  58  |   const sidebar = page.getByTestId('app-sidebar');
  59  |   await expect(sidebar).toHaveAttribute('data-sidebar-width', '111');
  60  |   await page.screenshot({ path: path.join(screenshotDir, 'figma-111px-compact.png'), fullPage: false });
  61  | 
  62  |   // Toggle back to expanded 256px
  63  |   const expandToggle = page.getByRole('button', { name: 'Expand sidebar to 256px' });
  64  |   await expandToggle.click();
  65  |   await expect(sidebar).toHaveAttribute('data-sidebar-width', '256');
  66  | });
  67  | 
  68  | test('mobile drawer opens and closes with focus management', async ({ page }) => {
  69  |   await page.setViewportSize({ width: 375, height: 812 });
  70  |   await page.goto('/?preview=true');
  71  | 
  72  |   // Open mobile drawer
  73  |   const menuButton = page.getByRole('button', { name: 'Open navigation menu' });
  74  |   await menuButton.click();
  75  | 
  76  |   // Verify drawer is visible
  77  |   await expect(page.getByRole('dialog')).toBeVisible();
  78  | 
  79  |   // Close drawer
  80  |   const closeButton = page.getByRole('button', { name: 'Close navigation menu' });
  81  |   await closeButton.click();
  82  |   await expect(page.getByRole('dialog')).toBeHidden();
  83  | });
  84  | 
  85  | test('Phase 1 Audit Report Modal opens, displays evidence and closes via button & Escape', async ({ page }) => {
  86  |   await page.setViewportSize({ width: 1280, height: 900 });
  87  |   await page.goto('/?preview=true');
  88  | 
  89  |   // Click Phase 1 Audit Report trigger button
  90  |   const auditButton = page.getByRole('button', { name: /Phase 1 Audit Report|Audit/i });
  91  |   await auditButton.click();
  92  | 
  93  |   // Verify Audit Modal opened
  94  |   await expect(page.getByRole('dialog')).toBeVisible();
  95  |   await expect(page.getByText(/Phase 1 Preview Checks/i)).toBeVisible();
  96  |   await page.screenshot({ path: path.join(screenshotDir, 'audit-report-modal.png'), fullPage: false });
  97  | 
  98  |   // Check that test cases are displayed
  99  |   await expect(page.getByText('SRC-01')).toBeVisible();
  100 |   await expect(page.getByText('RUN-01')).toBeVisible();
  101 | 
  102 |   // Press Escape to close modal
  103 |   await page.keyboard.press('Escape');
  104 |   await expect(page.getByRole('dialog')).toBeHidden();
  105 | });
  106 | 
  107 | test('EN/BN language switcher toggles Bengali text expansion without layout breaking', async ({ page }) => {
  108 |   await page.setViewportSize({ width: 1024, height: 800 });
  109 |   await page.goto('/?preview=true');
  110 | 
  111 |   // Find language toggle button
  112 |   const langToggle = page.getByRole('button', { name: 'Toggle language between English and Bengali' });
  113 |   await expect(langToggle).toBeVisible();
  114 |   await expect(langToggle).toHaveText('EN');
  115 | 
  116 |   // Toggle to Bengali
  117 |   await langToggle.click();
```
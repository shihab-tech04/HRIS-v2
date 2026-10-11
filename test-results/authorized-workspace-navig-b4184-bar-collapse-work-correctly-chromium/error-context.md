# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: authorized-workspace.spec.ts >> navigation, view switching and sidebar collapse work correctly
- Location: tests/browser/authorized-workspace.spec.ts:35:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Tenant Administration')
Expected: visible
Error: strict mode violation: getByText('Tenant Administration') resolved to 3 elements:
    1) <span class="whitespace-nowrap text-slate-500">Tenant Administration</span> aka getByRole('navigation', { name: 'Breadcrumb' }).getByText('Tenant Administration')
    2) <span class="text-xs font-semibold text-white">Tenant Administration</span> aka getByTestId('app-sidebar').getByText('Tenant Administration')
    3) <span class="text-[10px] font-bold uppercase tracking-wider text-[#085587] bg-[#F0F7FB] px-2 py-0.5 rounded border border-[#BAE0F0]">Tenant Administration Console</span> aka getByText('Tenant Administration Console')

Call log:
  - Expect "toBeVisible" getByText('Tenant Administration') with timeout 5000ms
  - waiting for getByText('Tenant Administration')

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
      - generic [ref=e10]:
        - link "S Synesis HRIS" [ref=e11] [cursor=pointer]:
          - /url: /
          - generic [ref=e12]: S
          - generic [ref=e13]: Synesis HRIS
        - generic [aria-hidden] [ref=e14]: /
        - button "Acme Global Dynamics" [ref=e16] [cursor=pointer]
        - generic [ref=e24]: "Persistence: Dev Fixtures"
      - navigation "Breadcrumb" [ref=e26]:
        - button "Acme Global Dynamics" [ref=e27] [cursor=pointer]
        - generic [ref=e30]: Tenant Administration
        - generic [ref=e33]: Operations Console
      - generic [ref=e34]:
        - generic [ref=e35]:
          - button "Employee View" [ref=e36] [cursor=pointer]
          - button "Admin View" [active] [ref=e37] [cursor=pointer]
        - button "ER Elena Rostova" [ref=e40] [cursor=pointer]:
          - generic [ref=e41]: ER
          - generic [ref=e42]: Elena Rostova
        - button "Toggle language between English and Bengali" [ref=e45] [cursor=pointer]: EN
        - button "Phase 1 Audit Report" [ref=e46] [cursor=pointer]
    - generic [ref=e53]:
      - complementary [ref=e54]:
        - generic [ref=e55]:
          - generic [ref=e56]:
            - generic [ref=e57]:
              - generic [ref=e58]: Active Environment
              - text: Tenant Administration
            - generic [ref=e59]: ADMIN
          - navigation [ref=e60]:
            - generic [ref=e61]: Governance & Systems
            - button "Operations Console" [ref=e62] [cursor=pointer]
            - button "Org Structure & Roles" [ref=e70] [cursor=pointer]
            - button "Directory & Matrix Allocations" [ref=e74] [cursor=pointer]
            - button "Project Workspaces" [ref=e82] [cursor=pointer]
            - button "Tenant Configuration" [ref=e88] [cursor=pointer]
            - button "PostgreSQL Contracts & RLS 153 Modules" [ref=e94] [cursor=pointer]:
              - generic [ref=e95]: PostgreSQL Contracts & RLS
              - generic [ref=e101]: 153 Modules
            - button "Audit Trail & Compliance" [ref=e102] [cursor=pointer]
        - generic [ref=e109]:
          - generic [ref=e110]:
            - generic [ref=e111]: ER
            - generic [ref=e112]:
              - paragraph [ref=e113]: Elena Rostova
              - paragraph [ref=e114]: Staff Software Architect & Lead (Admin Authorized)
          - button "Collapse sidebar to 111px" [ref=e115] [cursor=pointer]:
            - generic [ref=e119]: Compact (111px)
      - main [ref=e120]:
        - generic [ref=e121]:
          - generic [ref=e123]:
            - generic [ref=e124]:
              - generic [ref=e125]:
                - generic [ref=e126]: Tenant Administration Console
                - generic [ref=e127]: ·
                - generic [ref=e128]: acme-global
              - heading "Acme Global Dynamics" [level=1] [ref=e129]
              - paragraph [ref=e130]:
                - text: "Acme Global Dynamics Corporation · Currency:"
                - strong [ref=e131]: USD
                - text: "· Timezone:"
                - strong [ref=e132]: America/New_York
            - generic [ref=e133]:
              - button "Phase 1 Audit Report (2/10 Verified)" [ref=e134] [cursor=pointer]
              - button "PostgreSQL Contracts" [ref=e141] [cursor=pointer]
          - generic [ref=e148]:
            - generic [ref=e149]:
              - generic [ref=e150]: Active Workforce
              - generic [ref=e157]:
                - generic [ref=e158]: "5"
                - generic [ref=e159]: staff members
              - generic [ref=e160]: 100% active contracts verified
            - generic [ref=e161]:
              - generic [ref=e162]: Matrix Projects
              - generic [ref=e169]:
                - generic [ref=e170]: "3"
                - generic [ref=e171]: client workspaces
              - generic [ref=e172]: 4.5 FTE committed
            - generic [ref=e173]:
              - generic [ref=e174]: Configurable Roles
              - generic [ref=e180]:
                - generic [ref=e181]: "4"
                - generic [ref=e182]: dynamic roles
              - generic [ref=e183]: Zero hardcoded roles
            - generic [ref=e184]:
              - generic [ref=e185]: PostgreSQL Contracts
              - generic [ref=e190]:
                - generic [ref=e191]: "153"
                - generic [ref=e192]: Modules Mapped
              - generic [ref=e193]: "Simulation (Live DB: Phase 2)"
          - generic [ref=e194]:
            - generic [ref=e196]:
              - generic [ref=e198]:
                - heading "Core Governance Modules" [level=3] [ref=e199]
                - paragraph [ref=e200]: Configurable engines ready for tenant operational controls
              - generic [ref=e202]:
                - button "Org Structure & Roles Define dynamic roles, custom permissions, and department hierarchies. 4 Roles · 4 Departments" [ref=e203] [cursor=pointer]:
                  - generic [ref=e204]: Org Structure & Roles
                  - paragraph [ref=e208]: Define dynamic roles, custom permissions, and department hierarchies.
                  - generic [ref=e209]: 4 Roles · 4 Departments
                - button "Directory & Matrix Allocations Manage dual reporting lines and test the project release safe-harbor invariant. 5 Employee Records" [ref=e210] [cursor=pointer]:
                  - generic [ref=e211]: Directory & Matrix Allocations
                  - paragraph [ref=e215]: Manage dual reporting lines and test the project release safe-harbor invariant.
                  - generic [ref=e216]: 5 Employee Records
                - button "SQL Contract & RLS Explorer Inspect PostgreSQL DDL, test RLS token simulations, and browse 153 modules. 153 Modules Mapped" [ref=e217] [cursor=pointer]:
                  - generic [ref=e218]: SQL Contract & RLS Explorer
                  - paragraph [ref=e222]: Inspect PostgreSQL DDL, test RLS token simulations, and browse 153 modules.
                  - generic [ref=e223]: 153 Modules Mapped
                - button "Tenant Policy Engine Configure work hours, probation limits, fiscal anchors, and branding. 5d / 8h standard" [ref=e224] [cursor=pointer]:
                  - generic [ref=e225]: Tenant Policy Engine
                  - paragraph [ref=e229]: Configure work hours, probation limits, fiscal anchors, and branding.
                  - generic [ref=e230]: 5d / 8h standard
            - generic [ref=e232]:
              - generic [ref=e233]:
                - generic [ref=e234]:
                  - heading "System Audit Stream" [level=3] [ref=e235]
                  - paragraph [ref=e236]: Real-time tamper-evident events
                - button "All Logs" [ref=e238] [cursor=pointer]
              - generic [ref=e241]:
                - generic [ref=e242]:
                  - generic [ref=e243]:
                    - generic [ref=e244]: VIEW_NAVIGATION_CHANGE
                    - generic [ref=e245]: 04:53 PM
                  - paragraph [ref=e246]: User Elena Rostova switched view to ADMIN VIEW.
                  - paragraph [ref=e247]:
                    - text: By
                    - strong [ref=e248]: Elena Rostova
                - generic [ref=e249]:
                  - generic [ref=e250]:
                    - generic [ref=e251]: TENANT_POLICY_SYNC
                    - generic [ref=e252]: 07:15 AM
                  - paragraph [ref=e253]: Updated standard work week hours to 40h and verified fiscal year anchor month 1.
                  - paragraph [ref=e254]:
                    - text: By
                    - strong [ref=e255]: Elena Rostova
                - generic [ref=e256]:
                  - generic [ref=e257]:
                    - generic [ref=e258]: ROLE_PERMISSION_GRANT
                    - generic [ref=e259]: 04:40 PM
                  - paragraph [ref=e260]: Configured Project Lead role permissions with dynamic matrix timesheet approvals.
                  - paragraph [ref=e261]:
                    - text: By
                    - strong [ref=e262]: Sarah Jenkins
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
  17  |     expect(documentWidth).toBeLessThanOrEqual(width + 1);
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
> 46  |   await expect(page.getByText('Tenant Administration')).toBeVisible();
      |                                                         ^ Error: expect(locator).toBeVisible() failed
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
  118 |   await expect(langToggle).toHaveText('বাংলা');
  119 |   await expect(page.getByText('পর্যায় ১ অডিট রিপোর্ট')).toBeVisible();
  120 | 
  121 |   // Verify layout width remains bounded (no horizontal overflow under Bengali text expansion)
  122 |   const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  123 |   expect(docWidth).toBeLessThanOrEqual(1025);
  124 | 
  125 |   // Toggle back to English
  126 |   await langToggle.click();
  127 |   await expect(langToggle).toHaveText('EN');
  128 | });
  129 | 
  130 | test('all interactive buttons satisfy touch target sizing and accessibility roles', async ({ page }) => {
  131 |   await page.setViewportSize({ width: 1280, height: 900 });
  132 |   await page.goto('/?preview=true');
  133 | 
  134 |   // Verify primary buttons have min 32px height and accessible names
  135 |   const buttons = await page.getByRole('button').all();
  136 |   expect(buttons.length).toBeGreaterThan(5);
  137 | 
  138 |   for (const button of buttons.slice(0, 10)) {
  139 |     const isVisible = await button.isVisible();
  140 |     if (isVisible) {
  141 |       const box = await button.boundingBox();
  142 |       if (box) {
  143 |         expect(box.height).toBeGreaterThanOrEqual(24);
  144 |       }
  145 |     }
  146 |   }
```
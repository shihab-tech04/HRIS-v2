# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: authorized-workspace.spec.ts >> all interactive buttons satisfy touch target sizing and accessibility roles
- Location: tests/browser/authorized-workspace.spec.ts:130:1

# Error details

```
Error: expect(received).toBeGreaterThanOrEqual(expected)

Expected: >= 24
Received:    16
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
        - generic [ref=e30]: Employee Self-Service
        - generic [ref=e33]: Personal Overview
      - generic [ref=e34]:
        - generic [ref=e35]:
          - button "Employee View" [ref=e36] [cursor=pointer]
          - button "Admin View" [ref=e37] [cursor=pointer]
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
              - text: Employee Self-Service
            - generic [ref=e59]: EMPLOYEE
          - navigation [ref=e60]:
            - generic [ref=e61]: Personal Operations
            - button "My Personal Overview" [ref=e62] [cursor=pointer]
            - button "My Projects & Allocations 2 Active" [ref=e68] [cursor=pointer]:
              - generic [ref=e69]: My Projects & Allocations
              - generic [ref=e76]: 2 Active
            - button "My Time & Attendance" [ref=e77] [cursor=pointer]
            - button "My Team & Supervisees" [ref=e82] [cursor=pointer]
            - button "My Contracts & Vault" [ref=e90] [cursor=pointer]
        - generic [ref=e96]:
          - generic [ref=e97]:
            - generic [ref=e98]: ER
            - generic [ref=e99]:
              - paragraph [ref=e100]: Elena Rostova
              - paragraph [ref=e101]: Staff Software Architect & Lead (Admin Authorized)
          - button "Collapse sidebar to 111px" [ref=e102] [cursor=pointer]:
            - generic [ref=e106]: Compact (111px)
      - main [ref=e107]:
        - generic [ref=e108]:
          - generic [ref=e110]:
            - generic [ref=e111]:
              - generic [ref=e112]: ER
              - generic [ref=e113]:
                - generic [ref=e114]:
                  - heading "Elena Rostova" [level=1] [ref=e115]
                  - generic [ref=e116]: ·
                  - generic [ref=e117]: EMP-0104
                  - generic [ref=e118]: ACTIVE
                - paragraph [ref=e121]: Staff Software Architect/Engineering & Cloud Systems
                - generic [ref=e122]:
                  - generic [ref=e123]: New York, NY (HQ Hybrid)
                  - generic [ref=e127]: ·
                  - generic [ref=e128]:
                    - text: "Reports to:"
                    - strong [ref=e133]: Dr. Arthur Pendelton (VP Engineering)
            - generic [ref=e134]:
              - generic [ref=e139]:
                - generic [ref=e140]: Today's Attendance
                - text: Not Checked In
              - button "Web Check-In" [ref=e141] [cursor=pointer]
          - generic [ref=e143]:
            - generic [ref=e144]:
              - generic [ref=e145]:
                - generic [ref=e146]:
                  - generic [ref=e147]:
                    - heading "My Matrix Project Allocations" [level=3] [ref=e148]
                    - paragraph [ref=e149]: "Demonstrating Dual Reporting: Distinct from your Departmental Manager"
                  - button "View Timesheets" [ref=e151] [cursor=pointer]
                - generic [ref=e158]:
                  - generic [ref=e159]:
                    - generic [ref=e160]:
                      - generic [ref=e161]:
                        - generic [ref=e162]: Titan Core NextGen Platform
                        - generic [ref=e163]: PRJ-TITAN
                        - generic [ref=e164]: active
                      - generic [ref=e167]:
                        - generic [ref=e168]:
                          - text: "Role:"
                          - strong [ref=e169]: Lead Architect
                        - generic [ref=e170]: ·
                        - generic [ref=e171]:
                          - text: "Project Lead:"
                          - strong [ref=e172]: Elena Rostova
                    - generic [ref=e173]:
                      - generic [ref=e174]: 60%
                      - generic [ref=e175]: FTE Share
                  - generic [ref=e176]:
                    - generic [ref=e177]:
                      - generic [ref=e178]:
                        - generic [ref=e179]: Chronos Real-Time Telemetry
                        - generic [ref=e180]: PRJ-CHRONOS
                        - generic [ref=e181]: active
                      - generic [ref=e184]:
                        - generic [ref=e185]:
                          - text: "Role:"
                          - strong [ref=e186]: Distributed Systems Consultant
                        - generic [ref=e187]: ·
                        - generic [ref=e188]:
                          - text: "Project Lead:"
                          - strong [ref=e189]: David Chen
                    - generic [ref=e190]:
                      - generic [ref=e191]: 40%
                      - generic [ref=e192]: FTE Share
              - generic [ref=e197]:
                - strong [ref=e198]: "Employee-First Architecture:"
                - text: Your employment contract is anchored to the tenant organization (
                - strong [ref=e199]: Acme Global Dynamics
                - text: ). Releases from individual project allocations do not affect your active employment status.
            - generic [ref=e201]:
              - generic [ref=e202]:
                - generic [ref=e203]:
                  - heading "Leave & Time Off Balances" [level=3] [ref=e204]
                  - paragraph [ref=e205]: Governed by Acme Global Dynamics policies
                - button "Apply" [ref=e207] [cursor=pointer]
              - generic [ref=e210]:
                - generic [ref=e211]:
                  - generic [ref=e212]:
                    - generic [ref=e213]: Paid Annual Vacation
                    - generic [ref=e214]: "Accrues monthly · Limit: 5d"
                  - generic [ref=e215]:
                    - text: "20"
                    - generic [ref=e216]: Days / Yr
                - generic [ref=e217]:
                  - generic [ref=e218]:
                    - generic [ref=e219]: Medical & Wellness Leave
                    - generic [ref=e220]: "Accrues annual · Limit: 0d"
                  - generic [ref=e221]:
                    - text: "12"
                    - generic [ref=e222]: Days / Yr
                - generic [ref=e223]:
                  - generic [ref=e224]:
                    - generic [ref=e225]: Parental Bonding Leave
                    - generic [ref=e226]: "Accrues annual · Limit: 0d"
                  - generic [ref=e227]:
                    - text: "60"
                    - generic [ref=e228]: Days / Yr
```

# Test source

```ts
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
> 143 |         expect(box.height).toBeGreaterThanOrEqual(24);
      |                            ^ Error: expect(received).toBeGreaterThanOrEqual(expected)
  144 |       }
  145 |     }
  146 |   }
  147 | });
  148 | 
```
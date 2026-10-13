# Synesis HRIS 360° — Execution Checkpoint

**Recorded:** 2026-10-13 08:05 Asia/Dhaka
**State:** ACTIVE, INCOMPLETE, NOT FOR RELEASE
**Branch:** `codex/recovery-checkpoint-20261012`
**Feature checkpoint:** `ae41175db1adcbf917ce6043db404ce17cfd870a`

## Current implementation

**Phase 10 — Projects, Teams and Resource Allocation. Current module: Project Workspace permission correction.** Only an active Super Admin can create a project and appoint its Project Manager. Only the employee assigned as Project Manager for a project can add or release its project members. Ordinary organization Admin/Manager permissions allow read access but do not grant creation, appointment, or membership-management actions. Employee team membership and allocation to multiple projects remain supported; the existing shared 100% overlapping-allocation cap is retained.

The database capability response now drives per-project UI controls. The candidate migration checks active Super Admin identity in the creation RPC, assigned Project Manager identity in the membership RPCs, and the same identities in project RLS visibility. Direct table writes remain revoked. The project schema/migration is still candidate-only; no hosted schema, data, or permissions were changed.

**Phase 11 remains intact:** employee goal progress and the read-only organization Performance overview remain in the working branch and passed the full regression runs below. This checkpoint does not claim completion of either phase.

## Changes since the 07:30 Drive checkpoint

Feature commit `ae41175db1adcbf917ce6043db404ce17cfd870a` (`feat(hris): enforce project manager permissions`) contains 19 files, **+803/−91**, including the Phase 11 organization Performance page and preserved refreshed Figma/evidence images.

Changed application, database, and test paths:

```text
src/live/LiveApp.tsx
src/live/LiveHrisWorkspace.tsx
src/live/OrganizationProjects.tsx
src/live/OrganizationPerformance.tsx
supabase/migrations/20261013100000_hris_project_superadmin_and_project_manager_permissions.sql
tests/browser/project-workspace.spec.ts
tests/browser/manager-performance.spec.ts
tests/contracts/live-workspace.test.mjs
tests/contracts/performance-management.test.mjs
tests/sql/isolated-auth/fixture.sql
tests/sql/isolated-auth/run-local.mjs
```

Eight existing visual-evidence files were refreshed and included in the commit; none of the Phase 11 source or tests was reverted.

## Verification since the checkpoint

- `npm run check`: TypeScript PASS; **53/53 contract tests PASS, 0 FAIL**; Vite build PASS. Existing advisory: the minified JavaScript chunk is about 809.67 kB, above the 500 kB warning threshold.
- `npx playwright test --project=chromium`: **47/47 Chromium tests PASS, 0 FAIL**. Includes Super Admin creation/appointment, ordinary Admin/Manager UI denial, assigned Project Manager add/release, employee self-service, and existing Phase 11 regressions.
- `node tests/sql/isolated-auth/run-local.mjs`: **94/94 isolated Auth/RLS checks PASS, 0 FAIL**. Synthetic users, disposable local Supabase stack, and two tenants only.
- `git diff --check`: PASS before the feature commit.

The five previously failing tenant-security cases remain passing: reciprocal Tenant A/B attendance isolation; Tenant B denial for Tenant A dashboard/attendance/leave RPCs; Tenant B denial when approving Tenant A leave; and Tenant B denial when approving Tenant A attendance correction.

Project-specific acceptance evidence is recorded in `ACCEPTANCE_EVIDENCE_20261013_0805.md`. These are implementation acceptance checks, not canonical story IDs.

## Canonical story traceability

The user reports recovery of the authoritative catalogue containing 1,047 stories, 153 modules, source-linked text, and expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`.

The current Project `sources/` mount contains no files. Filename search across the Project sources, project mirror, and attached files found only `docs/programme/CANONICAL_USER_STORY_MATRIX.json`. That local tracking skeleton still has `stories: []` and SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`, so it is not the recovered catalogue. It remains untouched.

**Story-level status: 0/1,047 mapped and accepted; 1,047 pending the authoritative source bytes and story-specific evidence.** This is traceability, not a product-function count. No story IDs, requirements, or acceptance criteria were reconstructed. The Phase 10 behavior above has actual test evidence, but cannot be attributed to canonical story IDs until the expected source is visible and hash-verified.

## Release and preservation

No GitHub push, paid Supabase activation, production data or permission change, or deployment occurred. This is an interim checkpoint. Continue implementation and verification; finish the product, then create and integrity-check the complete Drive archive before the final GitHub push. Deploy only after that push.

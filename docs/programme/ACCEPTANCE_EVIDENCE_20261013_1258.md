# Acceptance evidence — Phase 11 narrative appraisal workflow — 2026-10-13 12:58 Asia/Dhaka

## Delivered employee/reviewer journey

Using the existing appraisal comment fields, status values, employee links, and reviewer assignment, employees can save a narrative self-review draft and submit it. The explicitly assigned, active same-tenant reviewer can read the submitted narrative, save manager notes as a draft, and submit feedback. After submission, the employee sees the returned notes. Drafts survive refresh; submission has a confirmation/cancel step; submitted stages are not editable through these RPCs.

The workflow is text-only. It does not read or write appraisal scores, ratings, final feedback, or weighting fields. It does not add anonymity or compensation rules. Final appraisal scoring/finalization remains open pending authoritative policy.

## Changes

- Added `supabase/migrations/20261013124000_hris_appraisal_narrative_workflow.sql`: tenant-bound read/write RPCs, role/assignment and active-membership checks, direct DML revocation, restricted RPC grants, and score-field exclusion.
- Updated `src/live/MyPerformance.tsx` with accessible self-review and assigned-reviewer forms, draft/cancel/confirm/submit states, save/retry messages, cycle context, and responsive layout.
- Extended `tests/sql/isolated-auth/run-local.mjs` and its fixture for actual Auth/RLS acceptance; added `tests/sql/isolated-auth/run-appraisal-browser.mjs` to test persisted local database data at mobile and desktop widths.
- Updated `tests/browser/performance.spec.ts` and `tests/contracts/performance-management.test.mjs` for the RPC-backed UI contract.

## Verification

- Isolated local Supabase Auth/RLS/Postgres: **119/119 PASS, 0 FAIL**, including employee ownership, assigned-reviewer eligibility, inactive membership, cross-tenant denial, anon denial, direct-DML denial, immutable submitted stages, score-field preservation, and real database persistence.
- Real browser: employee draft/save/refresh/submit at 375px; assigned reviewer draft/save/refresh/submit at 1280px; employee sees submitted feedback again at 375px. PASS.
- Full Chromium regression: **50/50 PASS**.
- TypeScript check, contract suite **63/63 PASS**, Vite build, runner syntax checks, and `git diff --check`: PASS.

All data/Auth fixtures were confined to the disposable local stack and removed by the runner. No production data, permissions, or Auth entries were touched. No paid service, GitHub push, or deployment was used.

## Traceability and remaining rules

The reported canonical catalogue contains 1,047 stories / 153 modules and expects SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`; its source bytes are not mounted in this task. **0/1,047 are accepted against source-linked story text**. This is not a product-function count, and no stories were reconstructed.

Phase 11 appraisal scoring, weighting, and finalization remain pending policy. The next functional phase should proceed only from an existing verified product/schema contract; no unsupported Learning or compensation policy is inferred.

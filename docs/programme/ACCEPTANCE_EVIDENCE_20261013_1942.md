# Acceptance Evidence — Recruiter Offer to Candidate Preboarding

Date: 2026-10-13 19:42 Asia/Dhaka

## Delivered workflow

- A recruiter with active tenant-scoped `recruitment.manage` access can issue an offer from the existing candidate pipeline. The form records the recruiter-entered amount, currency, pay period, proposed joining date, response deadline, and written terms.
- A tenant-scoped database RPC validates the live session and permission, locks the application row, rejects closed applications and duplicate open offers, writes the offer and application stage history, and advances the application to `offer_extended`.
- Authenticated direct writes to `job_offers` are revoked. Recruiter view-only access and another tenant's manager are denied by the backend; view-only UI does not expose the action.
- The candidate sees the employer-entered terms before signing. Candidate acceptance persists the signature and creates the linked preboarding handoff. Existing preboarding save, refresh, submit, and HR queue behavior remains connected.
- The pipeline retains visible success feedback after the stage refresh. Offer response tracking remains separate from completing operational work.

## Source changes

Main HRIS:

- `supabase/migrations/20261013132335_hris_recruitment_offer_issue.sql`
- `src/live/RecruitmentPipeline.tsx`
- `src/live/LiveHrisWorkspace.tsx`
- `tests/contracts/recruitment-pipeline.test.mjs`

Candidate portal:

- `src/types/index.ts`
- `src/lib/recruitmentAdapters.ts`
- `src/pages/OffersPage.tsx`
- `tests/candidate-application-local-e2e.mjs`

## Verification

- Main `npm run check`: TypeScript passed, **82 contract tests passed / 0 failed**, and Vite production build passed.
- Candidate `npm run lint`: passed.
- Candidate `npm run test:routes`: **15 passed / 0 failed**.
- Candidate Vite production build: passed.
- Dedicated local Auth/Postgres/browser workflow: **78 passed / 0 failed**, using local GoTrue, persisted PostgreSQL, and private local Storage; mobile recruiter and candidate journeys plus desktop candidate journey.
- The persisted journey covered candidate application submission, recruiter offer issuance through the UI, employer terms persistence and candidate display before response, digital acceptance, handoff creation, preboarding saves and refresh recovery, final submission, and tenant-scoped recruiter queue.
- Negative checks denied a view-only recruiter, a manager from another tenant, direct authenticated offer writes, a zero offer amount, and a duplicate open offer. Candidate ownership and existing cross-tenant, anonymous, private-document, and preboarding access controls also passed.
- This code was not run against production. No paid service was activated; no production permissions or data, GitHub push, or deployment were changed.

## Policy boundary and catalogue mapping

The amount and written terms are employer-entered and are not recalculated by the system. No compensation approval, tax treatment, or HR activation rule was added. HR verification and employee activation remain separate from candidate acceptance.

This evidence records the actual tested workflow scenarios. The canonical 1,047-story matrix was not present in the current project `sources/` mirror during this run, so no story IDs or requirement text were reconstructed or assigned. Row-to-story mapping remains pending access to that verified source.

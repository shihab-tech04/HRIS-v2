# Acceptance evidence — tenant-scoped Candidate interview journey

Date: 2026-10-13 22:52 Asia/Dhaka  
Branch: `codex/recovery-checkpoint-20261012`  
Main implementation commit: `3164a3dc6ce234f7b18daea7aad86289812f8481`  
Candidate implementation commit: `3f9ff7dfcac0256aab65017c42defb5baa57ee74`

## Delivered user journey

1. An authorized tenant recruitment manager opens an application in Main and schedules a future interview with a round, format, duration, meeting location/link, panel, and candidate instructions.
2. The SQL RPC validates active membership permission, tenant/application ownership, supported format, future organization-local time, duration and field bounds. Per-application transaction locking prevents duplicate active invitations. It records an `interview_scheduled` milestone and stores the tenant timezone.
3. The Candidate sees the invitation in the existing Interviews page with the round, panel, instructions, meeting details, and organization timezone. The candidate can accept, decline, or request rescheduling with both a reason and proposed availability.
4. The authenticated Candidate RPC binds the response to the active candidate profile and owned application. A submitted response cannot be overwritten. The tenant HR response queue shows the candidate response and proposed availability only to `recruitment.manage` users.
5. HR can schedule a replacement after a reschedule request. The old invitation remains as a cancelled row with its original response; the new invitation is independently accepted by the candidate.
6. The same local acceptance path continues through employer-entered offer acceptance, all four preboarding sections, refresh recovery, a locked submitted packet, and the tenant-scoped HR handoff queue.

## Exact source changes

Main repository:

- `supabase/migrations/20261013221500_hris_candidate_interview_journey.sql` — tenant-scoped scheduling, owner-scoped candidate responses, HR response queue, serial invitation guard, organization timezone, and direct client `interviews` table privilege revocation.
- `src/live/RecruitmentPipeline.tsx` — responsive scheduler, validation/error/success states, response queue, reschedule recovery, and organization-timezone display.
- `tests/contracts/candidate-interview-journey.test.mjs` — contracts for backend security and the cross-app route wiring.

Candidate repository:

- `src/lib/recruitmentAdapters.ts` — separate stored round and format, response mapping, proposed availability and timezone adaptation.
- `src/pages/InterviewsPage.tsx` — organization-timezone rendering and candidate reschedule availability display.
- `src/types/index.ts` — timezone and proposed-availability fields.
- `tests/candidate-application-local-e2e.mjs` — end-to-end interview flow plus cross-tenant/role/anonymous/direct-table/owner checks, followed by offer/preboarding regressions.

## Test results

- Candidate `npm run test:local-application-e2e` on the dedicated free local Supabase stack: **102 passed / 0 failed**. Real local Auth identities, persisted Postgres rows, private Storage upload, Main and Candidate browser journeys; 375px mobile and 1280px desktop.
- Security cases passed: viewer cannot schedule/read private responses; Tenant B cannot schedule for or read Tenant A; anonymous cannot schedule; candidate cannot schedule or answer another candidate's invite; direct `interviews` reads are denied; duplicate/incomplete responses and invalid schedules are rejected.
- Behavior checks passed: organization-local time persists as the same instant/timezone; entered panel order persists; reschedule requires reason and availability; repeated responses are denied; old slot remains cancelled with its submitted reschedule, replacement slot is accepted; candidate and HR see the expected state.
- Main `npm run check`: TypeScript pass, **91/91 contract tests pass**, Vite build pass (existing advisory large-chunk warning).
- Candidate `npm run lint`: pass; `npm run test:routes`: **17/17 pass**; Vite build pass (existing config-loader and large-chunk warnings).
- The prior **167/167** disposable Auth/RLS suite is preserved in `ACCEPTANCE_EVIDENCE_20261013_2149.md`; it was not rerun in this batch.
- Intermediate integration retries exposed clean-fixture and selector assumptions; the disposable DB was reset, the test locators were scoped, and the final clean full run passed 102/102. No production fixture or Auth entry was touched.

## Incomplete requirements and release boundary

- HR review currently displays the submitted packet read-only. Candidate-to-employee activation, identity deduplication, employee role/team mapping, and HR review decisions remain unimplemented pending verified authority and field-mapping rules. No employee account is created automatically.
- Candidate invitation visibility in the portal is verified; outgoing email/notification delivery is not part of this acceptance.
- Story IDs were not marked complete in this batch. The owner reports the canonical 1,047-story/153-module catalogue with SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`; no acceptance claim is inferred from story titles.
- The migration is local-only. No production SQL/data/permissions/Auth changes, paid activation, GitHub push, or deployment occurred.

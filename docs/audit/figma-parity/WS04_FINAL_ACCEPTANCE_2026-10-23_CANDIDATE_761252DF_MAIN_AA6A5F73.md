# WS04 — Final scoped release acceptance, 23 October 2026

**Formal exact-head verdict**

```text
CANDIDATE_PUBLIC_RELEASE=BLOCKED
MAIN_RELEASE=BLOCKED
```

This is incremental closure of [existing WS04 Phase C findings](https://github.com/shihab-tech04/HRIS-v2/blob/audit/hris-figma-parity-20261020/docs/audit/figma-parity/WS04_PHASE_C_RELEASE_ACCEPTANCE_2026-10-23.md), **not** a restart of the 1,047-story inventory. WS04 did not modify Main/Candidate application code, backend SQL, release branches, GitHub production merge or live deployment. The Candidate verdict applies specifically to a proposed **public Careers + published job listing/detail only** build, **not** private Candidate account features. A GitHub COMMENT/QA verdict is not a real independent APPROVED review.

## Exact release heads and current GitHub status

| Application | Current PR HEAD independently refreshed | PR and protection state |
| --- | --- | --- |
| Main [#66](https://github.com/shihab-tech04/HRIS-v2/pull/66) | `aa6a5f7399fc5ec1a319a2c922c86fe8ccd225d4` | OPEN, DRAFT, UNMERGED; branch `main` remains `cfd5fc5c71c4346ebcef2f86eead2b7c5196e2c7` |
| Candidate [#12](https://github.com/shihab-tech04/HRIS-Candidate-v2/pull/12) | `761252dfbd8cc6a94322bb9da39ddd76259b4d43` | OPEN, **not draft**, UNMERGED; branch `main` remains `38174c7b607999f951c7eea47aefaa443735080e` |
| QA Main [#45](https://github.com/shihab-tech04/HRIS-v2/pull/45) | QA-owned evidence branch; report committed here only | OPEN, DRAFT, UNMERGED |

Both `/rulesets?includes_parents=true` reads return **`[]`**; Main and Candidate PR reviews are **all COMMENTED by shihab-tech04**, with no authorized independent `APPROVED` review verified. Active classic branch protection could not be certified from accessible GitHub permissions. **No protected merge authorization.**

## Candidate public-only acceptance — positive exact-head proof

**PR #14 `fefc57c4`, #15 `56dcadea` and #16 `c033b380` all merged** and all three branch heads are ancestors of `761252dfbd8cc6a94322bb9da39ddd76259b4d43` (Git compare: release ahead 7/3/1, behind 0), not merely listed PR titles.

- **[Full Candidate local Auth/Postgres/E2E 39966483848](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39966483848)**: SUCCESS at exact `761252dfbd8cc6a94322bb9da39ddd76259b4d43` (job `120462873404`). Actual job log: `CANDIDATE_C1_AUTH_RLS_RESULT PASS=166 FAIL=0 direct_denials=84 tenant_contexts=2`, `CANDIDATE_C1_LOCAL_E2E PASS=19 FAIL=0`, `CANDIDATE_APPLICATION_LOCAL_E2E PASS=497 FAIL=0`, local candidate route/auth/localization regressions PASS. **This uses disposable GoTrue/Postgres synthetic identities, not the hosted target**.
- **[Public-only Chromium EN/BN responsive 39966484021](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39966484021)**: SUCCESS job `120457570996`. Independently inspected log showing fresh rendered English and Bengali screenshots at **375/768/1280/1920px**, no horizontal document overflow, keyboard tab/focus, search/filter, published card/detail mock, loading, empty, 503 service error/retry and unavailable deep-link. UI negative routes PASS for dashboard/registration/CV/applications/interviews/tasks/offers/preboarding/profile/saved/apply/about. This test **intercepts and mocks REST, Storage, Auth and Functions**; a 403 response supplied by the interception layer **is not an actual hosted denial**. Screenshot [artifact 12506469710](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39966484021/artifacts/12506469710), ZIP digest `sha256:fd649cd044c8d5cf5537387d949bc2bb05710f1133acc0f6592577c16f73ad05` (12 files; 8 viewport/locale + 4 loading/empty/error/unavailable states). WS04 downloaded, extracted and visually inspected the contact sheet; no observed mobile overflow. These are **current-SHA real Chromium screenshots of isolated public-only build**, not approved-Figma parity.
- **[Replacement-hosted configuration/build 39966484077](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39966484077)**: SUCCESS on `761252dfbd8cc6a94322bb9da39ddd76259b4d43`, exact build [artifact 12507675384](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39966484077/artifacts/12507675384) sha256 `54a2ed42237ac22155274e450bedd3f731a76cd28a0ab74da18c718f6a6d24f8`. Confirms replacement project URL, publishable-key config, configured tenant and demo isolation; **build check not live deployment**.
- **[Candidate portable full source-history 39966484109](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39966484109)**: SUCCESS at exact `761252dfbd8cc6a94322bb9da39ddd76259b4d43`, restored Git bundle and SHA checked in job log. [Artifact 12507375777](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39966484109/artifacts/12507375777), sha256 `9acd5e0f25485b6f41f0e35bd595b51e51362152a209f170ad91e33151bbd4ad`. This does not establish off-GitHub durable archive or database restoration for the **new** `761252df` SHA.

### Candidate source-path proof

| Concern | Exact current file and Git blob | Result |
| --- | --- | --- |
| Production routing | `src/App.tsx` blob `5f43fa87860e909c1b5cb18a321e545f5b03779a`: `PROD && VITE_CANDIDATE_PUBLIC_ONLY==='true'` renders only `<PublicOnlyAuthProvider><PublicOnlyCareers/></PublicOnlyAuthProvider>` | **PASS source** |
| Guest Auth | `src/context/AuthContext.tsx` blob `b560161aa3a649088780921f1d7ded5b7aa8050d`, static `user:null`, methods fail closed/no-op; no `AuthProvider` mount or profile fetch | **PASS source and route contract** |
| Public list/detail | `src/pages/PublicOnlyCareers.tsx` blob `fa34a7a0b84f33440100a8a70cfcf7ca25bc0d98`, only PublicJobsPage/VerifiedJobDetails; `src/pages/PublicJobsPage.tsx` blob `b793cdbbbf98b8c88c6a7995cce2a2ffff65a635`; `src/pages/VerifiedJobDetails.tsx` blob `57abe70a3a3eb2b238a544b926e5fe39bb9e354e`. Public apply/save invokes unavailable notice or disabled control. Exact job deep links and browser history under `?job=` | **PASS source and mocked browser** |
| Actual public data contract | `src/lib/api.ts`: `getPublishedJobs` uses only `candidate_published_jobs` with `status='published'`, `is_published=true`, `is_active=true`; empty actual data stays empty and demo fallback is `DEV && VITE_ENABLE_DEMO_MODE==='true'`; detail only searches verified result | **PASS static frontend** |
| Release build | `.github/workflows/release-preview.yml` blob `76b55c1cbcfe1db2aa96af0b0f7af1adce30d2c5` requires manual approved deployment from `main`; sets `VITE_CANDIDATE_PUBLIC_ONLY=true`, `VITE_ENABLE_DEMO_MODE=false`, `VITE_SUPABASE_URL=https://xfuxnljfrgvusbrpvxpa.supabase.co`; stages compiled asset inspection | **PASS contract, NOT DEPLOYED** |

### Independently read-only hosted public/privileged boundary

Replacement Supabase `xfuxnljfrgvusbrpvxpa` remains **1 Auth user / 1 tenant / 0 memberships**, migration head `20261022142012`, zero stored documents. `public.candidate_published_jobs` is an anon-SELECT-granted `security_invoker=true, security_barrier=true` view fed exclusively by `public.candidate_public_jobs_source()`. That SQL SECURITY DEFINER function fixes tenant `slug='synesis-it'`, requires published/active/current-deadline jobs and masks salary values when `is_salary_published` false. These are **positive read-only structural proof** of the intended public projection, **not an actual anonymous PostgREST HTTP success**.

`public.candidate_profiles` has **anon SELECT=false**; `candidate_cvs`, `candidate_saved_jobs`, `candidate_job_alerts`, `candidate_notifications`, `job_applications` have RLS enabled and authenticated-user-scoped SELECT policies (no anon SELECT policy found for these). Anonymous INSERT/UPDATE/DELETE catalog grants on the enumerated private tables are denied. **No hosted browser/direct REST query impersonating or signing in as a Candidate was executed.** The existing hosted `storage.objects` `candidate_documents_own_select` has a **privileged authenticated recruiter-role OR not bound to the target object's tenant**; source fix has not been hosted-applied. This is a real private authorization **design gap**, even though it is not reachable through the anonymous UI journey and there are 0 stored objects.

### Candidate exact release scope and verdict

- **Proposed in-scope UI:** anonymous Careers page, filtered published vacancy search/list and verified published vacancy detail, EN/BN responsive and empty/loading/error/accessibility behavior.
- **GATED / NOT ACCEPTED:** registration/login, saved jobs, Apply, CV builder and documents, dashboard, application lifecycle, interviews/assessments, offers, preboarding, profile, alerts/notifications. Existing `?view=...` private routes are ignored by public shell in the isolated test. The private HTTP/API/RPC/Storage endpoints require separate hosted authorization certification and **must not** be represented as server-blocked solely because UI is hidden.
- **Exact canonical public-only story IDs:** **NOT FOUND** in authoritative approved scope; 47 CA10–CA16 markers relate to **local private/feature test evidence**, not an approved public-only production release ledger. Do not invent story IDs.
- **Approved Candidate visuals:** Current [Candidate Figma register](https://github.com/shihab-tech04/HRIS-Candidate-v2/blob/761252dfbd8cc6a94322bb9da39ddd76259b4d43/docs/quality/CANDIDATE_FIGMA_SCREEN_REGISTER_2026-10-21.md) explicitly says `NO_APPROVED_FRAME` for Careers, list and detail. Main approved Figma file cannot be silently substituted. No newly signed alternative Candidate public visual specification found.
- **Formal independent GitHub approval/protection:** missing, current Candidate PR #12 `COMMENTED` only and repo GitHub rulesets query `[]`. No protected PR release approval. No current `761252df` production served-version acceptance.

**`CANDIDATE_PUBLIC_RELEASE=BLOCKED`** **despite** green exact source and local isolated browser tests. This is not a request to rewrite passed Candidate code. **Smallest closure**:
1. **WS03 + product design authority:** provide explicit approved Candidate **public Careers/list/detail** Figma frame IDs or signed written current UI acceptance, including 375/768/1280/1920 EN/BN and the approved public-only story/route scope. WS04 compare the 12 exact-head screenshots; do not change solved UI on guess.
2. **WS02 + WS05:** run **real hosted read-only anonymous PostgREST GET** `candidate_published_jobs` and direct **private profile/CV/application/RPC/storage negative HTTP** with only anon credentials (zero user data writes). Ensure server-side private route/function denial; if the proposed release permits only anon reads, explicitly separate the unaudited authenticated recruiter cross-tenant Storage exposure from a gated private scope and keep that private scope disabled. Before any hosted mutation require WS05 recovery gate.
3. **WS05:** verify deploy/rollback and appropriate backup before changing live assets, restore exact `761252df` off-GitHub source; ensure actual protected `main` branch requirements and review by genuinely separate authorized reviewer, not WS04's self-comment. Then request final WS04 scoped re-evaluation. No broad merge of obsolete Candidate branches.

## Main release: only open/affected previous findings

Main exact HEAD `aa6a5f7399fc5ec1a319a2c922c86fe8ccd225d4` unchanged. [Full integration CI 39922517150](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39922517150) previously independently verified **379/379 contracts, 69/69 Chromium, 392/392 disposable GoTrue/Auth/RLS/Storage, 26/26 SQL/API parity**. [Deterministic compiled Pages 39922517266](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39922517266) **PASS**, [WS04 exact Main screenshot evidence 39933041492](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39933041492) **PASS scoped browser/screenshot capture**, artifact `12491988689`. No Main source changes, so no repeat of these passing runs.

**Phase A WS05 handoff** [Main PR #66 comment 6361945186](https://github.com/shihab-tech04/HRIS-v2/pull/66#issuecomment-6361945186): `BACKUP_RESTORE=BLOCKED` — no encrypted actual replacement hosted Postgres/Auth/Storage backup/decrypt/isolated restore or proven database rollback. Git history source backups are not database snapshots.

**Phase B WS02 handoff** [WS02 #50 comment 6361967424](https://github.com/shihab-tech04/HRIS-v2/pull/50#issuecomment-6361967424): `HOSTED_SECURITY=BLOCKED`, despite read-only 15/15 expected preflight and only 5/14 desired postconditions currently installed. **9/14 hosted security conditions absent**, including new private Storage guard and employee address/family row guards/leave ACL; WS02 submitted reviewed source SQL and rollback plan but has not run hosted DDL. Most recent WS02 [refresh #50](https://github.com/shihab-tech04/HRIS-v2/pull/50#issuecomment-6368781035) confirms no hosted A/B signed URL/rPC acceptances.

### Existing exact-head release acceptance matrix

| Finding | Main status | Candidate public-only status | Owner(s) | Verified evidence / exact outstanding action |
|---|---|---|---|---|
| **V01** Attendance/Leave Figma | **BLOCKED** | OUT OF PUBLIC RELEASE SCOPE | WS01 / WS07 | Main Figma frames [17:28320](https://www.figma.com/design/XEXLe9J1oATlITS9I5u1P9?node-id=17-28320), 17:28321, 17:31769; [exact Main screenshot artifact 12491988689](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39933041492/artifacts/12491988689) shows viewport/locale data; no independent approved state-by-state pixel signoff or mapped canonical story IDs. |
| **V02** Manager/report/roles | **BLOCKED** | OUT OF SCOPE | WS08 | Manager 9:22640, 17:28694; current targeted responsive/browser suite PASS, still lacking final Dashboard Figma/role journey and approved chart units. |
| **V03** Employee Profile | **BLOCKED** visual acceptance | OUT OF SCOPE | WS06 | Figma 66:72042, first tab design 314×56 vs asserted rendered 313×56; 56px height/source PASS; no approved 1px tolerance disposition and full story mapping. |
| **V04** Candidate public/private | OUT OF MAIN SCOPE | **BLOCKED** release; isolated public UI browser PASS | WS03 / WS04 | [exact Candidate UI 39966484021](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39966484021), [screenshots 12506469710](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39966484021/artifacts/12506469710), no approved Careers/list/detail visual spec and direct hosted private negative HTTP. |
| **S01** Hosted two-tenant RLS/Auth | **BLOCKED** | **BLOCKED** hosted boundary proof (private scope gated) | WS02 / WS05 | Hosted 1 Auth user/1 tenant/0 memberships, no genuine A/B signed-in positive/negative tests; local suites are not hosted. |
| **S02** Privileged RPC/private Storage | **BLOCKED; hosted policy FAIL** | **BLOCKED private boundary proof** | WS02 / WS05 | Installed `candidate_documents_own_select` and other Storage policies permit caller-role OR without requested-object tenant. Restrictive resolver/policy absent. WS02 393/393 local and Main 392/392 local PASS, hosted migrations/negative signed URLs not executed. |
| **P01** Story release traceability | **BLOCKED** | **BLOCKED** approved public-only story IDs unavailable | WS04 + all owners | Main `docs/programme/CANONICAL_USER_STORY_MATRIX.json`: 1,047 expected / 0 canonical mapped / 0 accepted. Candidate 47 CA10–16 markers are local-only and NOT approved public release IDs. Recover specific accepted scope only, not entire inventory. |
| **P02** Deterministic compiled artifacts | **PASS source; deploy not executed** | **PASS public-only build; not deployed** | WS05 / WS03 | Main [39922517266](https://github.com/shihab-tech04/HRIS-v2/actions/runs/39922517266), Candidate [39966484077](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39966484077) exact successful builds; no live-version claim. |
| **B01** Backup/restore/branch controls | **BLOCKED** | **BLOCKED** formal release | WS05 | Main exact source off-GitHub archive verified historically; new Candidate `761252df` [Github bundle 12507375777](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/39966484109/artifacts/12507375777), but no verified new-SHA off-GitHub restore, encrypted hosted DB/Auth/Storage isolated restoration, approved rollback, enforceable `main` ruleset or actual independent GitHub `APPROVED` review. |

### Compact decision record

```json
{
  "timestamp_local": "2026-10-23",
  "main_release_sha": "aa6a5f7399fc5ec1a319a2c922c86fe8ccd225d4",
  "candidate_release_sha": "761252dfbd8cc6a94322bb9da39ddd76259b4d43",
  "CANDIDATE_PUBLIC_RELEASE": "BLOCKED",
  "MAIN_RELEASE": "BLOCKED",
  "candidate_public_ui_isolated_browser": "PASS",
  "candidate_local_c1_auth_rls": "PASS",
  "candidate_hosted_public_view_catalog": "PASS_STATIC",
  "candidate_hosted_actual_anonymous_http_denials": "NOT_VERIFIED",
  "candidate_approved_public_visual_scope": "MISSING",
  "main_full_ci": "PASS",
  "main_hosted_security": "BLOCKED",
  "main_database_restore": "BLOCKED",
  "independent_authorized_github_approval": false,
  "github_production_merges": false,
  "production_deployment": false
}
```

**WS04 independently records technical evidence and the two BLOCKED verdicts, not an APPROVED GitHub review or a deployment authorization.**

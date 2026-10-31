# WS09 read-only hosted Release 2 contract verification — 31 October 2026

## Method and scope

Independently read the *replacement* Supabase project `xfuxnljfrgvusbrpvxpa` through its authorized connection using **SELECT only** and `to_regprocedure` / `to_regclass` metadata. No user data was selected. The original Supabase project was not accessed or modified. This verifies **function/table existence and migration inventory only**; it does not certify authorization/RLS, effective signatures, payloads, or full user journeys.

At observation, protected Main = `7fd2389fb32fe967cec503c34c1c8ec6fc9138aa`; Candidate Main = `5c03fddd2511a49e92687c0fb0e9b4d57f7500a3`. Main public Pages known successful run #41087861491 on that SHA; Candidate public Pages known successful run #40446017236 on `d55df89e4f86af33ca6bb27fa944b98c1e567df5`.

## Direct hosted results

| Check | Direct hosted value | Meaning |
|---|---|---|
| Replacement Supabase project | `ACTIVE_HEALTHY`, PostgreSQL `17.11` | Provider status only |
| Installed migrations | `131` | Inventory count, not contracts |
| Latest hosted version | `20261027033218` | Version head |
| `public.employee_get_my_profile_v1(uuid)` | **ABSENT** | E02 new profile read path cannot work as coded in PR #141 |
| `public.employee_save_my_education_v1(uuid,jsonb)` | **ABSENT** | E02-10 new education write cannot persist via this RPC |
| `public.employee_save_my_family_member_v1(uuid,jsonb)` | **ABSENT** | E02-07 family editor cannot persist via this RPC |
| `public.employee_delete_my_profile_record_v1(uuid,text,uuid)` | **ABSENT** | Profile education/experience/family deletion cannot persist via this RPC |
| `public.employee_bank_details` | **ABSENT** | Profile bank section's new persisted table missing |
| `public.employee_get_my_employment_info_v1(uuid)` | **PRESENT** | Exists; actual tenant/field behavior not acceptance-tested by this read |
| `public.employee_get_my_profile_change_requests()` | **ABSENT** | New change-request list path must be reconciled to exact source signature |
| `public.admin_get_my_provisioning_context()` | **PRESENT** | Read-only provisioning context, not real account directory or invite |
| `public.has_tenant_permission(uuid,text)` | **PRESENT** | Existence does not establish role policy |
| `public.synesis_tenant_id()` | **PRESENT** | Existence does not establish correct multi-tenant selection |
| Migration `20261027040642` | **NOT INSTALLED** | Versioned Employee Profile contract migration remains source-only |
| Migration `20261030114500` | **NOT INSTALLED** | Certificate policy-guard migration remains source-only |

## Latest branch and CI evidence

- **Release 2 actual WS05 integration:** [PR #141](https://github.com/shihab-tech04/HRIS-v2/pull/141) head `cc9eda415f25a417238977b8bfd9a5e4105a5a87`, open **draft** and not merged. [Build/browser run #41113108018](https://github.com/shihab-tech04/HRIS-v2/actions/runs/41113108018) and [disposable Auth/Postgres run #41113107747](https://github.com/shihab-tech04/HRIS-v2/actions/runs/41113107747) both completed **SUCCESS** at that exact head. These are **not** hosted SQL or independent WS04 acceptance.
- [PR #139](https://github.com/shihab-tech04/HRIS-v2/pull/139) head `22b8a03fa051f13691c0575890e36656075efa04` provides a proposed **manual** migration release mechanism only; not merged or dispatched.
- **Admin Release 3:** [PR #145](https://github.com/shihab-tech04/HRIS-v2/pull/145) head `a91271a020c46c74c3e20fd81bc28ac95cf7c03a`, open draft. Read-only readiness adapter with mock/harness tests; no routed/operational real Auth provisioning, invite or user directory. Contract questions live at [issue #143](https://github.com/shihab-tech04/HRIS-v2/issues/143). Synthetic browser preview on Main does **not** count as SA02 real Auth completion.
- Historical [PR #129](https://github.com/shihab-tech04/HRIS-v2/pull/129) and QA-only [PR #138](https://github.com/shihab-tech04/HRIS-v2/pull/138) are source ancestors, not additional independently releasable versions.

## E02 exact-ID acceptance gaps from the current #141 source

- `E02-09`: Browser test at `tests/browser/employee-profile-figma.spec.ts:255-267` explicitly names E02-09 and exercises EN/BN, 375px, joining date, employment type, location, manager, grade and bank-secret nonexposure in **synthetic harness**. Additional source code displays designation and department at `src/live/EmployeeProfileFigma.tsx:640-642`. This is **isolated UI evidence**, not signed-in hosted completion or WS04 Figma approval.
- `E02-07`: `tests/browser/employee-profile-figma.spec.ts:215-254,358-400` validates family data and same-as-present address behavior with UI fixture. Hosted `employee_save_my_family_member_v1(uuid,jsonb)` absent.
- `E02-10` and `E02-11`: `tests/browser/employee-profile-figma.spec.ts:270-356` exercise confirmation, cancel, failure and retry for deletion fixture. Hosted delete RPC absent.
- `E02-13`: `tests/browser/employee-profile-figma.spec.ts:401-444` exercises own-tenant certificate downloads and denied foreign tenant path in a synthetic fixture. Actual private Storage policies not hosted-verifiable until migration and signed-in run.
- `E02-15`: Inspecting `src/live/EmployeeProfileFigma.tsx` and `src/live/EmployeeProfileEditModal.tsx` at PR #141 found **no profile-photo upload/replacement handler**. The only Storage `upload` in the modal is for **training/certification attachments**. This is a **source gap** for photo edit, requiring WS06-owned implementation/approval; do not count E02-15 as complete. It is not an independent production runtime reproduction.
- Digital signature appears as a **no-document available** placeholder at `EmployeeProfileFigma.tsx:492-496`; do not certify working signature display/upload solely because a label exists. Source requirement must determine exact approved behavior.

## Required release handling

1. **WS04:** sign exact #141 SHA against original E02 requirements and Main Figma, including photo/signature, structured addresses, EN/BN mobile, source field preservation, privacy, form validation, cancel/retry and previously accepted UI. Identify exact story-ID defects; no blanket pass.
2. **WS02:** verify profile SQL migration signatures, tenant boundaries, grants and restrictive certificate policies on disposable PG17; document exact read-only hosted comparison; no unmanaged direct hosted SQL writes.
3. **WS05:** obey protected approvals; refresh pre-release encrypted DB and independent source backup/restore proof; reconcile source vs hosted migration inventory before any version-pinned migration. Use the approved manual workflow only after review; then deploy exact Pages SHA and test real authenticated persistence.
4. **WS06:** resolve source-verified E02 photo/signature gaps within Employee scope, or document explicit approved scope exclusion rather than rewriting source story.
5. **WS08 / WS03:** continue separate release-safe work; do not assert real Admin Auth or private Candidate live from browser-only previews or public Pages run.

**Release verdict: NOT LIVE for Employee Profile Release 2; programme 1,047-story 100% not demonstrated.** Existing Main public Pages remains published at its prior accepted SHA. This evidence is non-destructive and cannot itself authorize production write/merge.


## Fresh WS09 follow-up — 31 October 2026, morning Bangladesh time

### Candidate CA02-04: source integrated, not LIVE
- Candidate main is now `8aa406de267be7a259ef393331dfa9370a6b8972`, including PR #32 (**CA02-04**: “As a candidate, I want to sort where useful.”).
- Exact PR head `30b6a262a02ea86b818c42a7ddf22ea6f8bf81d3` had [SUCCESS Candidate verification #41116055921](https://github.com/shihab-tech04/HRIS-Candidate-v2/actions/runs/41116055921), including four tests in `tests/candidate-public-job-sorting.node.test.mjs`, route/localization/privacy and TypeScript/build.
- Current Candidate Pages last confirmed on `d55df89e4f86af33ca6bb27fa944b98c1e567df5`. **CA02-04 ISOLATED PASS**, **not LIVE VERIFIED**. No approved Candidate-specific Figma file is assumed.

### WS02 Profile certificate cross-tenant SELECT: PR #147 fails CI, not ready to integrate
- WS02 draft [PR #147](https://github.com/shihab-tech04/HRIS-v2/pull/147) at exact head `a5f55ee2d6bd53205f7e207d61b2f871afb0c6d3` proposes a restrictive SELECT policy guarding `employee-documents/**/profile-certificates/**`; the security impact must still be independently accepted.
- [Build/contract #41164558989](https://github.com/shihab-tech04/HRIS-v2/actions/runs/41164558989) and [disposable Auth/Postgres #41164559089](https://github.com/shihab-tech04/HRIS-v2/actions/runs/41164559089) both **FAIL** at that head.
- Exact failing test: `tests/contracts/hosted-sql-parity-gate.test.mjs:46` expects `/rows\\.length !== 54/`, while new runner `tests/sql/hosted-parity/run-local.mjs:164-170` expects **55** entries after the restrictive SELECT addition. The build contract suite reports 444 pass / 1 fail. Previous PR head failed database parity 55/54; the new head synchronizes the runner but not the companion assertion. This is a **test parity mismatch**, not proof that the policy passes.
- WS09 posted precise failure on PR #147. WS02/WS04 must keep all-pass/uniqueness/tenant-negative checks strict, synchronize the 55-count contract, and rerun exact-head database Auth/Storage tests. WS05 alone controls selective integration; do not merge this draft directly or write hosted SQL from the audit lane.

### Canonical count
1,047 distinct IDs; 40 isolated PASS (39 historical + new CA02-04), 12 PARTIAL, 14 historical BLOCKED, 1 source MISSING (E02-15), and 980 NOT CLASSIFIED. Legacy 82-verified aggregate remains non-deduplicated; no new LIVE VERIFIED story certification.

# Acceptance Evidence — 2026-10-13 08:05 Asia/Dhaka

## Phase 10: Project permissions and membership

Feature commit: `ae41175db1adcbf917ce6043db404ce17cfd870a`.

Business rules verified:

- An active Super Admin creates projects and appoints an active tenant employee as Project Manager.
- Tenant organization Admin/Manager roles cannot create projects or appoint Project Managers even when they hold `organization.manage`.
- A linked employee assigned as Project Manager can add and release project members on the project they manage.
- Ordinary Admin/Manager roles cannot add or release members. Direct writes to project tables remain denied.
- Organization viewers retain tenant-bounded project read access. Super Admin and assigned Project Manager visibility is also covered through direct RLS reads.
- An employee can retain allocations in multiple projects; the shared allocation cap remains 100% over overlapping dates. The local fixture verifies two concurrent project memberships at 60% and 40%.
- Employee self-service still exposes the employee's own project allocations without management controls.

Verification:

- Isolated local Auth/RLS suite: **94/94 PASS, 0 FAIL**.
- Chromium browser suite: **47/47 PASS, 0 FAIL**.
- Static/TypeScript/build check: TypeScript PASS, **53/53 contracts PASS, 0 FAIL**, Vite build PASS.

No hosted migration, production fixture, data or permission change was made. The migration is a local release candidate. No deployment occurred.

## Phase 11 regression preservation

Employee goal self-progress and organization Performance read-only behavior remain present. The full Auth/RLS and browser suites pass with Phase 11 code included. Phase 11 remains partial; broader performance workflows are not claimed accepted.

## Five prior tenant-security regressions

All remain passing in the 94-check isolated suite:

1. Tenant B cannot read Tenant A attendance.
2. Tenant A cannot read Tenant B attendance.
3. Tenant B cannot call Tenant A dashboard, attendance, or leave RPCs.
4. Tenant B cannot approve Tenant A leave.
5. Tenant B cannot approve Tenant A attendance correction.

## Canonical user-story mapping

The current task's `sources/` mount is empty. The only same-name local file is the untouched `stories: []` tracking skeleton, SHA-256 `456f1855bc932d6562c1081ee87220b616f4960a780a32931a18a5d477b3a996`. The expected recovered catalogue SHA-256 is `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`; its bytes are not visible here for verification. **0/1,047 stories mapped and accepted; 1,047 pending exact-source mapping and story-level evidence.** The tests above are real implementation evidence, not invented story references.

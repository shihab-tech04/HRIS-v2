# Acceptance Evidence — Employee Web Clock-in/Out

**Date:** 2026-10-12 18:09 Asia/Dhaka  
**Feature commit:** `66d0a12b92f7dca38331848da82ab0d4da9acbf3`  
**Environment:** local Vite/Chromium with mocked app endpoints; isolated local Supabase CLI/Auth/PostgreSQL with synthetic users and tenants. Production was not used.

## Results

- **Contracts:** `npm run check` — **32/32 PASS**, 0 failed.
- **TypeScript:** PASS.
- **Vite build:** PASS. Known warning: generated JavaScript is 719.12 kB minified, above the 500 kB advisory threshold.
- **Chromium:** **38/38 PASS**. The employee dashboard journey begins without an attendance row, checks in, refreshes its own summary, checks out, verifies the terminal state and requested RPC payloads, then completes attendance correction and leave workflows at 375px and captures desktop/mobile evidence.
- **Local Auth/RLS:** **63/63 PASS**, 0 failed. Uses nine synthetic Auth accounts across two tenants. Coverage includes active membership role mapping, tenant-local employee identity and date, no cross-tenant access, global-role-only denial, invalid action, check-out-before-check-in, successful check-in/out, duplicate punch rejection without overwrite, one audit event per successful event, RPC grants, session revocation and previous leave/attendance/roster checks.

## Previously failing tenant-security checks

All five pass in the current 63/63 local suite:

1. Tenant B cannot read Tenant A attendance.
2. Tenant A cannot read Tenant B attendance.
3. Tenant B cannot request Tenant A dashboard, attendance or leave RPC data.
4. Tenant B cannot approve Tenant A leave.
5. Tenant B cannot approve Tenant A attendance.

## Scope and recovery

- The migration `supabase/migrations/20261012115907_hris_employee_web_attendance_event.sql` is a local release-candidate change only; it has not been applied to production.
- The checked-in feature revision is `66d0a12b92f7dca38331848da82ab0d4da9acbf3`. The code commit contains the migration, app wiring, local SQL/Auth coverage, Chromium coverage and updated employee dashboard captures.
- The canonical source is reported as 1,047 stories over 153 modules, expected SHA-256 `c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520`. The mounted Project `sources/` directory is empty and Drive exact-name search found no file. Story mapping remains **0/1,047 accepted; 1,047 pending source verification**. No IDs or criteria were inferred.
- No paid service, production fixture, production permission change, GitHub push or deployment was used.

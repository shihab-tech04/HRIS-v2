# Acceptance evidence — public foundation table security

## Confirmed exposure before the migration

The disposable local schema advisor reported nine public tables with RLS disabled. A read-only ACL query confirmed each table granted all privileges to both `anon` and `authenticated`. This verification used only the isolated local Supabase database.

## Corrected access model

- `tenant_memberships`: authenticated SELECT limited to the signed-in user's own live-session rows.
- `admin_users`: authenticated SELECT limited to the signed-in user's own live-session flags.
- `tenants`: authenticated SELECT limited to active tenants where the caller has an active membership, a linked employee record, or is an active Super Admin.
- `employee_shift_assignments`, `roles`, `permissions`, `role_permissions`, `user_roles`, `admin_audit_logs`: RLS enabled, with no direct client grant or policy.
- Direct mutations to membership, admin flags, and tenants are denied. Existing tenant-scoped RPCs continue to authorize server-side.

## Results

| Check | Result |
|---|---:|
| `npm run check` contracts | 113/113 PASS |
| TypeScript and Vite build | PASS |
| Full Chromium | 50/50 PASS |
| Disposable local Auth/RLS/browser suite | 206/206 PASS, 0 failed |
| Supabase local advisor | 0 security errors; 51 warnings |
| Findings on the nine hardened tables | 0 |
| `git diff --check` | PASS |

The local suite includes the existing cross-tenant, inactive membership, global-only, anonymous, and revoked-session checks. No production data or permissions were modified, and no hosted migration, purchase, push, or deployment was made.

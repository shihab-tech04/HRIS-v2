# HRIS-v2 Phase 1 security/connection repair: verification

Source baseline: main 55f68261d108c2f1ad9b0a45deb5761b99c9b85d.
PR: https://github.com/shihab-tech04/HRIS-v2/pull/2

## Implemented
- Existing UI framework and mock screens preserved as explicitly non-persistent design previews.
- Live workspace accepts authenticated active memberships, linked active employees, and authorized legacy Synesis administrators.
- Legacy global admin grants are bounded to the existing Synesis tenant in the frontend and new read guards.
- Preview hidden by default in production.
- Audit module distinguishes static checks from real database/browser tests.
- GitHub CI executes TypeScript, source contract checks, production build, and Chromium sign-in smoke at 9 viewport widths (10 browser tests).

## Supabase
Project: hrmis-saas, oslgwxaqfbteqtwqvdzs.

Two migrations applied to live PostgreSQL:
1. hris_phase1_tenant_read_guard_20261011
2. hris_phase1_revoke_anon_helper_execute_20261011

Post-migration read-back confirmed:
- Seven additional SELECT policies (four RESTRICTIVE tenant guards and three PERMISSIVE own-read policies).
- Two SECURITY DEFINER helpers restricted to authenticated EXECUTE; anon cannot execute.
- Existing user data and original RLS policies were not modified.
- Preflight had one active Synesis tenant, zero active memberships, two active legacy admins.

## Remaining
- Existing-user sign-in and scoped read/write test with authorized browser session: not completed.
- Cross-tenant authenticated negative tests: not completed.
- All other SECURITY DEFINER RPC surfaces: not reviewed/certified.
- Actual server-delivered Pages output and publishing-source configuration: external verification needed.
- Pixel-accurate Figma comparison, full WCAG 2.2 AA, 1,047-story traceability, and business CRUD sync: open.

Decision: security and browser foundation improved; Phase 1 not fully certified.

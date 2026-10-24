# Candidate C1 privilege hardening — 2026-10-13 11:24 +06

- Added a local migration revoking all direct table privileges inherited by `PUBLIC`, `anon`, and `authenticated` on seven RPC-managed candidate tables.
- Disposable PostgreSQL 17 run: **152 privilege assertions passed, 0 failed** (12 anonymous `TRUNCATE` denials; 112 client-role privilege denials; 28 backend CRUD grants preserved).
- `npm run check`: TypeScript passed; **61 contract tests passed, 0 failed**; Vite production build passed.
- The GitHub PostgreSQL workflow now executes the new migration and regression checks.
- Production schema/data were not changed. No real Supabase Auth sessions or candidate browser journey were run; this is local privilege evidence, not C1 release acceptance.

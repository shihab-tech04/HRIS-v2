# Candidate C1 Auth API access boundary — 2026-10-13 11:32 +06

- Ran against a new disposable Supabase CLI stack (`synesis-candidate-c1-auth-20261013-1124`) on API/database ports `55721/55722`; the older local Auth runtime was not used.
- Created two synthetic GoTrue users, signed both in, then deleted those exact users; the isolated Auth database returned to zero users.
- Across seven sensitive tables, `anon`, candidate A, and candidate B each received PostgreSQL `42501` for direct `SELECT`, `INSERT`, `UPDATE`, and `DELETE`: **84 denials passed, 0 failed**.
- A `service_role` read of the synthetic row succeeded: **1 backend-access check passed**. Total: **85 checks passed, 0 failed**.
- No production writes or permission changes occurred.
- This synthetic stack did not load Candidate's actual RPC definitions; the result proves the direct-table access boundary only and does not certify Candidate tenant RLS or RPC behavior.

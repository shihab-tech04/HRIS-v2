# Offline integrated HRIS frontend review — October 22, 2026

This is a no-deploy, non-production visual inspection build from WS05 release source.
Use only `npm run build:frontend-review` in the isolated integration branch.
It compiles the original LiveHrisWorkspace UI, but substitutes an offline Supabase adapter.
All queries return empty fixtures, writes are denied, and no production Auth, tenant
or employee records are accessed. Manager/Employee views are for layout inspection only.
Regular production `npm run build` and its Auth/RLS integration remain unchanged.
GitHub Actions builds, tests and packages the standalone frontend; it does not publish Pages.
Do not merge this preview adapter as a live backend or call it authenticated HRIS certification.

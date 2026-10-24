# HRIS Admin — new Supabase isolated QA

**Environment:** `https://xfuxnljfrgvusbrpvxpa.supabase.co` only. This branch does not change the existing published GitHub Pages app, main, or the original Supabase project `oslgwxaqfbteqtwqvdzs`. It contains only the new project's **public** publishable key (not any secret/service-role key).

## Full HRIS user-interface QA (local)

```bash
git checkout qa/new-supabase-admin-20261022
npm ci
npm run dev -- --mode qa
```

Open `http://localhost:3000/` and sign in with the new designated Supreme Super Admin credentials (never enter credentials in a GitHub issue/chat). Vite automatically loads `.env.qa` **only** in explicit mode `qa`. Default `npm run dev` and `npm run build` retain existing, untouched production behavior.

Go to **System Workspace** and **Admin View**. In browser DevTools Network, verify that **both** `auth/v1` and `rest/v1` requests start with `https://xfuxnljfrgvusbrpvxpa.supabase.co`. Verify `get_my_admin_context` has `is_super_admin: true`, `is_admin: true`, and `platform_hris_list_tenants` includes Synesis IT. Test sign-out and protected-route closure. Do not use Design preview/sample as database acceptance. Empty employee/job records are expected while historical data is omitted.

## Independent online Auth/API verification

A separate Supabase-hosted read-only QA portal is deployed at:
https://xfuxnljfrgvusbrpvxpa.supabase.co/functions/v1/hris-admin-qa

It directly authenticates against the target and checks Supreme Super Admin status, tenant access, dashboard, departments and jobs. This is **not** the full HRIS UI and does not create any records.

## Scope and release boundary

This is branch-only evidence for WS01/WS02/WS04. No merging, GitHub Pages updates, production SQL migrations or release. WS05 remains sole protected controller. Preserve solved Figma Material shell, Poppins, #085587, EN/BN and Nadia projects.

The new Supabase currently has one protected Super Admin and one active tenant. Two-tenant isolated positive tests, actual authenticated Admin writes, rollback proof and independent acceptance still block production cutover. A successful QA login is not 1,047-story certification.

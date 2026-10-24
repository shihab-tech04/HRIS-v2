# Acceptance evidence — Phase 12 employee skill profile

## Functional journey

At mobile and desktop widths, the authenticated employee opens My Learning, creates a skill with optional self-reported proficiency, confirms it appears after server refresh, edits it, exercises an injected server failure with draft recovery, cancels and reopens the delete confirmation with Escape, removes the skill, and confirms it remains deleted after another refresh. Existing enrollment, cancellation, manager approval, program/session administration, roster retry, and learning recovery remain in the same local browser journey.

## Backend/security evidence

All cases ran against the isolated local Auth/Postgres stack with synthetic employees and two tenants:

- Own skill creation and editing persist and return through the tenant-scoped learning context.
- Normalized duplicate names are rejected.
- Cross-tenant identity and wrong-tenant requests are denied.
- Anonymous RPC access and direct table reads/writes are denied.
- Verified skill edit and deletion are denied, and the verified row remains unchanged.
- Own unverified skill deletion persists.

## Results

| Check | Result |
|---|---:|
| Focused skill-profile contracts | 9/9 PASS |
| `npm run check` contracts | 111/111 PASS |
| TypeScript | PASS |
| Vite build | PASS |
| Isolated local Auth/RLS/browser suite | 203/203 PASS, 0 failed |
| Full Chromium suite | 50/50 PASS |
| `git diff --check` | PASS |

## Limits

Proficiency wording remains free-form because no shared scale is defined. This does not implement organization verification authority or a career-planning workflow. Supabase's local advisor also reports 9 other public tables without RLS; they are not changed in this feature. No hosted migration, production data/permission change, paid service, GitHub push, or deployment was performed.

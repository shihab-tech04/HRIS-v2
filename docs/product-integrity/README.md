# Product integrity gate — UX/UI Agent v8

This is release-readiness enforcement, not a website feature. It does not modify visible UI, business data or SQL.

Run from the repository root:

```sh
node scripts/product-integrity-gate.mjs --mode=self-test
node scripts/product-integrity-gate.mjs --mode=audit
node scripts/product-integrity-gate.mjs --mode=pr
node scripts/product-integrity-gate.mjs --mode=release
```

- `audit` prints **DIAGNOSTIC_ONLY_NOT_ACCEPTANCE** and records unresolved blockers without making the developer branch unworkable.
- `pr` checks that modified `.tsx/.jsx/.css` source files are declared in `ui-change-manifest.json`, with traceable approved requirement/design references and required negative-space controls. It does not independently approve those references; a reviewer must.
- `release` exits non-zero if a known source invariant is broken or any required evidence is not verified. Failure prevents an attempted **new release** when wired into publish workflow. Existing live assets remain untouched.
- `self-test` proves that the checker rejects intentionally wrong links, unmapped stories, forbidden paths and an unapproved UI edit.

The checked-in contract deliberately records unresolved issues as `NOT_VERIFIED`, `BLOCKED` or `CONFLICT`. Do not replace these labels with `VERIFIED` without independent source/CI/browser/Figma and user-accepted proof. For original requirements, use canonical exact IDs, never estimated percentages. Full visual and Auth/RLS certification require additional browser/data checks. This is a safety net, **not a certificate of product completion**.

Repository owner must protect `main`, require this status check and separately review any contract, golden screenshot or business-rule modification. Without branch protection the gate can be bypassed by someone with sufficient permissions.
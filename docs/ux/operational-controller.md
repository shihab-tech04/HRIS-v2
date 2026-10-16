# UX/UI Design Intelligence Agent — Operational Integrity Controller v1

**Verified:** 16 October 2026 · Compatible with current canonical **v8.6** policy.

This package turns selected policy claims into **fail-closed, reproducible checks**. It does not auto-activate separate ChatGPT conversations or grant access to Figma, production apps, GitHub branch settings or independent human reviewers. It cannot honestly guarantee zero errors; it can make unverified changes *fail acceptance* rather than silently pass.

## Contents

- `ux-integrity-gate.mjs` — dependency-free Node 20+ verification controller; positive/negative self-tests.
- `manifest.template.json` — deliberately **unapproved** evidence schema; do not turn its placeholders into PASS.
- `UX_Agent_Operational_Activation_and_Release_Gates.md` — exact activation, governance and acceptance runbook.
- `verified-tests.txt` — actual self-test output and source code hash.
- `UX_Agent_30_Finding_Closure_Register.md` — what can/cannot be called closed.

## Running

```sh
node ux-integrity-gate.mjs --self-test
node ux-integrity-gate.mjs --manifest /path/to/reviewed-evidence.json --repo-root /path/to/repo --audit
node ux-integrity-gate.mjs --manifest /path/to/ci-produced-evidence.json --repo-root /path/to/repo --predeploy
node ux-integrity-gate.mjs --manifest /path/to/postdeploy-evidence.json --repo-root /path/to/repo --postdeploy
```

**Evidence location:** A release manifest that includes the source commit SHA MUST be generated or finalized **after** the source commit exists (for example in CI). Do not commit `candidateSHA` as an immutable self-referential string inside its own source commit; that cannot consistently match the resulting Git SHA.

Release mode verifies current commit and git diff against the source baseline, current source expectations, original authority, exact allowlisted file changes, mandatory negative-space assertions, approved goldens whose digest matches the base-branch bytes, actual visual comparison report bytes, independent reviewer attestation, task-level interaction evidence, source-linked test results, original requirements and open P0/P1 blockers. Postdeployment mode additionally checks externally supplied production-readback evidence bound to the candidate SHA.

**Trust boundary:** Reviewers and their approvals are strings checked for completeness and independence from the author; this tool does **not** authenticate reviewer identities or prove that visual review was actually conducted. CI should link to immutable review artifacts and require owner-approved GitHub review/required checks. A screenshot comparison PASS is not a substitute for semantic content review. This tool does not autonomously understand images.

`--audit` reports failures without modifying the application or deployments. `--predeploy` and `--postdeploy` return a nonzero exit on any mandatory error. Even an evidence-check PASS is **not** an automatic claim that a government product is finally accepted.

## Explicit negative test coverage

20 positive/negative scenarios exercise required/forbidden source patterns, stale candidate SHA, unauthorized paths, unapproved UI, forbidden new controls, defective screenshots passed as baselines, self-approved baselines, changed SHA256 content, missing approved comparison, wrong comparison digest, unverified interaction, unverified requirement, open blocker, test-source drift, deployment mismatch, unresolved authority conflict and checkout drift.

## Status

The package's own 20 deterministic tests PASS. Product-specific acceptance **has not passed** on Office Management, TaxPay, HRIS Main or HRIS Candidate. A standalone library package is not an installed production gate. Activation requires a compatible CI workflow, reviewed per-project manifest/source authority, approved visual goldens, full-browser/evidence generation, and owner-enforced protected branches.
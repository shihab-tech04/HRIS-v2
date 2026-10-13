# Execution checkpoint — 2026-10-13 12:22 +06

## Completed in this checkpoint

- Candidate C1 security now scopes `get_my_candidate_profile()` and `candidate_update_profile(jsonb)` through the authenticated user's active profile. The update function locks and updates exactly that profile, derives tenant scope from its row, rejects inactive profiles, and preserves existing grants.
- Candidate profile editor now has DTO/RPC adapters, a profile-loading gate, an accessible missing-profile retry state, and connected labels for editable fields. Opaque profile metadata is retained while protected identity and tenant fields stay out of the payload.
- Local Auth, PostgreSQL 17, Candidate browser, Main contract, TypeScript, and build checks passed as recorded in `ACCEPTANCE_EVIDENCE_20261013_1222.md`.

## Current state

- Main baseline before this change: `ea5060b0134f251afaaa4d23713d95983413805b` on `codex/recovery-checkpoint-20261012`; implementation and acceptance edits are being committed locally in this continuation.
- Candidate baseline before this change: `80619233cec5f03b6b07a96056c8b150a22f92fa` on `codex/recovery-checkpoint-20261012`; profile workflow and acceptance evidence are being committed locally in this continuation.
- Neither repository was pushed to GitHub or deployed. Paid services were not activated. Production was not used for test fixtures.
- The exact 1,047-story canonical matrix is not present under the current task mirror's `sources/` directory. No story-to-code coverage count is asserted in this checkpoint; existing source files were not modified.

## Next functional batch

Continue the remaining HRIS business workflows from the verified local state. Prioritize complete vertical journeys, retain server-side tenant authorization, and run focused acceptance on isolated data before making the next checkpoint. Final Drive preservation must precede any eventual GitHub push or deployment.

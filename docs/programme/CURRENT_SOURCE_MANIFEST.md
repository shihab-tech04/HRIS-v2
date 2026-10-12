# Current Source Manifest

**Recorded:** 2026-10-12. **State:** recovery changes are committed on local-only branches.

| Application | Repository | Local branch | Verified remote base | Local source root |
|---|---|---|---|---|
| Main HRIS | `shihab-tech04/HRIS-v2` | `codex/recovery-checkpoint-20261012` | `4ded5f13f1ef2bf17237f347bfac9811283c52dc` | `implementation/HRIS-v2` |
| Candidate Portal | `shihab-tech04/HRIS-Candidate-v2` | `codex/recovery-checkpoint-20261012` | `1c04786a72c3920c7ebb4a607ad5ac56d7b55f63` | `implementation/HRIS-Candidate-v2` |

The connected GitHub API confirmed these are the current `main` commits. Recovery changes are committed locally and both worktrees are clean. Do not publish these branches as a final release until the required acceptance programme passes.

## Checkpoint changes

- Main: permission-gated `LiveHrisWorkspace` using existing dashboard, attendance, report, employee-summary and leave-list RPCs; existing unsupported values and leave decisions remain unavailable. Employee summary is constrained to the observed active-admin/Synesis RPC contract. Approval SQL fixes are staged outside `supabase/migrations`.
- Candidate: submitted-search behavior, stale-request protection, saved-job request isolation, Internship filter and removal of unsupported monthly salary wording. `esbuild` range updated to resolve the Vite peer conflict.
- Main and Candidate code changes are detailed in the local recovery checkpoint at `release/2026-10-12/CHECKPOINT_STATUS.md`.

## Preservation and release boundary

- Synced `sources/` files remain untouched.
- No production SQL, production Auth setting, GitHub ref, PR, or deployment was changed.
- A Drive checkpoint marked `NOT FOR RELEASE` exists in the existing HRMIS Preservation folder. It is not the required final source backup and has not been certified as a restorable full-history backup.
- The final source manifest must be regenerated after all acceptance and before publication.

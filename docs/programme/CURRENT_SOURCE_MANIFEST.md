# Current Source Manifest

**Recorded:** 2026-10-12 17:25 Asia/Dhaka. **State:** latest Main implementation checkpoint is committed locally on its local-only branch. Candidate is unchanged.

| Application | Repository | Local branch | Verified remote base | Local source root |
|---|---|---|---|---|
| Main HRIS | `shihab-tech04/HRIS-v2` | `codex/recovery-checkpoint-20261012` | `4ded5f13f1ef2bf17237f347bfac9811283c52dc` | `implementation/HRIS-v2` |
| Candidate Portal | `shihab-tech04/HRIS-Candidate-v2` | `codex/recovery-checkpoint-20261012` | `1c04786a72c3920c7ebb4a607ad5ac56d7b55f63` | `implementation/HRIS-Candidate-v2` |

The connected GitHub API confirmed these are the current `main` commits. Recovery changes are committed locally and both worktrees are clean. Do not publish these branches as a final release until the required acceptance programme passes.

## Checkpoint changes

- Main: permission-gated `LiveHrisWorkspace` using tenant-scoped manager RPCs, employee dashboard/leave/correction workflows, manager correction decisions and the read-only tenant-scoped shift roster page. The membership and roster migrations are local release candidates. Approval replacements remain in `supabase/staging/approval-resolution/` and are not deployed.
- Candidate: submitted-search behavior, stale-request protection, saved-job request isolation, Internship filter and removal of unsupported monthly salary wording. `esbuild` range updated to resolve the Vite peer conflict.
- The existing recovery commit and current uncommitted Main changes are detailed in `docs/programme/LOCAL_CHECKPOINT.md`; Candidate remains at the verified remote base with its prior local recovery commit.

## Preservation and release boundary

- Synced `sources/` files remain untouched.
- No production SQL, production Auth setting, GitHub ref, PR, or deployment was changed.
- A Drive checkpoint marked `NOT FOR RELEASE` exists in the existing HRMIS Preservation folder. It is not the required final source backup and has not been certified as a restorable full-history backup.
- The final source manifest must be regenerated after all acceptance and before publication.

# Current Source Manifest

**Recorded:** 2026-10-14 07:09 Asia/Dhaka. **State:** Main and Candidate feature checkpoints are committed locally on their recovery branches. Neither branch is published.

| Application | Repository | Local branch | Local implementation commit | Verified remote base | Local source root |
|---|---|---|---|---|---|
| Main HRIS | `shihab-tech04/HRIS-v2` | `codex/recovery-checkpoint-20261012` | `74516ea07781deb1569f7ee957e573fdca0e6282` | `4ded5f13f1ef2bf17237f347bfac9811283c52dc` | `implementation/HRIS-v2` |
| Candidate Portal | `shihab-tech04/HRIS-Candidate-v2` | `codex/recovery-checkpoint-20261012` | `0262a5bc6c327064fcc048dddcbf515eaf10a8a2` | `1c04786a72c3920c7ebb4a607ad5ac56d7b55f63` | `implementation/HRIS-Candidate-v2` |

The GitHub connector last confirmed the remote `main` bases shown above. The listed feature commits remain local and unpushed. Do not publish these branches as a final release until the required acceptance programme passes.

## Checkpoint changes

- Main: existing tenant-scoped HRIS workflows remain; the latest feature migration records the candidate's initial application event transactionally.
- Candidate: `My Applications` now renders persisted, candidate-safe stage history. Candidate-authored notes can display; recruiter notes and actor IDs do not reach the candidate payload.
- Feature commits and acceptance evidence are recorded in `docs/programme/LOCAL_CHECKPOINT.md`, `EXECUTION_CHECKPOINT_20261014_0709.md`, and `ACCEPTANCE_EVIDENCE_20261014_0709.md`.

## Preservation and release boundary

- Synced `sources/` files remain untouched.
- No production SQL, production Auth setting, GitHub ref, PR, or deployment was changed.
- A Drive checkpoint marked `NOT FOR RELEASE` exists in the existing HRMIS Preservation folder. It is not the required final source backup and has not been certified as a restorable full-history backup.
- The final source manifest must be regenerated after all acceptance and before publication.

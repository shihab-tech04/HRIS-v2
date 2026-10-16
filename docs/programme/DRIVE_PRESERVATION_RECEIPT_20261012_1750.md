# Drive Preservation Receipt — 2026-10-12 17:50 Asia/Dhaka

## Destination and write verification

- Connected profile: **Shihab** (`shihabshajib01@gmail.com`).
- Destination: **HRMIS Preservation 2026-10-11**, folder ID `1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V`.
- An exact Drive owner-filter query (`'me' in owners` plus exact folder name) returned that folder under the connected account. The folder metadata reports `shared: false`.
- Upload of all four versioned records succeeded, each connector response returned the destination folder ID as its parent, and metadata readback confirmed the parent ID for each file.

## Uploaded versioned records

| File | Drive ID | Readback |
|---|---|---|
| `EXECUTION_CHECKPOINT_20261012_1750.md` | `18Mc3TEXTcY5XSA5LmQUvUTBhVzhbmo9u` | Exact text equals local file; parent verified. |
| `EXECUTION_CHECKPOINT_20261012_1750.json` | `1DlHnsK5NlqAOF9cWQlp1HG8Pdyt0aAfr` | Raw download metadata reports 1,752 bytes, matching local 1,752 bytes; parent verified. Text extraction returned empty content, so byte-for-byte hash readback was not established for this JSON file. |
| `EXECUTION_CHECKPOINT_20261012_1750_SHA256SUMS.txt` | `1Q6aQ6AOC-l-ZNyYGWGcr89fVsSfRaa3s` | Exact text equals local file; parent verified. |
| `ACCEPTANCE_EVIDENCE_20261012_1750.md` | `1U2wyERZCtOq_R7kAy4yi-HAaNunYPQBW` | Exact text equals local file; parent verified. |

Local SHA-256 values are recorded in `DRIVE_PRESERVATION_RECEIPT_20261012_1750_SHA256SUMS.txt`. Earlier Drive records were not replaced. This checkpoint is not the final source archive and does not authorize GitHub publication or deployment.

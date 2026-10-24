# Drive preservation receipt — 2026-10-14 08:22 Asia/Dhaka

## Destination

- Google Drive folder: `HRMIS Preservation 2026-10-11` (`1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V`). The connected account `shihabshajib01@gmail.com` was verified as owner in Drive metadata; uploads to this folder succeeded. No existing file was replaced.

## Versioned uploads and readback

| Record | Drive file ID | Readback |
|---|---|---|
| `Synesis_HRIS360_CHECKPOINT_20261014_0822.zip` | `1w9Kfttpk3H0YNO5nAXGDiROcIEhKOGCI` | Name, ZIP MIME, parent, and **22,958,104-byte** size match local artifact. |
| `EXECUTION_CHECKPOINT_20261014_0822.md` | `1UL0MihGYoQe38mZhJfnI8SvRIpoT_yaD` | Fetched text byte-for-byte matches local file. |
| `ACCEPTANCE_EVIDENCE_20261014_0822.md` | `1flQCA0plFH5v2ZTrRlHdoY32O3KLqjEF` | Fetched text byte-for-byte matches local file. |
| `MASTER_PHASE_LEDGER_20261014_0822.md` | `1UNYa3n48m3iRiuj75h6i_BHGpnik-5Rr` | Fetched text byte-for-byte matches local ledger. |

## Integrity

- Local archive: `/private/tmp/Synesis_HRIS360_CHECKPOINT_20261014_0822.zip`, **22,958,104 bytes**, SHA-256 `5128850a0f66d3422f0617b98b9def68af79a2b115dfe1989dcfbbd204c7dc01`.
- Local ZIP integrity check passed. Main and Candidate Git bundles both passed `git bundle verify` and include the checkpoint heads.
- Drive raw-file readback confirms the same name, parent and byte size. The connector does not expose a remote SHA-256, so the remote binary was not cryptographically rehashed; the checksum and archive extraction checks are local evidence.
- This is a recoverable implementation checkpoint, not a final release backup. No GitHub push or deployment occurred.

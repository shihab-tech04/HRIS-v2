# Drive preservation receipt — 2026-10-14 08:12 Asia/Dhaka

## Destination verification

- Connected Drive profile: Shihab (`shihabshajib01@gmail.com`).
- Folder: `HRMIS Preservation 2026-10-11` (`1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V`). Drive metadata identifies the connected profile as folder owner. An upload to the same folder succeeded; older files were not replaced.

## New versioned records

| Record | Drive file ID | Parent folder | Verification |
|---|---|---|---|
| `Synesis_HRIS360_CHECKPOINT_20261014_0812.zip` | `1v6RfgwmttM8GESOVd_BsWByijVlOasnJ` | `1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V` | Drive readback title, ZIP MIME, and 22,897,634-byte size match the uploaded local artifact. |
| `EXECUTION_CHECKPOINT_20261014_0812.md` | `1RtEdY8QRCSdt4i3jobJeh9h8_Y9iGz41` | same | Fetched Drive text exactly matches local file. |
| `ACCEPTANCE_EVIDENCE_20261014_0812.md` | `13XSSW7ddERVBkAKOLDtxrKcZbxcWyWSU` | same | Fetched Drive text exactly matches local file. |
| `MASTER_PHASE_LEDGER_20261014_0812.md` | `1wCcoOCrm_NM1naOM8XNtugWM5Hn2k3Cx` | same | Fetched Drive text exactly matches local ledger snapshot. |

## Integrity evidence and limits

- Local ZIP: `Synesis_HRIS360_CHECKPOINT_20261014_0812.zip`; size **22,897,634 bytes**; SHA-256 **`5961994a330e156dd7814b5f744232d64e6a672acfe50ec9a37138e84252830b`**.
- Local `unzip -t` passed. Main and Candidate Git bundles each passed `git bundle verify` and include the checkpoint commits.
- Drive raw-file readback returned the same archive name, parent folder and byte size. The Drive connector does not expose a remote SHA-256, so the remote binary was not cryptographically rehashed; remote integrity is verified to metadata/size, while cryptographic ZIP/bundle integrity is local.
- This is a recoverable implementation checkpoint, not the final release archive. No GitHub push or deployment occurred.

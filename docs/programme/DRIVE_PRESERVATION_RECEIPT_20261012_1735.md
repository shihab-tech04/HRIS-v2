# Drive Preservation Receipt — 2026-10-12 17:35 Asia/Dhaka

This receipt covers the versioned implementation checkpoint records only. It is not the final sanitized source archive or final release backup.

## Destination verification

- Connected profile: Shihab (`shihabshajib01@gmail.com`).
- Destination: `HRMIS Preservation 2026-10-11`, folder ID `1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V`.
- Owner check: Google Drive search constrained to `'me' in owners` and the exact folder name returned this folder ID. The folder is unshared and located under the connected account's Drive root.
- Upload check: each new upload succeeded and returned the expected destination parent ID. No existing file was replaced.

## Uploaded records and integrity

All listed records were uploaded as new versioned files. Readback matched the local text exactly; the JSON was compared as base64 bytes because the Drive connector exposes JSON downloads in encoded form. Local SHA-256 values:

| File | Drive file ID | SHA-256 | Readback |
|---|---|---|---|
| `EXECUTION_CHECKPOINT_20261012_1735.md` | `1shbAXXoy3gm7DUDeKxCAKxDT9N46G4wn` | `ca23dc3e1fd8ddce674e99540106c52f200737f1798a75addd63ef9c8c3fbc97` | Exact text match |
| `EXECUTION_CHECKPOINT_20261012_1735.json` | `16iZNqgwetIgl-k-IU8we9JvokDV9YNCQ` | `996f63a2df53e2fe3dda5f5cfbb13ca423c2eb50de1dcde5b00666e2f515c41f` | Exact base64/byte match |
| `EXECUTION_CHECKPOINT_20261012_1735_SHA256SUMS.txt` | `1vcmlymI1IxepLHKHQqTENcT1qfTUeeE_` | `d796d7ec795c4bf2acf36c64856aee5ea786c3dd99d491caeda034619e558502` | Exact text match |
| `ACCEPTANCE_EVIDENCE_20261012_1735.md` | `1I5d2MEIaPUlg86v_Zh-xXnCCqHuLgZHA` | `43047f7046598fff473b88fc12b3f91b0d53a06696458df2f8fcbf4b8e471827` | Exact text match |

`shasum -a 256 -c docs/programme/EXECUTION_CHECKPOINT_20261012_1735_SHA256SUMS.txt` passed locally before upload. The Drive checkpoint records were verified by direct readback. The full source archive remains pending product acceptance and will be separately integrity-checked before the final GitHub push.

## Release status

- Feature commit: `efeac20686516a8a9e880efabb1a10f10ea2e600`.
- Checkpoint documentation commit: `9572b41114303104cc970ac01e0ba4565f8b72ef`.
- No paid Supabase service, production migration, GitHub push, or deployment occurred.

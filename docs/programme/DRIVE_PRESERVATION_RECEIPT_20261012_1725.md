# Drive Preservation Receipt — 2026-10-12 17:25 Asia/Dhaka

## Destination verification

- Connected Drive account: `shihabshajib01@gmail.com`.
- Destination: **HRMIS Preservation 2026-10-11**, folder ID `1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V`.
- Folder metadata names the connected account as owner. Uploads returned this folder as their parent, and a direct folder listing confirmed all four new records. Existing files were not replaced.

## Uploaded records and readback

| Record | Drive file ID | SHA-256 read back and matched to local file |
|---|---|---|
| `EXECUTION_CHECKPOINT_20261012_1725.md` | `1aLEqZ0__jzEolAYs2GeyjyrvvvUD4qMt` | `b38f503beb337db461e9ebab9177098730c47b210138c2101c28107682e94515` |
| `EXECUTION_CHECKPOINT_20261012_1725.json` | `1Q_9BMrr4GOIgxGt2UyJRJz4jGYeMSapp` | `b2f999f6b7870c0a3bece934206f113000c91f79ac952a87bd472fa1fc75f43c` |
| `EXECUTION_CHECKPOINT_20261012_1725_SHA256SUMS.txt` | `10I24fInwiaw-gxsJxsTweyUyyW6hM7ue` | `c7b099ab95383e6fc192cd81c599e32a0264b7e4ee35a4c3787b6f586e4bf2d1` |
| `ACCEPTANCE_EVIDENCE_20261012_1725.md` | `1bzcWTXbuCGTUBEKpQUjlfkO6LM58K-5K` | `5ae1fbe748e36c4a56508f20072f7402305f6b487fab56b41aacd9a2d302c86e` |

The Drive readback matched the local Markdown and checksum text exactly; the JSON byte hash matched. This is an interim implementation checkpoint, not the final source archive or release backup. Complete and verify the product before the final full-source backup, GitHub push and deployment.

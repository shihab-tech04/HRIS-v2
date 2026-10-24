# Drive Preservation Receipt — 2026-10-12 23:53 Asia/Dhaka

Destination: `HRMIS Preservation 2026-10-11`
Folder ID: `1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V`
Connected Drive account: `shihabshajib01@gmail.com`

Five new versioned checkpoint documents were uploaded through the connected account. The connector returned the intended destination folder as each file's parent, and Drive readback text exactly matches each local record. No older records or archives were replaced or deleted.

The destination folder was owner-verified in the preceding preservation checkpoint. The current metadata connector omits owner and capability fields (`access_not_verified`); this receipt does not claim fresh owner-field verification. Upload permission and destination were confirmed by successful uploads and exact readbacks. The final full-source archive still requires its own ownership, permission, integrity and readback verification before final GitHub push.

| Record | Drive file ID | Local SHA-256 | Readback |
|---|---|---|---|
| `LOCAL_CHECKPOINT_20261012_2353.md` | `1xRoe_zTEhcdtqjZCTAuXwz2QCiV6Yz6H` | `cd3cf3cd467766347866228ef07ac0745d71e82e0361446f680a3714e9ad28cd` | exact text match |
| `MASTER_PHASE_LEDGER_20261012_2353.md` | `1T9DFbGyw03Z_a5Bm9fsLB1FdHzF58SEP` | `c218b80aedcc39ee5519cb7c5e00f8f949a3379db29b35a4badee0710f68a6a2` | exact text match |
| `REGRESSION_LEDGER_20261012_2353.md` | `1-M0Z2sk52xIyzSUlOai4yUyH_hhOmfV_` | `1e5d07047488bd11fd422feddec2b5b01ed8cbd6d7e9b253106f4daae0d4fb9a` | exact text match |
| `ACCEPTANCE_EVIDENCE_20261012_2353.md` | `1fFlSq-d8LNk3q-3jsv5BiHJ2X2Wv8aGV` | `07a2e438b50021469099b10f2d3facc0ded4d79b8f2ec425f7a4e6085b0b04e2` | exact text match |
| `EXECUTION_CHECKPOINT_20261012_2353.md` | `1MNe-uzIz0codWcw4jOT2sqoKoOctl9gq` | `5a2007c452a72f4145b97ef4423f045d372eb5ff0067d3e189ea4e78372c97d0` | exact text match |

This is an implementation checkpoint backup, not the final source archive. No GitHub push or deployment occurred.

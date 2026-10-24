# Drive Preservation Receipt — 2026-10-12 23:44 Asia/Dhaka

Destination: `HRMIS Preservation 2026-10-11`
Folder ID: `1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V`
Connected Drive account: `shihabshajib01@gmail.com`

Five new, versioned checkpoint records were uploaded through the connected account. Drive returned the intended destination folder as each record's parent. Readback text exactly matches each local file. Older Drive records and archives were not replaced or deleted.

The destination was owner-verified in the preceding preservation checkpoint. The current metadata connector again omitted owner/capability fields (`access_not_verified`), so this receipt does not claim a fresh owner-field verification. Upload and destination-write access are demonstrated by the returned parent IDs and exact readbacks.

| Record | Drive file ID | Local SHA-256 | Readback |
|---|---|---|---|
| `LOCAL_CHECKPOINT_20261012_2344.md` | `1dYenbU5ZxBbPMXbTPDqRmeuLXbf7zqdu` | `5ebdfd55c1df8509b24676dcd068459a7638663ff4142c9c50846157363dcc5c` | exact text match |
| `MASTER_PHASE_LEDGER_20261012_2344.md` | `1ztgUBA425piz43HxB1B4T4x3ExWtcK9k` | `7d37d8a45b490acbe31b6c37eb68e5f0a62f4043bba887104a7cdbf6df953922` | exact text match |
| `REGRESSION_LEDGER_20261012_2344.md` | `1ZlBH4CxVsfMCM-kcvVyviMFDuvg7u2EQ` | `ddc78a63955dedbbff105a7aa37538105a51031df0639208f0e227b772c21014` | exact text match |
| `ACCEPTANCE_EVIDENCE_20261012_2344.md` | `1dPoWUQZ_xBebMslHS4TQf5IrVwpXBh4C` | `d801e5b2cebc94100d086a1605661e4caea64bbcdb44be20ee6fd9e0689e5bb7` | exact text match |
| `EXECUTION_CHECKPOINT_20261012_2344.md` | `1Xutsp4J1TAJyl8nwXshzK30B-z2osWJU` | `72e28ecda7a77c2db282ce931eaad98c026a4b859a73c66cb4c4745360ca802c` | exact text match |

This is a versioned checkpoint-record backup, not the final complete source archive. The final archive still requires full product acceptance and its own ownership, permission, integrity, and readback verification before the final GitHub push. No GitHub push or deployment occurred.

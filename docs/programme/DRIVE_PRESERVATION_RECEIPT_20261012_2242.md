# Drive Preservation Receipt — Phase 08 Attendance Report Toolbar

Date: 2026-10-12 22:42 Asia/Dhaka  
Folder: HRMIS Preservation 2026-10-11  
Folder ID: 1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V  
Verified owner: shihabshajib01@gmail.com

The Drive folder metadata identified the connected user's account as owner. Each uploaded file reports that account as owner, remains a direct child of the verified folder, and was fetched for exact text comparison with its local source. The old source archives were not replaced.

| Record | Drive file ID | Local SHA-256 | Readback |
|---|---|---|---|
| EXECUTION_CHECKPOINT_20261012_2242.md | 1LNAXyDh5Q9OCfRwJAWVkWgdPYiiQFeu7 | 49e97a93e18bf98eacd2e50d0a06c2767e053dc80542f8f67e2944bb6f92bfc8 | Exact text match |
| ACCEPTANCE_EVIDENCE_20261012_2242.md | 1gaSENutVj0dyVENBku9Y5W0R_e79IRPC | 2ac338b472cb4b261bb6c473a1be577491ce9d69dc163c94d8afd85407e97418 | Exact text match |
| LOCAL_CHECKPOINT_20261012_2242.md | 1TiNWO747iewg9zyzNioMqZciIFU32Jfd | 686f16283240f8eb589e4f514978eddb67f25b89238bc0e8eb433f9bab91871d | Exact text match |
| MASTER_PHASE_LEDGER_20261012_2242.md | 1t34VFVFB7v5C4dLt7p5IQx_ysM_qshOe | 221c2aed9aacfed5aecf6d280554079e3ad57a8932aaaca7bb6e22bd2e4e7b2e | Exact text match |
| REGRESSION_LEDGER_20261012_2242.md | 1bm9C4QJFBxKpLtIkaLw751uz_SAz15Dk | 0ffee23ef8056ba573c94b95251567ae6e155ff068cbc905dbecdb0062ef7102 | Exact text match |

Local source commits preserved before Drive write:

- Toolbar implementation: 7fc4135bfe1a6d7d520bf089be2e4498e7522b12.
- Execution, acceptance and ledger checkpoint: affa48f82b38dadff6cda1969cfe967ad92e84c1.
- Main implementation branch: codex/recovery-checkpoint-20261012.

This is a versioned checkpoint-record update, not the final product source archive. The previous 18:56 source archive predates these changes and remains unchanged. The final complete source archive must be created and read back only after full product acceptance, before the final GitHub push and deployment.

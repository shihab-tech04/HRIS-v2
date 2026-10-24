# Drive Preservation Receipt — 2026-10-13 06:39 Asia/Dhaka

Destination: `HRMIS Preservation 2026-10-11` (`1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V`).

Before upload, Drive profile and folder metadata showed the connected account `shihabshajib01@gmail.com` owns the destination folder. Uploads succeeded to that folder. Each new record was fetched back from Drive; its text exactly matched the corresponding local file, and its parent ID matched the verified destination. Older records were not replaced.

| Record | Drive file ID | Readback | Destination parent |
|---|---|---|---|
| `EXECUTION_CHECKPOINT_20261013_0639.md` | `1OFRhcwS5PtmL9ujs-JOvLNH8kPPbXQ5f` | Exact text match | `1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V` |
| `ACCEPTANCE_EVIDENCE_20261013_0639.md` | `1rfBbEmiAnuoQ2v9de3v_9ACXtJmk0k9b` | Exact text match | `1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V` |
| `LOCAL_CHECKPOINT_20261013_0639.md` | `1sZoQr1E0bc9R5C3b_-h0Sfg7_I-4WXCY` | Exact text match | `1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V` |
| `MASTER_PHASE_LEDGER_20261013_0639.md` | `1jm9TqvbyUaverq_pNAoaNZbbcddHleOT` | Exact text match | `1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V` |
| `REGRESSION_LEDGER_20261013_0639.md` | `1VLRfGcIrOrMCcURWo51IMesVuEbkHpO8` | Exact text match | `1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V` |

These are versioned checkpoint/evidence records, not the final full-source archive. Full product acceptance and the final verified Drive source archive still precede any final GitHub push or deployment.

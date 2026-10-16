# Drive Preservation Receipt — Attendance Web Clock Checkpoint

**Date:** 2026-10-12 18:10 Asia/Dhaka  
**Connected account:** Shihab (`shihabshajib01@gmail.com`)  
**Destination:** `HRMIS Preservation 2026-10-11`, folder ID `1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V`.

## Ownership, access and integrity

- A Drive search constrained by `'me' in owners` returned the exact destination folder; the folder metadata reports it is not shared. Uploads succeeded into this folder and each new file's `parent_id` is the folder ID above.
- The uploaded source snapshot is a checkpoint, not the final release archive. It captures local commit `30a3e27715cedcddb909429c6185f056a13c878d` and includes the web clock-in/out feature commit `66d0a12b92f7dca38331848da82ab0d4da9acbf3` plus its execution and acceptance records.
- Local archive size: **1,943,960 bytes**. Local SHA-256: `2ef450ec10293e2cdd666af20d2691427d35ca07c8a6bc3ad1e7b9a212046144`. The Drive raw-file readback returned the same byte count and calculated SHA-256; they match. `unzip -t` reported no compressed-data errors.
- Both uploaded Markdown records were fetched back from Drive and compared with their local files; exact content matched. The uploaded `.sha256` record also matched local content exactly.

## Files added (older files were retained)

| File | Drive ID | Verification |
|---|---|---|
| `Synesis_HRIS360_Attendance_Web_Clock_Local_20261012_1810.zip` | `1Z-74WcGTRQY53RMhMZcyMVeLr_Hw7G64` | Parent verified; 1,943,960-byte raw readback; SHA-256 matched |
| `EXECUTION_CHECKPOINT_20261012_1810.md` | `1VmF1Xx_uqWCwhDhlq-K68ohsPOJTP1cW` | Exact text readback |
| `ACCEPTANCE_EVIDENCE_20261012_1810.md` | `1z-ZbmFZfH14ikLht10T8YRRUbqFPtFt2` | Exact text readback |
| `Synesis_HRIS360_Attendance_Web_Clock_Local_20261012_1810.zip.sha256` | `1CN0HVmnAXZYQkiXkXmDNWqf4jP07WAZQ` | Exact text readback |

This is an intermediate preservation checkpoint. Final acceptance, the complete final source backup, its read-back verification, GitHub push and deployment are still outstanding and remain in the required order.

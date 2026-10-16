# Drive preservation receipt — 2026-10-13 23:31 Asia/Dhaka

The local acceptance checkpoint and versioned source archives were uploaded as new files (older preservation files were not replaced) to the user-owned Drive folder **HRMIS Preservation 2026-10-11**.

- Folder: `1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V`
- Verified folder owner: `shihabshajib01@gmail.com`
- Upload capability: verified by two successful new-file uploads.
- Main archive: `Synesis-HRIS-v2-20261013_2327-546a8ba.zip`; source commit `546a8ba7355d4b4101936b8768cbb10f69d072bc`; local size 2,725,428 bytes; local SHA-256 `bdf288a95b3dc0337c7194abf4afb2e0e4312fb6e0a2492e218644454588cfeb`; Drive file `1R2WXfLvO3mPzeMdVaVAC5ObKK1P8Cdkb`.
- Candidate archive: `Synesis-HRIS-Candidate-v2-20261013_2327-217bfea.zip`; source commit `217bfeadd520f09d30e36b18af0589ac2ad6cee9`; local size 2,717,044 bytes; local SHA-256 `9ea347763845da19f92629a7cf865e84a3ed9354a59f1c5607c570cdbe6e26e8`; Drive file `1GsOyZiG7BSAl7CTgzfJzemd6Uu6ZkrCt`.

Both local ZIPs passed `unzip -tq`. Drive metadata and streamed raw-file fetch reported the expected file names, parent folder IDs, and byte sizes matching the local archives. The connector did not materialize the remote bytes locally, so a remote SHA-256 comparison is **not verified**. The manifest records this limitation and makes no remote checksum claim.

The acceptance evidence is in `ACCEPTANCE_EVIDENCE_20261013_2327.md`; the phase ledger was updated through this checkpoint. No production data or permissions changed. No paid services were activated, and there was no GitHub push or deployment.

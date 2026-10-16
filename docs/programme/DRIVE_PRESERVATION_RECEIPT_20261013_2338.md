# Drive preservation receipt — 2026-10-13 23:38 Asia/Dhaka

This receipt supersedes `DRIVE_PRESERVATION_RECEIPT_20261013_2337.md` because its Candidate archive SHA-256 was mistyped there. The uploaded Candidate archive and `CHECKPOINT_MANIFEST_20261013_2337.json` already have the correct hash; no archive bytes were changed.

- Destination: **HRMIS Preservation 2026-10-11**, folder `1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V`, owned by `shihabshajib01@gmail.com`. Folder ownership was verified from Drive permission metadata. Successful uploads verify write access.
- Main archive `Synesis-HRIS-v2-20261013_2335-65dfd36.zip`: commit `65dfd368590fb7570670946912fefdadfb5c062b`; local size 2,730,905 bytes; local SHA-256 `29f13ea808cb827ebfcd6e89962d42f21530aaa1ce4f75b64f63c9dfc2721d85`; Drive file `132YpML9NefaJ6GlGdqM3UuD3n41I7Qf9`.
- Candidate archive `Synesis-HRIS-Candidate-v2-20261013_2327-217bfea.zip`: commit `217bfeadd520f09d30e36b18af0589ac2ad6cee9`; local size 2,717,044 bytes; local SHA-256 `9ea347763845da19f92629a7cf865e84a3ed9354a59f1c5607c570cdbe6e26e8`; Drive file `1GsOyZiG7BSAl7CTgzfJzemd6Uu6ZkrCt`.

Both local ZIPs passed integrity checks. Drive metadata and streamed raw-file readback confirmed expected parent IDs and byte sizes. The connector did not materialize the remote ZIP bytes, so remote SHA-256 is **not verified**. No remote checksum claim is made. Acceptance evidence: `ACCEPTANCE_EVIDENCE_20261013_2335.md`.

No production changes, paid-service activations, GitHub push, or deployment occurred.

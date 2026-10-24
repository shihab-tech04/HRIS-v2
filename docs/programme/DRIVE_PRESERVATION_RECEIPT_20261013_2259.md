# Drive preservation receipt — 2026-10-13 22:59 Asia/Dhaka

Destination: **HRMIS Preservation 2026-10-11**, folder `1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V`.

The connected Drive profile is `shihabshajib01@gmail.com`. Drive folder metadata identifies the same account as owner. Upload access is evidenced by successful versioned uploads and readbacks in that folder.

## Versioned archives

| Repository snapshot | Drive file ID | Local integrity and SHA-256 | Remote readback |
|---|---|---|---|
| `Synesis-HRIS-v2-20261013_2252-d0e74a7.zip` — Main commit `d0e74a7d2aa44b75860379584bce1666ac788b07` | `1p-5nLEZLt7PkOSWNDlvuXgr5J5aq38kC` | ZIP test passed; 2,677,264 bytes; `86d11a0f3a15c07ceaca048b7acb569d5820c3c6b316a5548aef799ebcb69c8c` | Correct Drive parent and size match (2,677,264 bytes). Remote SHA-256 remains unverified. |
| `Synesis-HRIS-Candidate-v2-20261013_2252-3f9ff7d.zip` — Candidate commit `3f9ff7dfcac0256aab65017c42defb5baa57ee74` | `1oBD6Kf5xz4CgTaVMVu_UDVNwvmUTzaV_` | ZIP test passed; 2,705,381 bytes; `7831457b87ab9812683b3f45f8a46956fc39e98b5d4acebb4ec009fad04847b3` | Correct Drive parent and size match (2,705,381 bytes). Remote SHA-256 remains unverified. |

## Checkpoint records

The following new versioned records were uploaded and read back from the same folder:

- `EXECUTION_CHECKPOINT_20261013_2252.md` — `1uYNNv_0O_jTUZ-_c0DrzRP-MAZD5m7mi`
- `ACCEPTANCE_EVIDENCE_20261013_2252.md` — `1rmGbAdrY1G8iriatbe4APUVWm39y06tb`
- `MASTER_PHASE_LEDGER_20261013_2252.md` — `1q7e1lX9oD7hdR4PJI1_WZstj2qfdxbrw`
- `CHECKPOINT_MANIFEST_20261013_2252.json` — `1l6ZkDxqNirAQ0RHbhp6FOEqPEZlbJ2Mn`

Each fetched record reports the expected folder parent. Both archives passed local ZIP integrity checks, and Drive readback reported exact local byte sizes. The authenticated Drive fetch returned a signed file reference, but this restricted runtime could not materialize that reference for a cryptographic remote hash comparison. The manifest records this limitation explicitly. **Do not make the final GitHub push until remote SHA-256 verification succeeds.**

This is an intermediate recovery point. No GitHub push, deployment, production migration, production data or permission change, or paid service activation occurred.

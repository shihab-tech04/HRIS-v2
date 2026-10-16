# Drive Preservation Receipt — Shared CSV Security

Date: 2026-10-12 22:53 Asia/Dhaka  
Folder: HRMIS Preservation 2026-10-11  
Folder ID: 1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V  
Verified owner: shihabshajib01@gmail.com

Folder metadata confirms the connected user's account is owner. Each uploaded record is owned by that account, remains a direct child of the folder, and has an exact-text readback match to its local source. Earlier versioned checkpoint records and source archives remain unchanged.

| Record | Drive file ID | Local SHA-256 | Readback |
|---|---|---|---|
| EXECUTION_CHECKPOINT_20261012_2253.md | 1UiiQZ13gOtAIzbtE7VAWJ_0c7nAibaTt | 8d3db4c7b02195c22422b87fd9dde18d3259a3db908834b8d633b771c8605ef7 | Exact text match |
| ACCEPTANCE_EVIDENCE_20261012_2253.md | 1Cljho_O9diBnxbaqSv8QKzntZipe852f | ba80744287eaf0f9919c3265858161f3b65847f758f30188959cb2910a43e0b6 | Exact text match |
| LOCAL_CHECKPOINT_20261012_2253.md | 19OqWMIUZBs39td-OphuxI0gdrx9olkdK | a9d1a5682c3e14ba19c45eb01b00adb0b09da713e5b4e6f5ee95189b74f5c75d | Exact text match |
| MASTER_PHASE_LEDGER_20261012_2253.md | 1kv3pQihCvh7GXZT-K3KMuVtncsraBAUM | 4a594317d26a2961eba1c07520b43231f2e55645aa12b38b74f1871c174bc17e | Exact text match |
| REGRESSION_LEDGER_20261012_2253.md | 1zEwGQDufTDyYt_DFiegzzcYk53WWP7EU | a0aee4fbeae8b4084ce191018f52958ff3627960372c3d0cfc927a706ee709e5 | Exact text match |

Local commits represented:

- Shared CSV formula neutralization: f64623bc7123feeed94b70e9531703acb19e8ebf.
- Filter disclosure: 2dc1ba40b6f8cce2919cb3302f37cca3d468cac4.
- Figma toolbar: 7fc4135bfe1a6d7d520bf089be2e4498e7522b12.
- Current execution checkpoint: feda8989afaa1d1928195a4bf4118cf431f49604.
- Main branch: codex/recovery-checkpoint-20261012.

This receipt covers versioned evidence records only, not a complete product source archive. The existing 18:56 source archive predates these changes and remains unchanged. The final complete source archive must be created and read back after full product acceptance, before GitHub push and deployment.

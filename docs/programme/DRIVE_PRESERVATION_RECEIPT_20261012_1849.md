# Drive Preservation Receipt — Figma Attendance Team Filter

**Verified:** 2026-10-12 18:52 Asia/Dhaka  
**Purpose:** recoverable implementation checkpoint; explicitly not a final release archive.

## Destination verification

- Destination: [HRMIS Preservation 2026-10-11](https://drive.google.com/drive/folders/1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V), folder ID `1v9EA0TKcMfsNobfAdvmmz_XNF_tUx0-V`.
- Connected profile: `shihabshajib01@gmail.com`. Fresh Drive metadata showed that account as folder owner. The archive and records uploaded successfully into the same parent folder; the new file metadata confirms the parent and owner. Earlier files were not replaced.

## Complete source archive

- Local file: `Synesis_HRIS360_Phase08_AttendanceTeamFilter_20261012_1849.zip`
- Size: **4,796,441 bytes**.
- SHA-256: `e2ec2e8a3e18efff5bd6eaa673dfdebe3467551cc5471aa86802df853dd48eed`.
- Drive file: [open archived Main and Candidate source](https://drive.google.com/file/d/1HyLp0Ch5JGNit5bVh4dWQGwyStVNkzf3/view), ID `1HyLp0Ch5JGNit5bVh4dWQGwyStVNkzf3`.
- Contents are Git archives of Main commit `cbf31245fc58e96b32a25c487a6990cba0519db2` and Candidate commit `a23bd58f35d8194551f46751e7c9b1938ab2b20e`, plus a checkpoint manifest.
- Local `unzip -tq`: PASS. Drive download readback: **4,796,441 bytes**, byte-for-byte match with local archive, SHA-256 match.
- SHA sidecar: [archive SHA-256 file](https://drive.google.com/file/d/15cOc9acPA2v-mXJvvN5Fgdd4rO466yk7/view), ID `15cOc9acPA2v-mXJvvN5Fgdd4rO466yk7`; its text readback matched the local sidecar exactly.

## Updated records

- [Execution checkpoint](https://drive.google.com/file/d/1QDC82m3Slwzh7PXSSjQyIOlh_3heKSwa/view), ID `1QDC82m3Slwzh7PXSSjQyIOlh_3heKSwa`; exact text readback, parent folder, and file owner verified.
- [Acceptance evidence](https://drive.google.com/file/d/1s10nguTt1VdZP8_aimWu2OcEODJdSl8X/view), ID `1s10nguTt1VdZP8_aimWu2OcEODJdSl8X`; exact text readback, parent folder, and file owner verified.

## Release gate

- This is a versioned local progress backup. It does not complete the 1,047-story acceptance gate and is not permission to publish or deploy.
- No production data, schema, permissions or Auth settings changed. No paid service, GitHub push or deployment occurred.

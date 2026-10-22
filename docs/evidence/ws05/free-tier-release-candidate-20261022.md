# WS05 free-tier release-candidate checkpoint — 22 October 2026

## Source chain
- Original integrated UI PR #60: `2554c86df6fb53ca40e0560d44d480a6687afa92`, 69 browser tests passed at CI 39712705491.
- WS02 security migration files added to this WS05 branch, without hosted writes: `20261021060748_employee_addresses_tenant_read_guard.sql`, `20261021084635_leave_types_authenticated_read_only_acl.sql`.
- Employee-family tenant migration `20261016171104_employee_family_tenant_scoped_read.sql` already exists in this source baseline.
- Latest state before this evidence file: Pages artifact synchronization commit `f6a2852ae65219ff415e01bcfea5f4e8ae3605bb`, derived from successful branch-only CI run 39716589076.
- The lockfile was completed using the existing package ranges and a clean `npm ci`, followed by lint and the Pages asset build in the same job.
- The disposable Auth/PG fixture's future working-day holiday fix is committed in `44a6f82c008092bda54c0d91d626dc4c7258d1dc`.

## Recovery and release integrity
- Immutable source Git bundle at `ddde190093cde91fa1dccf28eb1393d780cf0dd8` passed SHA-256 and independent git clone/cat-file restore checks (including pre-release main `cfd5fc5c71c4346ebcef2f86eead2b7c5196e2c7`) and was uploaded to Google Drive: https://drive.google.com/file/d/1z1JJxbBf4_4cDNeo25bOKeghzNwWz-H-/view?usp=drivesdk
- Later commits require a newer exact-head off-GitHub bundle before release.
- Free-tier Supabase has no downloadable managed backup. An independent encrypted PostgreSQL backup and isolated restore have **not** been proved.
- Production employee address/family RLS and leave_types ACL changes are **not** applied to hosted Supabase.
- Protected reviews, hosted two-tenant/RPC/Auth verification, fresh full integrated CI and production rollback rehearsals are **not yet certified**.

Do not claim LIVE until WS05 merges the authorized verified commit, deploy-pages succeeds, and the actual production URL and served asset versions are checked. Do not update Candidate or Nadia projects as part of this Main release.

-- Security correction: API client roles do not need table-maintenance privileges.
-- RLS does not govern TRUNCATE. These grants were observed in hosted PostgreSQL 17
-- on 2026-10-20; keep every existing SELECT/INSERT/UPDATE/DELETE grant intact.
-- Review-only migration source: release controller must approve and certify
-- the versioned migration, backup/restore proof, and two-tenant acceptance
-- before this is applied to any hosted environment.
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE
  public.leave_requests,
  public.leave_types,
  public.candidate_job_alerts,
  public.employee_addresses,
  public.employee_family_members
FROM PUBLIC, anon, authenticated;

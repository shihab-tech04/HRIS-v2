-- Post-release structural guard. This is NOT authenticated two-tenant acceptance.
SELECT
 (SELECT count(*) FROM public.tenant_memberships) AS total_memberships,
 (SELECT count(*) FROM public.tenant_memberships m
   JOIN public.tenants t ON t.id=m.tenant_id
   JOIN public.admin_users a ON a.user_id=m.user_id
   JOIN auth.users u ON u.id=m.user_id
   WHERE t.slug='synesis-it' AND t.is_active AND m.role='hr_admin'
     AND m.status='active' AND a.active AND a.is_super_admin
     AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
     AND (u.banned_until IS NULL OR u.banned_until<=now())) AS authorized_memberships,
 (SELECT count(*) FROM public.admin_users WHERE active AND is_super_admin) AS active_superadmins,
 (SELECT count(*) FROM public.role_permissions WHERE role_id='hr_admin' AND permission_id='organization.manage') AS minimal_grants,
 (SELECT count(*) FROM public.admin_audit_logs WHERE action='PHASE03_INITIAL_TENANT_ADMIN_BACKFILLED') AS original_audits_preserved,
 (SELECT count(*) FROM public.admin_audit_logs WHERE action='PHASE03_TENANT_ADMIN_MEMBERSHIP_REBOUND') AS controlled_repair_audits,
 CASE WHEN (SELECT count(*) FROM public.tenant_memberships)=1
    AND (SELECT count(*) FROM public.tenant_memberships m
      JOIN public.tenants t ON t.id=m.tenant_id
      JOIN public.admin_users a ON a.user_id=m.user_id
      WHERE t.slug='synesis-it' AND t.is_active AND a.active AND a.is_super_admin
        AND m.status='active' AND m.role='hr_admin')=1
    AND (SELECT count(*) FROM public.admin_users WHERE active AND is_super_admin)=1
    AND (SELECT count(*) FROM public.role_permissions WHERE role_id='hr_admin' AND permission_id='organization.manage')=1
    AND (SELECT count(*) FROM public.admin_audit_logs WHERE action='PHASE03_INITIAL_TENANT_ADMIN_BACKFILLED')=1
    AND (SELECT count(*) FROM public.admin_audit_logs WHERE action='PHASE03_TENANT_ADMIN_MEMBERSHIP_REBOUND')=1
   THEN 'PASS_STRUCTURAL_ONLY_REQUIRES_AUTH_ACCEPTANCE' ELSE 'BLOCKED_MEMBERSHIP_RECOVERY_NOT_CERTIFIED'
 END AS structural_gate;

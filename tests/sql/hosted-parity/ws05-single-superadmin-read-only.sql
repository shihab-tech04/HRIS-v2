-- WS05: read-only verification of the owner's single-login rule.
-- Run against the replacement HRIS only; returns no identities or employee PII.
-- This file is safe before/after the separate staged repair.
WITH observed AS (
  SELECT
    (SELECT count(*) FROM auth.users) AS auth_users,
    (SELECT count(*) FROM public.admin_users a
       JOIN auth.users u ON u.id = a.user_id
       WHERE a.active IS TRUE AND a.is_super_admin IS TRUE) AS sole_admin,
    (SELECT count(*) FROM public.tenant_memberships m
       JOIN auth.users u ON u.id = m.user_id
       JOIN public.admin_users a ON a.user_id = u.id
       JOIN public.tenants t ON t.id = m.tenant_id
       WHERE a.active IS TRUE AND a.is_super_admin IS TRUE
         AND m.status = 'active' AND t.is_active IS TRUE) AS admin_tenant_bindings,
    (SELECT count(*) FROM public.employees) AS employee_records,
    (SELECT count(*) FROM public.employees e
       WHERE e.user_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = e.user_id)) AS orphan_employee_auth_links
)
SELECT auth_users, sole_admin, admin_tenant_bindings, employee_records,
       orphan_employee_auth_links,
       CASE WHEN auth_users = 1 AND sole_admin = 1 AND admin_tenant_bindings = 1
            THEN 'SINGLE_SUPER_ADMIN_PASS'
            ELSE 'SINGLE_SUPER_ADMIN_FAIL' END AS auth_rule,
       CASE WHEN orphan_employee_auth_links = 0
            THEN 'EMPLOYEE_AUTH_LINKS_PASS'
            ELSE 'EMPLOYEE_AUTH_LINKS_FAIL' END AS data_integrity
FROM observed;

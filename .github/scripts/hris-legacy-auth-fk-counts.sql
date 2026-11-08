-- Read-only HRIS Auth-reference provenance tied to each encrypted pg_dump.
-- Changes in counts during the export cause backup failure (fail-closed).
-- Both source and restore use the identical 17 reviewed FK definitions.
SELECT table_name, column_name, nonnull_count, orphan_count
FROM (
SELECT 'admin_audit_logs' AS table_name, 'actor_id' AS column_name,
       count(*) FILTER (WHERE src.actor_id IS NOT NULL) AS nonnull_count,
       count(*) FILTER (WHERE src.actor_id IS NOT NULL AND u.id IS NULL) AS orphan_count
FROM public.admin_audit_logs src LEFT JOIN auth.users u ON u.id = src.actor_id
UNION ALL
SELECT 'confirmation_reviews' AS table_name, 'resolved_by' AS column_name,
       count(*) FILTER (WHERE src.resolved_by IS NOT NULL) AS nonnull_count,
       count(*) FILTER (WHERE src.resolved_by IS NOT NULL AND u.id IS NULL) AS orphan_count
FROM public.confirmation_reviews src LEFT JOIN auth.users u ON u.id = src.resolved_by
UNION ALL
SELECT 'employee_lifecycle_events' AS table_name, 'performed_by' AS column_name,
       count(*) FILTER (WHERE src.performed_by IS NOT NULL) AS nonnull_count,
       count(*) FILTER (WHERE src.performed_by IS NOT NULL AND u.id IS NULL) AS orphan_count
FROM public.employee_lifecycle_events src LEFT JOIN auth.users u ON u.id = src.performed_by
UNION ALL
SELECT 'employee_referrals' AS table_name, 'submitted_by' AS column_name,
       count(*) FILTER (WHERE src.submitted_by IS NOT NULL) AS nonnull_count,
       count(*) FILTER (WHERE src.submitted_by IS NOT NULL AND u.id IS NULL) AS orphan_count
FROM public.employee_referrals src LEFT JOIN auth.users u ON u.id = src.submitted_by
UNION ALL
SELECT 'employees' AS table_name, 'user_id' AS column_name,
       count(*) FILTER (WHERE src.user_id IS NOT NULL) AS nonnull_count,
       count(*) FILTER (WHERE src.user_id IS NOT NULL AND u.id IS NULL) AS orphan_count
FROM public.employees src LEFT JOIN auth.users u ON u.id = src.user_id
UNION ALL
SELECT 'hr_policies' AS table_name, 'created_by' AS column_name,
       count(*) FILTER (WHERE src.created_by IS NOT NULL) AS nonnull_count,
       count(*) FILTER (WHERE src.created_by IS NOT NULL AND u.id IS NULL) AS orphan_count
FROM public.hr_policies src LEFT JOIN auth.users u ON u.id = src.created_by
UNION ALL
SELECT 'leave_requests' AS table_name, 'submitted_by' AS column_name,
       count(*) FILTER (WHERE src.submitted_by IS NOT NULL) AS nonnull_count,
       count(*) FILTER (WHERE src.submitted_by IS NOT NULL AND u.id IS NULL) AS orphan_count
FROM public.leave_requests src LEFT JOIN auth.users u ON u.id = src.submitted_by
UNION ALL
SELECT 'manpower_requisitions' AS table_name, 'requested_by' AS column_name,
       count(*) FILTER (WHERE src.requested_by IS NOT NULL) AS nonnull_count,
       count(*) FILTER (WHERE src.requested_by IS NOT NULL AND u.id IS NULL) AS orphan_count
FROM public.manpower_requisitions src LEFT JOIN auth.users u ON u.id = src.requested_by
UNION ALL
SELECT 'manpower_requisitions' AS table_name, 'resolved_by' AS column_name,
       count(*) FILTER (WHERE src.resolved_by IS NOT NULL) AS nonnull_count,
       count(*) FILTER (WHERE src.resolved_by IS NOT NULL AND u.id IS NULL) AS orphan_count
FROM public.manpower_requisitions src LEFT JOIN auth.users u ON u.id = src.resolved_by
UNION ALL
SELECT 'notices' AS table_name, 'created_by' AS column_name,
       count(*) FILTER (WHERE src.created_by IS NOT NULL) AS nonnull_count,
       count(*) FILTER (WHERE src.created_by IS NOT NULL AND u.id IS NULL) AS orphan_count
FROM public.notices src LEFT JOIN auth.users u ON u.id = src.created_by
UNION ALL
SELECT 'pay_periods' AS table_name, 'created_by' AS column_name,
       count(*) FILTER (WHERE src.created_by IS NOT NULL) AS nonnull_count,
       count(*) FILTER (WHERE src.created_by IS NOT NULL AND u.id IS NULL) AS orphan_count
FROM public.pay_periods src LEFT JOIN auth.users u ON u.id = src.created_by
UNION ALL
SELECT 'pay_periods' AS table_name, 'released_by' AS column_name,
       count(*) FILTER (WHERE src.released_by IS NOT NULL) AS nonnull_count,
       count(*) FILTER (WHERE src.released_by IS NOT NULL AND u.id IS NULL) AS orphan_count
FROM public.pay_periods src LEFT JOIN auth.users u ON u.id = src.released_by
UNION ALL
SELECT 'performance_cycles' AS table_name, 'created_by' AS column_name,
       count(*) FILTER (WHERE src.created_by IS NOT NULL) AS nonnull_count,
       count(*) FILTER (WHERE src.created_by IS NOT NULL AND u.id IS NULL) AS orphan_count
FROM public.performance_cycles src LEFT JOIN auth.users u ON u.id = src.created_by
UNION ALL
SELECT 'performance_goals' AS table_name, 'created_by' AS column_name,
       count(*) FILTER (WHERE src.created_by IS NOT NULL) AS nonnull_count,
       count(*) FILTER (WHERE src.created_by IS NOT NULL AND u.id IS NULL) AS orphan_count
FROM public.performance_goals src LEFT JOIN auth.users u ON u.id = src.created_by
UNION ALL
SELECT 'project_performance_reviews' AS table_name, 'evaluated_by' AS column_name,
       count(*) FILTER (WHERE src.evaluated_by IS NOT NULL) AS nonnull_count,
       count(*) FILTER (WHERE src.evaluated_by IS NOT NULL AND u.id IS NULL) AS orphan_count
FROM public.project_performance_reviews src LEFT JOIN auth.users u ON u.id = src.evaluated_by
UNION ALL
SELECT 'service_requests' AS table_name, 'resolved_by' AS column_name,
       count(*) FILTER (WHERE src.resolved_by IS NOT NULL) AS nonnull_count,
       count(*) FILTER (WHERE src.resolved_by IS NOT NULL AND u.id IS NULL) AS orphan_count
FROM public.service_requests src LEFT JOIN auth.users u ON u.id = src.resolved_by
UNION ALL
SELECT 'service_requests' AS table_name, 'submitted_by' AS column_name,
       count(*) FILTER (WHERE src.submitted_by IS NOT NULL) AS nonnull_count,
       count(*) FILTER (WHERE src.submitted_by IS NOT NULL AND u.id IS NULL) AS orphan_count
FROM public.service_requests src LEFT JOIN auth.users u ON u.id = src.submitted_by
) AS snapshot_counts
ORDER BY table_name, column_name;

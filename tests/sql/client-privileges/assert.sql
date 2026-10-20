-- Verifies the effective privileges of each database role after correction.
DO $verify$
DECLARE
  elevated_count integer;
  client_dml_count integer;
  service_maintenance_count integer;
  rls_count integer;
BEGIN
  SELECT count(*) INTO elevated_count
    FROM pg_class c
    CROSS JOIN (VALUES ('anon'),('authenticated')) r(rolname)
    CROSS JOIN (VALUES ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
   WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
     AND c.relname IN ('leave_requests','leave_types','candidate_job_alerts',
                       'employee_addresses','employee_family_members')
     AND has_table_privilege(r.rolname,c.oid,p.privilege);
  IF elevated_count <> 0 THEN
    RAISE EXCEPTION 'Unexpected client maintenance privileges: %', elevated_count;
  END IF;

  SELECT count(*) INTO client_dml_count
    FROM pg_class c
    CROSS JOIN (VALUES ('anon'),('authenticated')) r(rolname)
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(privilege)
   WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
     AND c.relname IN ('leave_requests','leave_types','candidate_job_alerts',
                       'employee_addresses','employee_family_members')
     AND has_table_privilege(r.rolname,c.oid,p.privilege);
  IF client_dml_count <> 40 THEN
    RAISE EXCEPTION 'CRUD grant regression; expected 40, found %', client_dml_count;
  END IF;

  SELECT count(*) INTO service_maintenance_count
    FROM pg_class c
    CROSS JOIN (VALUES ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')) p(privilege)
   WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
     AND c.relname IN ('leave_requests','leave_types','candidate_job_alerts',
                       'employee_addresses','employee_family_members')
     AND has_table_privilege('service_role',c.oid,p.privilege);
  IF service_maintenance_count <> 20 THEN
    RAISE EXCEPTION 'Service-role grant regression; expected 20, found %', service_maintenance_count;
  END IF;

  SELECT count(*) INTO rls_count FROM pg_class c
   WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
     AND c.relname IN ('leave_requests','leave_types','candidate_job_alerts',
                       'employee_addresses','employee_family_members')
     AND c.relrowsecurity;
  IF rls_count <> 5 THEN
    RAISE EXCEPTION 'RLS state changed; expected 5 enabled tables, found %', rls_count;
  END IF;
END;
$verify$;

-- Restore the source migration for the production expense-to-travel link table.
-- Production already has this table, its tenant RLS policies, and no rows. This
-- migration creates the exact existing contract only when the table is absent
-- from a clean source replay; it never rewrites existing rows or policies.
DO $migration$
DECLARE
  v_table_preexisted boolean := to_regclass('public.expense_travel_links') IS NOT NULL;
BEGIN
  IF NOT v_table_preexisted THEN
    CREATE TABLE public.expense_travel_links (
      claim_id uuid NOT NULL,
      travel_request_id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      employee_id uuid NOT NULL,
      linked_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT expense_travel_links_pkey PRIMARY KEY (claim_id),
      CONSTRAINT expense_travel_links_claim_id_fkey
        FOREIGN KEY (claim_id) REFERENCES public.expense_claims(id) ON DELETE RESTRICT,
      CONSTRAINT expense_travel_links_travel_request_id_fkey
        FOREIGN KEY (travel_request_id) REFERENCES public.travel_requests(id) ON DELETE RESTRICT,
      CONSTRAINT expense_travel_links_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
      CONSTRAINT expense_travel_links_employee_id_fkey
        FOREIGN KEY (employee_id) REFERENCES public.employees(id)
    );

    CREATE INDEX expense_travel_links_by_trip
      ON public.expense_travel_links USING btree (travel_request_id);

    ALTER TABLE public.expense_travel_links ENABLE ROW LEVEL SECURITY;

    GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_travel_links TO authenticated;
    GRANT ALL ON public.expense_travel_links TO service_role;

    CREATE POLICY expense_travel_own_read
      ON public.expense_travel_links FOR SELECT TO authenticated
      USING (
        is_live_session()
        AND tenant_id = synesis_tenant_id()
        AND employee_id = employee_for_auth_user()
      );

    CREATE POLICY expense_travel_own_insert
      ON public.expense_travel_links FOR INSERT TO authenticated
      WITH CHECK (
        is_live_session()
        AND tenant_id = synesis_tenant_id()
        AND employee_id = employee_for_auth_user()
        AND EXISTS (
          SELECT 1 FROM public.expense_claims c
          WHERE c.id = expense_travel_links.claim_id
            AND c.employee_id = expense_travel_links.employee_id
            AND c.tenant_id = expense_travel_links.tenant_id
            AND c.status = 'draft'
        )
        AND EXISTS (
          SELECT 1 FROM public.travel_requests t
          WHERE t.id = expense_travel_links.travel_request_id
            AND t.employee_id = expense_travel_links.employee_id
            AND t.tenant_id = expense_travel_links.tenant_id
        )
      );

    CREATE POLICY expense_travel_own_update
      ON public.expense_travel_links FOR UPDATE TO authenticated
      USING (
        is_live_session()
        AND tenant_id = synesis_tenant_id()
        AND employee_id = employee_for_auth_user()
        AND EXISTS (
          SELECT 1 FROM public.expense_claims c
          WHERE c.id = expense_travel_links.claim_id
            AND c.status = 'draft'
            AND c.employee_id = expense_travel_links.employee_id
        )
      )
      WITH CHECK (
        is_live_session()
        AND tenant_id = synesis_tenant_id()
        AND employee_id = employee_for_auth_user()
        AND EXISTS (
          SELECT 1 FROM public.expense_claims c
          WHERE c.id = expense_travel_links.claim_id
            AND c.status = 'draft'
            AND c.employee_id = expense_travel_links.employee_id
            AND c.tenant_id = expense_travel_links.tenant_id
        )
        AND EXISTS (
          SELECT 1 FROM public.travel_requests t
          WHERE t.id = expense_travel_links.travel_request_id
            AND t.employee_id = expense_travel_links.employee_id
            AND t.tenant_id = expense_travel_links.tenant_id
        )
      );

    CREATE POLICY expense_travel_own_delete
      ON public.expense_travel_links FOR DELETE TO authenticated
      USING (
        is_live_session()
        AND tenant_id = synesis_tenant_id()
        AND employee_id = employee_for_auth_user()
        AND EXISTS (
          SELECT 1 FROM public.expense_claims c
          WHERE c.id = expense_travel_links.claim_id
            AND c.status = 'draft'
            AND c.employee_id = expense_travel_links.employee_id
        )
      );
  END IF;
END
$migration$;

DO $verify$
DECLARE
  v_column_contract text[];
  v_policy_count integer;
BEGIN
  SELECT array_agg(
    c.column_name || ':' || c.data_type || ':' || c.is_nullable || ':' || coalesce(c.column_default, '')
    ORDER BY c.ordinal_position
  )
  INTO v_column_contract
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'expense_travel_links';

  IF v_column_contract IS DISTINCT FROM ARRAY[
    'claim_id:uuid:NO:',
    'travel_request_id:uuid:NO:',
    'tenant_id:uuid:NO:',
    'employee_id:uuid:NO:',
    'linked_at:timestamp with time zone:NO:now()'
  ]::text[] THEN
    RAISE EXCEPTION 'expense_travel_links source contract differs from the verified production schema';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid = 'public.expense_travel_links'::regclass AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'expense_travel_links must retain row-level security';
  END IF;

  SELECT count(*) INTO v_policy_count
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'expense_travel_links'
    AND p.policyname IN (
      'expense_travel_own_read',
      'expense_travel_own_insert',
      'expense_travel_own_update',
      'expense_travel_own_delete'
    )
    AND p.roles = ARRAY['authenticated']::name[];

  IF v_policy_count <> 4
     OR NOT has_table_privilege('authenticated', 'public.expense_travel_links', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.expense_travel_links', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.expense_travel_links', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.expense_travel_links', 'DELETE')
     OR NOT has_table_privilege('service_role', 'public.expense_travel_links', 'TRUNCATE') THEN
    RAISE EXCEPTION 'expense_travel_links grants or tenant policies differ from the verified production contract';
  END IF;
END
$verify$;

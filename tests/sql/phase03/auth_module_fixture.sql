-- Synthetic disposable Supabase Auth/Storage fixture for Phase 03 optional modules.
-- This file must only run in the dedicated local Phase 2A/3 acceptance project.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

DO $setup$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'travel_requests','travel_status_history','travel_request_notifications',
    'expense_travel_links','expense_categories','expense_claims',
    'expense_claim_receipts','expense_claim_status_history',
    'learning_programs','learning_sessions','learning_enrollments',
    'learning_completion_events','learning_completion_notifications'
  ] LOOP
    EXECUTE pg_catalog.format(
      'CREATE TABLE public.%I (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), note text NOT NULL DEFAULT %L)',
      v_table, 'Phase 03 Auth fixture'
    );
    EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE pg_catalog.format('REVOKE ALL ON public.%I FROM PUBLIC, anon', v_table);
  END LOOP;
END;
$setup$;

CREATE OR REPLACE FUNCTION private.phase03_auth_fixture_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p_tenant_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.tenant_id = p_tenant_id
      AND m.user_id = auth.uid()
      AND lower(m.status) = 'active'
  )
$function$;
REVOKE ALL ON FUNCTION private.phase03_auth_fixture_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.phase03_auth_fixture_member(uuid) TO authenticated;
GRANT SELECT ON public.tenant_memberships TO authenticated;

DO $policies$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'travel_requests','expense_travel_links','expense_claims','learning_enrollments'
  ] LOOP
    EXECUTE pg_catalog.format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', v_table);
    EXECUTE pg_catalog.format(
      'CREATE POLICY phase03_auth_fixture_member_access ON public.%I FOR ALL TO authenticated USING (private.phase03_auth_fixture_member(tenant_id)) WITH CHECK (private.phase03_auth_fixture_member(tenant_id))',
      v_table
    );
  END LOOP;
END;
$policies$;

-- Local permissive baseline makes the new restrictive policies the only
-- difference between successful and rejected Storage API writes.
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
CREATE POLICY phase03_auth_fixture_storage_access
  ON storage.objects FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.travel_requests(tenant_id, note)
SELECT id, 'phase03-auth-historical-travel' FROM public.tenants WHERE slug = 'synesis-it';
INSERT INTO public.expense_claims(tenant_id, note)
SELECT id, 'phase03-auth-historical-expense' FROM public.tenants WHERE slug = 'synesis-it';
INSERT INTO public.learning_enrollments(tenant_id, note)
SELECT id, 'phase03-auth-historical-learning' FROM public.tenants WHERE slug = 'synesis-it';

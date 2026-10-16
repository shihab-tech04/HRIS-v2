-- Employee expense claims use explicit tenant-linked employee identity. This
-- migration adds no manager decision path: the approved multi-tier review
-- sequence and role order are still awaiting product-owner confirmation.
BEGIN;

ALTER TABLE public.expense_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_claim_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_claim_status_history ENABLE ROW LEVEL SECURITY;

-- Remove legacy policies that combine the single-tenant pin with global
-- permissions. They are permissive, so leaving them beside scoped policies
-- would still authorize rows through the legacy path.
DROP POLICY IF EXISTS expense_claims_employee_insert_draft ON public.expense_claims;
DROP POLICY IF EXISTS expense_claims_employee_read ON public.expense_claims;
DROP POLICY IF EXISTS expense_claims_employee_reopen_rejected ON public.expense_claims;
DROP POLICY IF EXISTS expense_claims_employee_submit ON public.expense_claims;
DROP POLICY IF EXISTS expense_claims_employee_update_draft ON public.expense_claims;
DROP POLICY IF EXISTS expense_categories_admin_insert ON public.expense_categories;
DROP POLICY IF EXISTS expense_categories_admin_read ON public.expense_categories;
DROP POLICY IF EXISTS expense_categories_admin_update ON public.expense_categories;
DROP POLICY IF EXISTS expense_categories_employee_read ON public.expense_categories;
DROP POLICY IF EXISTS expense_receipts_admin_read ON public.expense_claim_receipts;
DROP POLICY IF EXISTS expense_receipts_employee_delete ON public.expense_claim_receipts;
DROP POLICY IF EXISTS expense_receipts_employee_insert ON public.expense_claim_receipts;
DROP POLICY IF EXISTS expense_receipts_employee_read ON public.expense_claim_receipts;
DROP POLICY IF EXISTS expense_claim_history_admin_read ON public.expense_claim_status_history;
DROP POLICY IF EXISTS expense_claim_history_employee_read ON public.expense_claim_status_history;
DROP POLICY IF EXISTS expense_receipt_objects_employee_delete ON storage.objects;
DROP POLICY IF EXISTS expense_receipt_objects_employee_insert ON storage.objects;
DROP POLICY IF EXISTS expense_receipt_objects_employee_select ON storage.objects;

-- Row access follows the employee link for the row's own tenant, rather than
-- the legacy single-tenant pin. Manager reads require an active tenant grant.
DROP POLICY IF EXISTS hris_expense_claims_employee_tenant_read ON public.expense_claims;
CREATE POLICY hris_expense_claims_employee_tenant_read
  ON public.expense_claims FOR SELECT TO authenticated
  USING (public.is_live_session()
    AND employee_id=public.hris_own_employee_for_tenant(tenant_id));

DROP POLICY IF EXISTS hris_expense_claims_manager_tenant_read ON public.expense_claims;
CREATE POLICY hris_expense_claims_manager_tenant_read
  ON public.expense_claims FOR SELECT TO authenticated
  USING (public.is_live_session()
    AND status='submitted'
    AND (public.has_tenant_permission(tenant_id,'expenses.view')
      OR public.has_tenant_permission(tenant_id,'expenses.manage')));

DROP POLICY IF EXISTS hris_expense_claims_employee_tenant_insert_draft ON public.expense_claims;
CREATE POLICY hris_expense_claims_employee_tenant_insert_draft
  ON public.expense_claims FOR INSERT TO authenticated
  WITH CHECK (public.is_live_session()
    AND employee_id=public.hris_own_employee_for_tenant(tenant_id)
    AND status='draft');

DROP POLICY IF EXISTS hris_expense_claims_employee_tenant_update_draft ON public.expense_claims;
CREATE POLICY hris_expense_claims_employee_tenant_update_draft
  ON public.expense_claims FOR UPDATE TO authenticated
  USING (public.is_live_session()
    AND employee_id=public.hris_own_employee_for_tenant(tenant_id)
    AND status='draft')
  WITH CHECK (public.is_live_session()
    AND employee_id=public.hris_own_employee_for_tenant(tenant_id)
    AND status='draft');

DROP POLICY IF EXISTS hris_expense_claims_employee_tenant_submit ON public.expense_claims;
CREATE POLICY hris_expense_claims_employee_tenant_submit
  ON public.expense_claims FOR UPDATE TO authenticated
  USING (public.is_live_session()
    AND employee_id=public.hris_own_employee_for_tenant(tenant_id)
    AND status='draft')
  WITH CHECK (public.is_live_session()
    AND employee_id=public.hris_own_employee_for_tenant(tenant_id)
    AND status='submitted'
    AND category_id IS NOT NULL AND claim_date IS NOT NULL
    AND amount IS NOT NULL AND currency IS NOT NULL AND submitted_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.expense_categories ec
      WHERE ec.id=expense_claims.category_id
        AND ec.tenant_id=expense_claims.tenant_id AND ec.active IS TRUE
    ));

DROP POLICY IF EXISTS hris_expense_claims_employee_tenant_reopen ON public.expense_claims;
CREATE POLICY hris_expense_claims_employee_tenant_reopen
  ON public.expense_claims FOR UPDATE TO authenticated
  USING (public.is_live_session()
    AND employee_id=public.hris_own_employee_for_tenant(tenant_id)
    AND status='rejected')
  WITH CHECK (public.is_live_session()
    AND employee_id=public.hris_own_employee_for_tenant(tenant_id)
    AND status='draft');

DROP POLICY IF EXISTS hris_expense_categories_employee_tenant_read ON public.expense_categories;
CREATE POLICY hris_expense_categories_employee_tenant_read
  ON public.expense_categories FOR SELECT TO authenticated
  USING (public.is_live_session() AND active IS TRUE
    AND public.hris_own_employee_for_tenant(tenant_id) IS NOT NULL);

DROP POLICY IF EXISTS hris_expense_categories_manager_tenant_read ON public.expense_categories;
CREATE POLICY hris_expense_categories_manager_tenant_read
  ON public.expense_categories FOR SELECT TO authenticated
  USING (public.is_live_session() AND (public.has_tenant_permission(tenant_id,'expenses.view')
    OR public.has_tenant_permission(tenant_id,'expenses.manage')));

DROP POLICY IF EXISTS hris_expense_categories_manager_tenant_insert ON public.expense_categories;
CREATE POLICY hris_expense_categories_manager_tenant_insert
  ON public.expense_categories FOR INSERT TO authenticated
  WITH CHECK (public.is_live_session() AND public.has_tenant_permission(tenant_id,'expenses.manage'));

DROP POLICY IF EXISTS hris_expense_categories_manager_tenant_update ON public.expense_categories;
CREATE POLICY hris_expense_categories_manager_tenant_update
  ON public.expense_categories FOR UPDATE TO authenticated
  USING (public.is_live_session() AND public.has_tenant_permission(tenant_id,'expenses.manage'))
  WITH CHECK (public.is_live_session() AND public.has_tenant_permission(tenant_id,'expenses.manage'));

DROP POLICY IF EXISTS hris_expense_history_employee_tenant_read ON public.expense_claim_status_history;
CREATE POLICY hris_expense_history_employee_tenant_read
  ON public.expense_claim_status_history FOR SELECT TO authenticated
  USING (public.is_live_session()
    AND EXISTS (
      SELECT 1 FROM public.expense_claims c
      WHERE c.id=expense_claim_status_history.claim_id
        AND c.tenant_id=expense_claim_status_history.tenant_id
        AND c.employee_id=public.hris_own_employee_for_tenant(expense_claim_status_history.tenant_id)
    ));

DROP POLICY IF EXISTS hris_expense_history_manager_tenant_read ON public.expense_claim_status_history;
CREATE POLICY hris_expense_history_manager_tenant_read
  ON public.expense_claim_status_history FOR SELECT TO authenticated
  USING (public.is_live_session()
    AND EXISTS (
      SELECT 1 FROM public.expense_claims c
      WHERE c.id=expense_claim_status_history.claim_id
        AND c.tenant_id=expense_claim_status_history.tenant_id AND c.status='submitted'
    )
    AND (public.has_tenant_permission(tenant_id,'expenses.view')
      OR public.has_tenant_permission(tenant_id,'expenses.manage')));

DROP POLICY IF EXISTS hris_expense_receipts_employee_tenant_read ON public.expense_claim_receipts;
CREATE POLICY hris_expense_receipts_employee_tenant_read
  ON public.expense_claim_receipts FOR SELECT TO authenticated
  USING (public.is_live_session()
    AND employee_id=public.hris_own_employee_for_tenant(tenant_id));

DROP POLICY IF EXISTS hris_expense_receipts_manager_tenant_read ON public.expense_claim_receipts;
CREATE POLICY hris_expense_receipts_manager_tenant_read
  ON public.expense_claim_receipts FOR SELECT TO authenticated
  USING (public.is_live_session()
    AND EXISTS (
      SELECT 1 FROM public.expense_claims c
      WHERE c.id=expense_claim_receipts.claim_id
        AND c.tenant_id=expense_claim_receipts.tenant_id AND c.status='submitted'
    )
    AND (public.has_tenant_permission(tenant_id,'expenses.view')
      OR public.has_tenant_permission(tenant_id,'expenses.manage')));

DROP POLICY IF EXISTS hris_expense_receipts_employee_tenant_insert ON public.expense_claim_receipts;
CREATE POLICY hris_expense_receipts_employee_tenant_insert
  ON public.expense_claim_receipts FOR INSERT TO authenticated
  WITH CHECK (public.is_live_session()
    AND employee_id=public.hris_own_employee_for_tenant(tenant_id)
    AND (storage.foldername(storage_path))[1]=(SELECT auth.uid())::text
    AND (storage.foldername(storage_path))[2]=claim_id::text
    AND EXISTS (
      SELECT 1 FROM public.expense_claims c
      WHERE c.id=expense_claim_receipts.claim_id
        AND c.tenant_id=expense_claim_receipts.tenant_id
        AND c.employee_id=expense_claim_receipts.employee_id AND c.status='draft'
    )
    AND EXISTS (
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id='expense-receipts' AND o.name=storage_path
    ));

DROP POLICY IF EXISTS hris_expense_receipts_employee_tenant_delete ON public.expense_claim_receipts;
CREATE POLICY hris_expense_receipts_employee_tenant_delete
  ON public.expense_claim_receipts FOR DELETE TO authenticated
  USING (public.is_live_session()
    AND employee_id=public.hris_own_employee_for_tenant(tenant_id)
    AND EXISTS (
      SELECT 1 FROM public.expense_claims c
      WHERE c.id=expense_claim_receipts.claim_id
        AND c.tenant_id=expense_claim_receipts.tenant_id
        AND c.employee_id=expense_claim_receipts.employee_id AND c.status='draft'
    ));

-- Receipt objects belong to one active employee's draft in one tenant. These
-- permissive policies complement the legacy tenant-pin policies and never
-- broaden a file to an unrelated employee or organization.
DROP POLICY IF EXISTS hris_expense_objects_employee_tenant_read ON storage.objects;
CREATE POLICY hris_expense_objects_employee_tenant_read
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='expense-receipts' AND public.is_live_session()
    AND EXISTS (
      SELECT 1 FROM public.expense_claims c
      WHERE c.id::text=(storage.foldername(name))[2]
        AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
        AND c.employee_id=public.hris_own_employee_for_tenant(c.tenant_id)
    ));

DROP POLICY IF EXISTS hris_expense_objects_manager_tenant_read ON storage.objects;
CREATE POLICY hris_expense_objects_manager_tenant_read
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='expense-receipts' AND public.is_live_session()
    AND EXISTS (
      SELECT 1 FROM public.expense_claims c
      WHERE c.id::text=(storage.foldername(name))[2]
        AND c.status='submitted'
        AND (public.has_tenant_permission(c.tenant_id,'expenses.view')
          OR public.has_tenant_permission(c.tenant_id,'expenses.manage'))
    ));

DROP POLICY IF EXISTS hris_expense_objects_employee_tenant_insert ON storage.objects;
CREATE POLICY hris_expense_objects_employee_tenant_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='expense-receipts' AND public.is_live_session()
    AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.expense_claims c
      WHERE c.id::text=(storage.foldername(name))[2]
        AND c.employee_id=public.hris_own_employee_for_tenant(c.tenant_id)
        AND c.status='draft'
    ));

DROP POLICY IF EXISTS hris_expense_objects_employee_tenant_delete ON storage.objects;
CREATE POLICY hris_expense_objects_employee_tenant_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='expense-receipts' AND public.is_live_session()
    AND (storage.foldername(name))[1]=(SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.expense_claims c
      WHERE c.id::text=(storage.foldername(name))[2]
        AND c.employee_id=public.hris_own_employee_for_tenant(c.tenant_id)
        AND c.status='draft'
    ));

CREATE OR REPLACE FUNCTION public.hris_get_my_expense_context(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=pg_catalog,public,auth
AS $function$
DECLARE v_employee_id uuid; v_context jsonb;
BEGIN
  IF NOT public.is_live_session() OR p_tenant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'An active organization and employee session are required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'No active employee link exists for this organization.' USING errcode='42501';
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'employee_id',v_employee_id,
    'categories',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',ec.id,'name',ec.name) ORDER BY ec.name,ec.id)
      FROM public.expense_categories ec
      WHERE ec.tenant_id=p_tenant_id AND ec.active IS TRUE
    ),'[]'::jsonb),
    'claims',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',c.id,'employee_id',c.employee_id,'description',c.description,'category_id',c.category_id,'category',c.category,
        'claim_date',c.claim_date,'amount',c.amount,'currency',c.currency,'status',c.status,
        'created_at',c.created_at,'updated_at',c.updated_at,'submitted_at',c.submitted_at,
        'reviewed_at',c.reviewed_at,'review_note',c.review_note,'reopened_at',c.reopened_at,
        'receipts',COALESCE((
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id',r.id,'file_name',r.file_name,'mime_type',r.mime_type,'file_size',r.file_size,
            'storage_path',r.storage_path,'created_at',r.created_at
          ) ORDER BY r.created_at,r.id)
          FROM public.expense_claim_receipts r WHERE r.tenant_id=c.tenant_id AND r.claim_id=c.id
        ),'[]'::jsonb),
        'history',COALESCE((
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'previous_status',h.previous_status,'new_status',h.new_status,
            'note',h.note,'created_at',h.created_at
          ) ORDER BY h.created_at DESC,h.id DESC)
          FROM public.expense_claim_status_history h
          WHERE h.tenant_id=c.tenant_id AND h.claim_id=c.id
        ),'[]'::jsonb)
      ) ORDER BY c.created_at DESC,c.id)
      FROM public.expense_claims c
      WHERE c.tenant_id=p_tenant_id AND c.employee_id=v_employee_id
    ),'[]'::jsonb)
  ) INTO v_context;
  RETURN v_context;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hris_save_my_expense_draft(
  p_tenant_id uuid,p_id uuid,p_description text,p_category_id uuid,
  p_claim_date date,p_amount numeric,p_currency text
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,auth
AS $function$
DECLARE v_employee_id uuid; v_category_name text; v_currency text; v_id uuid;
BEGIN
  IF NOT public.is_live_session() OR p_tenant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'An active organization and employee session are required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'No active employee link exists for this organization.' USING errcode='42501';
  END IF;
  IF NULLIF(pg_catalog.btrim(COALESCE(p_description,'')),'') IS NULL
     OR pg_catalog.char_length(pg_catalog.btrim(p_description))>2000 THEN
    RAISE EXCEPTION 'A claim description of up to 2000 characters is required.' USING errcode='22023';
  END IF;
  IF p_amount IS NOT NULL AND (p_amount<=0 OR p_amount>999999999999.99 OR p_amount<>pg_catalog.round(p_amount,2)) THEN
    RAISE EXCEPTION 'Enter a positive amount with no more than two decimal places.' USING errcode='22023';
  END IF;
  v_currency := NULLIF(pg_catalog.upper(pg_catalog.btrim(COALESCE(p_currency,''))),'');
  IF v_currency IS NOT NULL AND v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Use a three-letter currency code.' USING errcode='22023';
  END IF;
  IF p_category_id IS NOT NULL THEN
    SELECT ec.name INTO v_category_name
    FROM public.expense_categories ec
    WHERE ec.id=p_category_id AND ec.tenant_id=p_tenant_id AND ec.active IS TRUE;
    IF v_category_name IS NULL THEN
      RAISE EXCEPTION 'Select an active company expense category.' USING errcode='22023';
    END IF;
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.expense_claims(tenant_id,employee_id,description,category_id,category,claim_date,amount,currency,status)
    VALUES(p_tenant_id,v_employee_id,pg_catalog.btrim(p_description),p_category_id,v_category_name,p_claim_date,p_amount,v_currency,'draft')
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.expense_claims c
    SET description=pg_catalog.btrim(p_description),category_id=p_category_id,category=v_category_name,
        claim_date=p_claim_date,amount=p_amount,currency=v_currency,updated_at=pg_catalog.now()
    WHERE c.id=p_id AND c.tenant_id=p_tenant_id AND c.employee_id=v_employee_id AND c.status='draft'
    RETURNING c.id INTO v_id;
  END IF;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Editable expense draft not found.' USING errcode='42501';
  END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hris_submit_my_expense_claim(p_tenant_id uuid,p_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,auth
AS $function$
DECLARE v_employee_id uuid; v_claim public.expense_claims%ROWTYPE; v_id uuid;
BEGIN
  IF NOT public.is_live_session() OR p_tenant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'An active organization and employee session are required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'No active employee link exists for this organization.' USING errcode='42501';
  END IF;
  SELECT c.* INTO v_claim FROM public.expense_claims c
  WHERE c.id=p_id AND c.tenant_id=p_tenant_id AND c.employee_id=v_employee_id AND c.status='draft'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Editable expense draft not found.' USING errcode='42501';
  END IF;
  IF v_claim.category_id IS NULL OR v_claim.claim_date IS NULL OR v_claim.amount IS NULL OR v_claim.currency IS NULL THEN
    RAISE EXCEPTION 'Select a category and enter the expense date, amount and currency before submission.' USING errcode='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.expense_categories ec
    WHERE ec.id=v_claim.category_id AND ec.tenant_id=p_tenant_id AND ec.active IS TRUE) THEN
    RAISE EXCEPTION 'The selected expense category is no longer active.' USING errcode='22023';
  END IF;
  UPDATE public.expense_claims c SET status='submitted',updated_at=pg_catalog.now()
  WHERE c.id=p_id AND c.tenant_id=p_tenant_id AND c.employee_id=v_employee_id AND c.status='draft'
  RETURNING c.id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Expense submission could not be completed.' USING errcode='42501';
  END IF;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hris_reopen_my_expense_claim(p_tenant_id uuid,p_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,auth
AS $function$
DECLARE v_employee_id uuid; v_id uuid;
BEGIN
  IF NOT public.is_live_session() OR p_tenant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'An active organization and employee session are required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'No active employee link exists for this organization.' USING errcode='42501';
  END IF;
  UPDATE public.expense_claims c
  SET status='draft',reopened_at=pg_catalog.now(),updated_at=pg_catalog.now()
  WHERE c.id=p_id AND c.tenant_id=p_tenant_id AND c.employee_id=v_employee_id AND c.status='rejected'
  RETURNING c.id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Rejected expense claim not found.' USING errcode='42501';
  END IF;
  RETURN v_id;
END;
$function$;

-- The permission gate is checked before this limited claimant/claim projection
-- so expenses.view users can identify a claimant without employees.view.
CREATE OR REPLACE FUNCTION public.hris_get_tenant_expense_claims(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $function$
DECLARE v_claims jsonb;
BEGIN
  IF NOT public.is_live_session() OR p_tenant_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
     OR NOT (public.has_tenant_permission(p_tenant_id,'expenses.view')
       OR public.has_tenant_permission(p_tenant_id,'expenses.manage')) THEN
    RAISE EXCEPTION 'Expense view access for this organization is required.' USING errcode='42501';
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',c.id,'employee_id',c.employee_id,'employee_name',e.full_name,
    'employee_number',e.employee_number,'description',c.description,'category',c.category,
    'claim_date',c.claim_date,'amount',c.amount,'currency',c.currency,'status',c.status,
    'created_at',c.created_at,'submitted_at',c.submitted_at,'review_note',c.review_note
  ) ORDER BY c.submitted_at,c.id),'[]'::jsonb)
  INTO v_claims
  FROM public.expense_claims c
  JOIN public.employees e ON e.id=c.employee_id AND e.tenant_id=c.tenant_id
  WHERE c.tenant_id=p_tenant_id AND c.status='submitted';
  RETURN v_claims;
END;
$function$;

-- The read-only manager queue is tenant-bound. Decision RPCs are deliberately
-- deferred until the approval-tier order and roles are approved.
REVOKE ALL ON FUNCTION public.hris_get_my_expense_context(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_save_my_expense_draft(uuid,uuid,text,uuid,date,numeric,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_submit_my_expense_claim(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_reopen_my_expense_claim(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_get_tenant_expense_claims(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_my_expense_context(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_save_my_expense_draft(uuid,uuid,text,uuid,date,numeric,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_submit_my_expense_claim(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_reopen_my_expense_claim(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_get_tenant_expense_claims(uuid) TO authenticated,service_role;

COMMIT;

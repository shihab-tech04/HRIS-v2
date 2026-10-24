-- Employee referral submission and tenant-scoped recruiter review.
-- The storage bucket is provisioned through the Supabase Storage API; this
-- migration defines the additive metadata contract and object RLS only.
BEGIN;

ALTER TABLE public.employee_referrals
  ADD COLUMN IF NOT EXISTS preferred_department_id uuid,
  ADD COLUMN IF NOT EXISTS candidate_profile_url text,
  ADD COLUMN IF NOT EXISTS referral_reason text,
  ADD COLUMN IF NOT EXISTS resume_storage_path text,
  ADD COLUMN IF NOT EXISTS resume_file_name text,
  ADD COLUMN IF NOT EXISTS resume_content_type text,
  ADD COLUMN IF NOT EXISTS resume_file_size bigint,
  ADD COLUMN IF NOT EXISTS status_updated_by uuid;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employee_referrals_preferred_department_id_fkey') THEN
    ALTER TABLE public.employee_referrals
      ADD CONSTRAINT employee_referrals_preferred_department_id_fkey
      FOREIGN KEY (preferred_department_id) REFERENCES public.departments(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employee_referrals_status_updated_by_fkey') THEN
    ALTER TABLE public.employee_referrals
      ADD CONSTRAINT employee_referrals_status_updated_by_fkey
      FOREIGN KEY (status_updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employee_referrals_candidate_profile_url_check') THEN
    ALTER TABLE public.employee_referrals
      ADD CONSTRAINT employee_referrals_candidate_profile_url_check
      CHECK (candidate_profile_url IS NULL OR
        (char_length(candidate_profile_url) <= 1000 AND candidate_profile_url ~* '^https?://[^[:space:]]+$'))
      NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employee_referrals_resume_metadata_check') THEN
    ALTER TABLE public.employee_referrals
      ADD CONSTRAINT employee_referrals_resume_metadata_check
      CHECK (
        (resume_storage_path IS NULL AND resume_file_name IS NULL AND resume_content_type IS NULL AND resume_file_size IS NULL)
        OR
        (resume_storage_path IS NOT NULL AND resume_file_name IS NOT NULL
          AND resume_content_type IS NOT NULL
          AND resume_content_type IN ('application/pdf','application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
          AND resume_file_size BETWEEN 1 AND 5242880)
      ) NOT VALID;
  END IF;
END;
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS employee_referrals_resume_storage_path_key
  ON public.employee_referrals(resume_storage_path)
  WHERE resume_storage_path IS NOT NULL;

ALTER TABLE public.employee_referrals ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.employee_referrals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.employee_referrals TO authenticated;

CREATE OR REPLACE FUNCTION public.hris_get_employee_referral_workspace(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_can_view boolean;
  v_can_manage boolean;
  v_referrals jsonb;
  v_jobs jsonb;
  v_departments jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'An active organization and sign-in are required.' USING errcode='42501';
  END IF;

  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  v_can_view := public.has_tenant_permission(p_tenant_id,'referrals.view')
    OR public.has_tenant_permission(p_tenant_id,'referrals.manage');
  v_can_manage := public.has_tenant_permission(p_tenant_id,'referrals.manage');
  IF v_employee_id IS NULL AND NOT v_can_view THEN
    RAISE EXCEPTION 'An employee record or referral-view membership in this organization is required.' USING errcode='42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'candidate_name',r.candidate_name,'candidate_email',r.candidate_email,
    'candidate_phone',r.candidate_phone,'relationship_note',r.relationship_note,
    'candidate_profile_url',r.candidate_profile_url,'referral_reason',r.referral_reason,
    'job_id',r.job_id,'job_title',j.title,'job_reference',j.reference_number,
    'preferred_department_id',r.preferred_department_id,'preferred_department',d.name,
    'resume_storage_path',r.resume_storage_path,'resume_file_name',r.resume_file_name,
    'resume_content_type',r.resume_content_type,'resume_file_size',r.resume_file_size,
    'status',r.status,'status_note',r.status_note,'status_updated_by',r.status_updated_by,
    'submitted_at',r.submitted_at,'updated_at',r.updated_at,
    'referrer_employee_id',e.id,'referrer_name',e.full_name,
    'referrer_employee_number',e.employee_number,'referrer_department',rd.name,
    'referrer_designation',des.title
  ) ORDER BY r.submitted_at DESC,r.id),'[]'::jsonb)
  INTO v_referrals
  FROM public.employee_referrals r
  JOIN public.employees e ON e.id=r.referrer_employee_id AND e.tenant_id=r.tenant_id
  LEFT JOIN public.jobs j ON j.id=r.job_id AND j.tenant_id=r.tenant_id
  LEFT JOIN public.departments d ON d.id=r.preferred_department_id AND d.tenant_id=r.tenant_id
  LEFT JOIN public.departments rd ON rd.id=e.department_id AND rd.tenant_id=r.tenant_id
  LEFT JOIN public.designations des ON des.id=e.designation_id AND des.tenant_id=r.tenant_id
  WHERE r.tenant_id=p_tenant_id
    AND (v_can_view OR r.referrer_employee_id=v_employee_id);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',j.id,'reference_number',j.reference_number,'title',j.title,
    'department_id',j.department_id,'department_name',j.department_name
  ) ORDER BY j.title,j.reference_number),'[]'::jsonb)
  INTO v_jobs
  FROM public.jobs j
  WHERE j.tenant_id=p_tenant_id AND j.is_published IS TRUE AND j.status='published'
    AND j.is_active IS TRUE AND (j.application_deadline IS NULL OR j.application_deadline>=current_date);

  SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name) ORDER BY d.name,d.id),'[]'::jsonb)
  INTO v_departments
  FROM public.departments d
  WHERE d.tenant_id=p_tenant_id AND d.active IS TRUE;

  RETURN jsonb_build_object(
    'tenant_id',p_tenant_id,'employee_id',v_employee_id,
    'can_review',v_can_manage,'referrals',coalesce(v_referrals,'[]'::jsonb),
    'jobs',coalesce(v_jobs,'[]'::jsonb),'departments',coalesce(v_departments,'[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.hris_submit_employee_referral(p_tenant_id uuid,p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE
  v_employee_id uuid;
  v_referral_id uuid;
  v_name text := nullif(btrim(p_payload->>'candidate_name'),'');
  v_email text := lower(nullif(btrim(p_payload->>'candidate_email'),''));
  v_phone text := nullif(btrim(p_payload->>'candidate_phone'),'');
  v_relationship text := nullif(btrim(p_payload->>'relationship_note'),'');
  v_profile_url text := nullif(btrim(p_payload->>'candidate_profile_url'),'');
  v_reason text := nullif(btrim(p_payload->>'referral_reason'),'');
  v_job_id uuid := nullif(p_payload->>'job_id','')::uuid;
  v_department_id uuid := nullif(p_payload->>'preferred_department_id','')::uuid;
  v_path text := nullif(btrim(p_payload->>'resume_path'),'');
  v_file_name text := nullif(btrim(p_payload->>'resume_file_name'),'');
  v_mime text;
  v_size bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE) THEN
    RAISE EXCEPTION 'An active organization and sign-in are required.' USING errcode='42501';
  END IF;
  v_employee_id := public.hris_own_employee_for_tenant(p_tenant_id);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'An active employee record in this organization is required.' USING errcode='42501';
  END IF;
  IF jsonb_typeof(p_payload)<>'object'
     OR v_name IS NULL OR length(v_name)>160
     OR v_email IS NULL OR length(v_email)>320
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR v_phone IS NOT NULL AND length(v_phone)>80
     OR v_relationship IS NULL OR length(v_relationship)>240
     OR v_profile_url IS NOT NULL AND (length(v_profile_url)>1000 OR v_profile_url !~* '^https?://[^[:space:]]+$')
     OR v_reason IS NOT NULL AND length(v_reason)>4000
     OR v_path IS NULL OR v_file_name IS NULL OR length(v_file_name)>255
     OR position('/' in v_file_name)>0 OR position(chr(92) in v_file_name)>0
     OR lower(v_path) !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+\.(pdf|doc|docx)$'
     OR split_part(v_path,'/',4)<>v_file_name
     OR (storage.foldername(v_path))[1]<>auth.uid()::text
     OR (storage.foldername(v_path))[2]<>p_tenant_id::text THEN
    RAISE EXCEPTION 'Enter the required referral details and attach a PDF or Word resume up to 5 MB.' USING errcode='22000';
  END IF;
  IF v_job_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.jobs j WHERE j.id=v_job_id AND j.tenant_id=p_tenant_id
      AND j.is_published IS TRUE AND j.status='published' AND j.is_active IS TRUE
      AND (j.application_deadline IS NULL OR j.application_deadline>=current_date)
  ) THEN
    RAISE EXCEPTION 'Select an open job in this organization.' USING errcode='22000';
  END IF;
  IF v_department_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.departments d WHERE d.id=v_department_id AND d.tenant_id=p_tenant_id AND d.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Select an active department in this organization.' USING errcode='22000';
  END IF;

  SELECT o.metadata->>'mimetype',
    CASE WHEN coalesce(o.metadata->>'size','') ~ '^[0-9]+$'
      THEN (o.metadata->>'size')::bigint ELSE NULL END
  INTO v_mime,v_size FROM storage.objects o
  WHERE o.bucket_id='employee-referral-files' AND o.name=v_path;
  IF NOT FOUND OR v_mime NOT IN ('application/pdf','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
     OR v_size IS NULL OR v_size<1 OR v_size>5242880
     OR lower(v_path) !~ (CASE v_mime
       WHEN 'application/pdf' THEN '\.pdf$'
       WHEN 'application/msword' THEN '\.doc$'
       ELSE '\.docx$'
     END) THEN
    RAISE EXCEPTION 'The uploaded resume is unavailable or does not match the accepted file type and size.' USING errcode='22000';
  END IF;

  INSERT INTO public.employee_referrals(
    tenant_id,referrer_employee_id,job_id,candidate_name,candidate_email,candidate_phone,
    relationship_note,cv_url,resume_storage_path,resume_file_name,resume_content_type,resume_file_size,
    candidate_profile_url,preferred_department_id,referral_reason,status,submitted_by
  ) VALUES (
    p_tenant_id,v_employee_id,v_job_id,v_name,v_email,v_phone,
    v_relationship,NULL,v_path,v_file_name,v_mime,v_size,
    v_profile_url,v_department_id,v_reason,'submitted',auth.uid()
  ) RETURNING id INTO v_referral_id;

  RETURN jsonb_build_object('id',v_referral_id,'status','submitted','submitted_at',now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.hris_mark_employee_referral_in_review(
  p_tenant_id uuid,p_referral_id uuid,p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $function$
DECLARE v_referral public.employee_referrals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_live_session()
     OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.is_active IS TRUE)
     OR NOT public.has_tenant_permission(p_tenant_id,'referrals.manage') THEN
    RAISE EXCEPTION 'Referral management access for this organization is required.' USING errcode='42501';
  END IF;
  IF p_note IS NOT NULL AND length(btrim(p_note))>2000 THEN
    RAISE EXCEPTION 'The review note must be 2,000 characters or fewer.' USING errcode='22000';
  END IF;

  UPDATE public.employee_referrals r
  SET status='in_review',status_note=nullif(btrim(coalesce(p_note,'')),''),
      status_updated_by=auth.uid(),updated_at=now()
  WHERE r.id=p_referral_id AND r.tenant_id=p_tenant_id AND r.status='submitted'
  RETURNING r.* INTO v_referral;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This referral is not available for review or is no longer awaiting review.' USING errcode='P0002';
  END IF;
  RETURN jsonb_build_object('id',v_referral.id,'status',v_referral.status,
    'status_note',v_referral.status_note,'updated_at',v_referral.updated_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.hris_get_employee_referral_workspace(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_submit_employee_referral(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.hris_mark_employee_referral_in_review(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hris_get_employee_referral_workspace(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_submit_employee_referral(uuid,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hris_mark_employee_referral_in_review(uuid,uuid,text) TO authenticated,service_role;

DROP POLICY IF EXISTS employee_referral_files_employee_insert ON storage.objects;
CREATE POLICY employee_referral_files_employee_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='employee-referral-files' AND public.is_live_session()
    AND (storage.foldername(storage.objects.name))[1]=(SELECT auth.uid())::text
    AND EXISTS (SELECT 1 FROM public.tenants t
      WHERE t.id::text=(storage.foldername(storage.objects.name))[2] AND t.is_active IS TRUE
        AND public.hris_own_employee_for_tenant(t.id) IS NOT NULL));

DROP POLICY IF EXISTS employee_referral_files_scoped_read ON storage.objects;
CREATE POLICY employee_referral_files_scoped_read
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='employee-referral-files' AND public.is_live_session()
    AND EXISTS (SELECT 1 FROM public.employee_referrals r
      WHERE r.tenant_id::text=(storage.foldername(storage.objects.name))[2] AND r.resume_storage_path=storage.objects.name
        AND (r.referrer_employee_id=public.hris_own_employee_for_tenant(r.tenant_id)
          OR public.has_tenant_permission(r.tenant_id,'referrals.view')
          OR public.has_tenant_permission(r.tenant_id,'referrals.manage'))));

DROP POLICY IF EXISTS employee_referral_files_employee_delete_unattached ON storage.objects;
CREATE POLICY employee_referral_files_employee_delete_unattached
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='employee-referral-files' AND public.is_live_session()
    AND (storage.foldername(storage.objects.name))[1]=(SELECT auth.uid())::text
    AND EXISTS (SELECT 1 FROM public.tenants t
      WHERE t.id::text=(storage.foldername(storage.objects.name))[2] AND t.is_active IS TRUE
        AND public.hris_own_employee_for_tenant(t.id) IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM public.employee_referrals r WHERE r.resume_storage_path=storage.objects.name));

COMMIT;

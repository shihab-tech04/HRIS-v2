-- The replacement project retains broad authenticated employee-document
-- upload/update/delete policies. PostgreSQL permissive policies are ORed, so
-- profile-specific permissive policies alone cannot restrict those paths.
-- These additive restrictive policies reserve the profile-certificates path
-- for the tenant/owner-scoped contract while leaving every other path to the
-- existing employee-document policies unchanged.
BEGIN;

CREATE POLICY employee_profile_certificate_insert_namespace_guard
  ON storage.objects AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IS DISTINCT FROM 'employee-documents'
    OR array_position(storage.foldername(name),'profile-certificates') IS NULL
    OR (
      bucket_id='employee-documents'
      AND public.is_live_session()
      AND split_part(name,'/',1)=(SELECT auth.uid())::text
      AND split_part(name,'/',3)='profile-certificates'
      AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/profile-certificates/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|png|jpg|jpeg)$'
      AND CASE
        WHEN split_part(name,'/',2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN public.hris_profile_change_active_member(split_part(name,'/',2)::uuid)
            AND public.hris_own_employee_for_tenant(split_part(name,'/',2)::uuid) IS NOT NULL
        ELSE FALSE
      END
    )
  );

-- Profile certificate replacement is unsupported. This also blocks an
-- existing broad employee_documents_own_update policy from bypassing the
-- profile insert restriction through Storage upsert or object moves.
CREATE POLICY employee_profile_certificate_update_namespace_guard
  ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (
    bucket_id IS DISTINCT FROM 'employee-documents'
    OR array_position(storage.foldername(name),'profile-certificates') IS NULL
  )
  WITH CHECK (
    bucket_id IS DISTINCT FROM 'employee-documents'
    OR array_position(storage.foldername(name),'profile-certificates') IS NULL
  );

CREATE POLICY employee_profile_certificate_delete_namespace_guard
  ON storage.objects AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (
    bucket_id IS DISTINCT FROM 'employee-documents'
    OR array_position(storage.foldername(name),'profile-certificates') IS NULL
    OR (
      bucket_id='employee-documents'
      AND public.is_live_session()
      AND split_part(name,'/',1)=(SELECT auth.uid())::text
      AND split_part(name,'/',3)='profile-certificates'
      AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/profile-certificates/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|png|jpg|jpeg)$'
      AND CASE
        WHEN split_part(name,'/',2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN public.hris_profile_change_active_member(split_part(name,'/',2)::uuid)
            AND public.hris_own_employee_for_tenant(split_part(name,'/',2)::uuid) IS NOT NULL
            AND private.hris_profile_document_is_unlinked(split_part(name,'/',2)::uuid,name)
        ELSE FALSE
      END
    )
  );

COMMIT;

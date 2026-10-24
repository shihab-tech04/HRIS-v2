-- READ ONLY: replacement HRIS release preflight for the pending Candidate RPC and
-- Super Admin invitation forward ports. Review every value before hosted DDL.
SELECT jsonb_build_object(
  'target_project', 'xfuxnljfrgvusbrpvxpa',
  'migration_head', (SELECT max(version) FROM supabase_migrations.schema_migrations),
  'forward_port_targets_missing',
    to_regprocedure('public.candidate_add_application_document(text,text,text,text)') IS NULL
    AND to_regprocedure('public.candidate_get_my_preboarding_handoff(uuid)') IS NULL
    AND to_regprocedure('public.candidate_save_my_preboarding_step(uuid,text,jsonb)') IS NULL
    AND to_regprocedure('public.hris_get_candidate_preboarding_queue(uuid)') IS NULL
    AND to_regprocedure('public.hris_get_recruitment_pipeline(uuid,text,text,integer,integer)') IS NULL,
  'invitation_targets_missing',
    to_regprocedure('public.platform_hris_create_tenant_invitation(text,text,text,text,text,text)') IS NULL
    AND to_regprocedure('public.platform_hris_mark_tenant_invitation_sent(uuid,uuid)') IS NULL
    AND to_regprocedure('public.platform_hris_mark_tenant_invitation_failed(uuid)') IS NULL
    AND to_regprocedure('public.platform_hris_accept_tenant_invitation(uuid)') IS NULL,
  'invitation_table_missing', to_regclass('private.platform_tenant_invitations') IS NULL,
  'guard_dependencies_present',
    to_regprocedure('public.is_live_session()') IS NOT NULL
    AND to_regprocedure('public.platform_hris_is_super_admin()') IS NOT NULL,
  'tenant_admin_role_configured', EXISTS (
    SELECT 1 FROM public.roles r
    JOIN public.role_permissions rp ON rp.role_id=r.id AND rp.permission_id='organization.manage'
    WHERE r.id='hr_admin' AND r.active IS TRUE
  ),
  'candidate_and_history_columns_present',
    (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='candidate_profiles'
      AND column_name IN ('user_id','tenant_id','profile_status','profile_data','updated_at'))=5
    AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='candidate_application_stage_history'
      AND column_name IN ('id','application_id','stage','created_at'))=4,
  'preboarding_columns_present',
    (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='onboarding_handoffs'
      AND column_name IN ('id','application_id','status','created_at','updated_at'))=5
    AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='job_offers'
      AND column_name IN ('application_id','status'))=2,
  'candidate_document_bucket_private', EXISTS (
    SELECT 1 FROM storage.buckets WHERE id='candidate-documents' AND public IS FALSE
  )
) AS release_preflight;

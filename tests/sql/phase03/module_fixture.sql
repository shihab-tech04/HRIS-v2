-- Lightweight optional-module tables for isolated PostgreSQL rehearsals.
-- Uses tests/sql/phase2a/fixture.sql as its preceding Auth/tenant fixture.
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
  EXECUTE pg_catalog.format('CREATE TABLE public.%I (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id),note text)',v_table);
 END LOOP;
END;
$setup$;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.travel_requests TO authenticated;
GRANT SELECT,INSERT ON public.expense_claims,public.expense_travel_links,
 public.learning_enrollments TO authenticated;
GRANT SELECT ON public.admin_audit_logs TO authenticated;
ALTER TABLE public.travel_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY synthetic_tenant_read ON public.travel_requests FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.tenant_memberships m
                WHERE m.tenant_id=travel_requests.tenant_id AND m.user_id=auth.uid()
                  AND m.status='active'));
CREATE POLICY synthetic_tenant_write ON public.travel_requests FOR ALL TO authenticated
 USING (EXISTS (SELECT 1 FROM public.tenant_memberships m
                WHERE m.tenant_id=travel_requests.tenant_id AND m.user_id=auth.uid()
                  AND m.status='active'))
 WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_memberships m
                WHERE m.tenant_id=travel_requests.tenant_id AND m.user_id=auth.uid()
                  AND m.status='active'));
GRANT SELECT ON public.tenant_memberships TO authenticated;
CREATE POLICY synthetic_member_read ON public.tenant_memberships FOR SELECT TO authenticated
 USING (user_id=auth.uid() AND status='active');
CREATE SCHEMA storage;
CREATE FUNCTION storage.foldername(p_path text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
 SELECT pg_catalog.string_to_array(pg_catalog.regexp_replace(p_path,'/[^/]+$',''),'/')
$$;
CREATE TABLE storage.objects(bucket_id text NOT NULL,name text NOT NULL,PRIMARY KEY(bucket_id,name));
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY synthetic_storage_permissive ON storage.objects FOR ALL TO authenticated
 USING (true) WITH CHECK (true);
INSERT INTO public.tenants(code,slug,name) VALUES('B','second-tenant','Second tenant');
INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
SELECT id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','hr_admin','active'
FROM public.tenants;
INSERT INTO public.travel_requests(tenant_id,note)
SELECT id,'historical travel' FROM public.tenants;
INSERT INTO public.expense_claims(tenant_id,note)
SELECT id,'historical expense' FROM public.tenants;
INSERT INTO public.learning_programs(tenant_id,note)
SELECT id,'historical learning' FROM public.tenants;
INSERT INTO public.learning_enrollments(tenant_id,note)
SELECT id,'historical enrollment' FROM public.tenants;
INSERT INTO storage.objects(bucket_id,name)
SELECT 'expense-receipts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/' || id::text || '/old.pdf'
 FROM public.expense_claims;
INSERT INTO storage.objects(bucket_id,name)
SELECT 'learning-completion-evidence','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/' || tenant_id::text || '/' || id::text || '/old.pdf'
 FROM public.learning_enrollments;

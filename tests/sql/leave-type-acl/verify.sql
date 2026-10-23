DO $verify$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.leave_types'::regclass) THEN
    RAISE EXCEPTION 'RLS must remain enabled';
  END IF;
  IF has_table_privilege('anon','public.leave_types','SELECT')
     OR has_table_privilege('anon','public.leave_types','INSERT')
     OR has_table_privilege('anon','public.leave_types','UPDATE')
     OR has_table_privilege('anon','public.leave_types','DELETE')
     OR has_table_privilege('anon','public.leave_types','TRUNCATE')
     OR has_table_privilege('anon','public.leave_types','REFERENCES')
     OR has_table_privilege('anon','public.leave_types','TRIGGER')
     OR has_table_privilege('anon','public.leave_types','MAINTAIN') THEN
    RAISE EXCEPTION 'anon must have no direct leave_types privilege';
  END IF;
  IF NOT has_table_privilege('authenticated','public.leave_types','SELECT') THEN
    RAISE EXCEPTION 'authenticated SELECT must remain available';
  END IF;
  IF has_table_privilege('authenticated','public.leave_types','INSERT')
     OR has_table_privilege('authenticated','public.leave_types','UPDATE')
     OR has_table_privilege('authenticated','public.leave_types','DELETE')
     OR has_table_privilege('authenticated','public.leave_types','TRUNCATE')
     OR has_table_privilege('authenticated','public.leave_types','REFERENCES')
     OR has_table_privilege('authenticated','public.leave_types','TRIGGER')
     OR has_table_privilege('authenticated','public.leave_types','MAINTAIN') THEN
    RAISE EXCEPTION 'authenticated leave_types access must be read-only';
  END IF;
  IF NOT has_table_privilege('service_role','public.leave_types','SELECT')
     OR NOT has_table_privilege('service_role','public.leave_types','INSERT')
     OR NOT has_table_privilege('service_role','public.leave_types','UPDATE')
     OR NOT has_table_privilege('service_role','public.leave_types','DELETE') THEN
    RAISE EXCEPTION 'service_role grants must remain unchanged';
  END IF;
END
$verify$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.tenant_id','11111111-1111-4111-8111-111111111111',false);
DO $tenant_read$
BEGIN
  IF (SELECT count(*) FROM public.leave_types) <> 1 THEN
    RAISE EXCEPTION 'authenticated read must preserve tenant A only';
  END IF;
END
$tenant_read$;

DO $denials$
BEGIN
  BEGIN
    EXECUTE $$INSERT INTO public.leave_types VALUES ('c3333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','unauthorized')$$;
    RAISE EXCEPTION 'authenticated INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE $$UPDATE public.leave_types SET name='unauthorized' WHERE id='a1111111-1111-4111-8111-111111111111'$$;
    RAISE EXCEPTION 'authenticated UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE $$DELETE FROM public.leave_types WHERE id='a1111111-1111-4111-8111-111111111111'$$;
    RAISE EXCEPTION 'authenticated DELETE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE $$TRUNCATE TABLE public.leave_types$$;
    RAISE EXCEPTION 'authenticated TRUNCATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$denials$;
RESET ROLE;

SET ROLE anon;
DO $anonymous_denials$
BEGIN
  BEGIN
    EXECUTE $$INSERT INTO public.leave_types VALUES ('d4444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','unauthorized')$$;
    RAISE EXCEPTION 'anon INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE $$UPDATE public.leave_types SET name='unauthorized' WHERE id='a1111111-1111-4111-8111-111111111111'$$;
    RAISE EXCEPTION 'anon UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE $$DELETE FROM public.leave_types WHERE id='a1111111-1111-4111-8111-111111111111'$$;
    RAISE EXCEPTION 'anon DELETE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE $$TRUNCATE TABLE public.leave_types$$;
    RAISE EXCEPTION 'anon TRUNCATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$anonymous_denials$;
RESET ROLE;

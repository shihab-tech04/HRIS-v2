-- The employee app now reads address rows through the self-scoped RLS policy.
-- Remove the temporary public-schema SECURITY DEFINER getter after that policy
-- is installed and the direct-read app is deployed.
DROP FUNCTION IF EXISTS public.employee_get_my_addresses_v2();

-- Reproduce the explicit client ACLs currently observed on hosted leave_types.
-- This runs only in the empty disposable Supabase stack before the forward fix.
GRANT ALL PRIVILEGES ON TABLE public.leave_types TO PUBLIC, anon, authenticated;

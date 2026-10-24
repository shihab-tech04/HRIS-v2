-- E02-03 / E02-17: private storage for employee profile corrections.
-- The tenant-scoped authorization and RPC contract is installed by the
-- immediately following 20261017100000 migration. With RLS enabled and no
-- policy yet, this table fails closed while a migration sequence is in flight.
BEGIN;

CREATE TABLE public.employee_profile_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_key text NOT NULL CHECK (field_key IN (
    'full_name', 'official_email', 'personal_email', 'official_phone',
    'address', 'mailing_address', 'emergency_contact_name',
    'emergency_contact_phone', 'emergency_contact_relation',
    'father_name', 'mother_name', 'birthplace', 'blood_group', 'religion',
    'nid_number', 'passport_number', 'etin_number'
  )),
  requested_value text NOT NULL CHECK (length(btrim(requested_value)) BETWEEN 1 AND 500),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_profile_change_resolution_consistency CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('approved', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX employee_profile_change_one_pending_per_field
  ON public.employee_profile_change_requests(tenant_id, employee_id, field_key)
  WHERE status = 'pending';
CREATE INDEX employee_profile_change_employee_history
  ON public.employee_profile_change_requests(tenant_id, employee_id, submitted_at DESC);
CREATE INDEX employee_profile_change_pending_review
  ON public.employee_profile_change_requests(tenant_id, submitted_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.employee_profile_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.employee_profile_change_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, tenant_id, employee_id, requested_by, field_key, reason, status,
  submitted_at, reviewed_by, reviewed_at, review_note, created_at, updated_at
) ON TABLE public.employee_profile_change_requests TO authenticated;

COMMIT;

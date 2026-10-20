-- Disposable PostgreSQL 17 only. Schema shapes read from production; all identities/data below are synthetic.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE SCHEMA storage;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
CREATE TABLE public."admin_audit_logs" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
actor_id uuid,
action text NOT NULL,
target_type text NOT NULL,
target_id text,
details jsonb NOT NULL DEFAULT '{}'::jsonb,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."admin_audit_logs" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."admin_users" (
user_id uuid NOT NULL,
display_name text,
active boolean NOT NULL DEFAULT true,
is_super_admin boolean NOT NULL DEFAULT false,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."admin_users" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."attendance_correction_settings" (
tenant_id uuid NOT NULL,
employee_can_edit_pending boolean NOT NULL DEFAULT false,
employee_can_cancel_pending boolean NOT NULL DEFAULT false,
evidence_required boolean NOT NULL DEFAULT false,
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."attendance_correction_settings" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."attendance_corrections" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
attendance_date date NOT NULL,
requested_check_in timestamp with time zone,
requested_check_out timestamp with time zone,
requested_work_mode text,
client_name text,
reason text NOT NULL,
status text NOT NULL DEFAULT 'pending'::text,
requested_by uuid,
requested_at timestamp with time zone NOT NULL DEFAULT now(),
resolved_by uuid,
resolved_at timestamp with time zone,
resolution_note text,
evidence_path text
);
ALTER TABLE public."attendance_corrections" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."attendance_records" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
attendance_date date NOT NULL,
check_in timestamp with time zone,
check_out timestamp with time zone,
work_mode text NOT NULL DEFAULT 'office'::text,
client_name text,
status text NOT NULL DEFAULT 'present'::text,
source text NOT NULL DEFAULT 'system'::text,
remarks text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."attendance_records" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."candidate_application_drafts" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
candidate_user_id uuid NOT NULL,
job_id uuid NOT NULL,
current_step integer NOT NULL DEFAULT 1,
draft_data jsonb NOT NULL DEFAULT '{}'::jsonb,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."candidate_application_drafts" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."candidate_application_stage_history" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
application_id uuid NOT NULL,
stage text NOT NULL,
note text,
actor_type text NOT NULL,
actor_user_id uuid,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."candidate_application_stage_history" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."candidate_assessments" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
application_id uuid NOT NULL,
title text NOT NULL,
assessment_type text NOT NULL,
instructions text NOT NULL,
attachment_path text,
deadline_date date NOT NULL,
status text NOT NULL DEFAULT 'pending'::text,
submission_data jsonb,
submitted_at timestamp with time zone,
reviewed_at timestamp with time zone,
created_by uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
review_note text,
reviewed_by uuid
);
ALTER TABLE public."candidate_assessments" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."candidate_cvs" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
candidate_user_id uuid NOT NULL,
title text NOT NULL,
is_default boolean NOT NULL DEFAULT false,
sections jsonb NOT NULL DEFAULT '{"skills": true, "contact": true, "summary": true, "projects": true, "education": true, "languages": true, "experience": true, "references": true, "certifications": true}'::jsonb,
section_order text[] NOT NULL DEFAULT ARRAY['summary'::text, 'experience'::text, 'education'::text, 'skills'::text, 'certifications'::text, 'projects'::text, 'languages'::text, 'references'::text],
custom_summary text,
document_url text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."candidate_cvs" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."candidate_document_requests" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
application_id uuid NOT NULL,
document_title text NOT NULL,
description text NOT NULL DEFAULT ''::text,
due_date date NOT NULL,
status text NOT NULL DEFAULT 'pending'::text,
submitted_file_name text,
submitted_file_path text,
submitted_at timestamp with time zone,
verified_at timestamp with time zone,
created_by uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
verification_note text,
verified_by uuid
);
ALTER TABLE public."candidate_document_requests" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."candidate_job_alerts" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
candidate_user_id uuid NOT NULL,
title text NOT NULL,
keywords text,
department text,
location text,
workplace_type text,
employment_type text,
frequency text NOT NULL DEFAULT 'Instant'::text,
is_active boolean NOT NULL DEFAULT true,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."candidate_job_alerts" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."candidate_job_changes" (
tenant_id uuid NOT NULL,
changed_at timestamp with time zone NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public."candidate_job_changes" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."candidate_notifications" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
candidate_user_id uuid NOT NULL,
title text NOT NULL,
message text NOT NULL,
notification_type text NOT NULL DEFAULT 'system'::text,
related_application_id uuid,
related_job_id uuid,
action_view text,
is_read boolean NOT NULL DEFAULT false,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."candidate_notifications" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."candidate_profiles" (
user_id uuid NOT NULL,
email text NOT NULL,
full_name text,
phone text,
profile_status text NOT NULL DEFAULT 'active'::text,
onboarding_completed boolean NOT NULL DEFAULT false,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
current_location text,
years_experience numeric(6,2),
headline text,
bio text,
skills text[] NOT NULL DEFAULT '{}'::text[],
profile_data jsonb NOT NULL DEFAULT '{}'::jsonb,
tenant_id uuid NOT NULL DEFAULT synesis_tenant_id()
);
ALTER TABLE public."candidate_profiles" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."candidate_saved_jobs" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
candidate_user_id uuid NOT NULL,
job_id uuid NOT NULL,
saved_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."candidate_saved_jobs" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."confirmation_reviews" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
status text NOT NULL DEFAULT 'pending'::text,
review_due_date date,
decision_note text,
resolved_by uuid,
resolved_at timestamp with time zone,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."confirmation_reviews" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."departments" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
location_id uuid,
name text NOT NULL,
code text NOT NULL,
description text,
active boolean NOT NULL DEFAULT true,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."departments" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."designation_skill_requirements" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
designation_id uuid NOT NULL,
skill_name text NOT NULL,
required_proficiency text,
career_visible boolean NOT NULL DEFAULT false,
created_by uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."designation_skill_requirements" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."designations" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
department_id uuid,
grade_id uuid,
title text NOT NULL,
code text NOT NULL,
active boolean NOT NULL DEFAULT true,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."designations" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."employee_addresses" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
employee_id uuid NOT NULL,
address_type text NOT NULL,
district text,
thana text,
post_code text,
city_village text,
road_block_house text,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."employee_addresses" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."employee_certifications" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
employee_id uuid NOT NULL,
title text NOT NULL,
institute_name text,
issued_by text,
certification_number text,
license_number text,
issue_date date,
expiry_date date,
year text,
duration text,
summary text,
certificate_document_url text,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."employee_certifications" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."employee_comp_time_ledger" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
source_overtime_request_id uuid,
hours numeric(8,2) NOT NULL,
entry_type text NOT NULL,
note text,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."employee_comp_time_ledger" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."employee_compensation" (
employee_id uuid NOT NULL,
basic_salary numeric NOT NULL DEFAULT 0,
house_rent_allowance numeric NOT NULL DEFAULT 0,
medical_allowance numeric NOT NULL DEFAULT 0,
transport_allowance numeric NOT NULL DEFAULT 0,
special_allowance numeric NOT NULL DEFAULT 0,
currency text NOT NULL DEFAULT 'BDT'::text,
bank_name text,
bank_account_no text,
tax_identification_no text,
effective_date date NOT NULL DEFAULT CURRENT_DATE,
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."employee_compensation" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."employee_documents" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
employee_id uuid NOT NULL,
name text NOT NULL,
document_type text NOT NULL,
file_url text NOT NULL,
uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
expires_at date,
verified boolean NOT NULL DEFAULT false,
verification_status text NOT NULL DEFAULT 'pending'::text,
verification_note text,
reviewed_at timestamp with time zone,
reviewed_by uuid
);
ALTER TABLE public."employee_documents" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."employee_education" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
employee_id uuid NOT NULL,
education_level text,
subject_major text,
degree_title text,
institution text NOT NULL,
result_type text,
result text,
starting_year integer,
passing_year integer,
duration text,
achievements text,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."employee_education" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."employee_experience" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
employee_id uuid NOT NULL,
company text NOT NULL,
role_title text NOT NULL,
department text,
office_address text,
joining_date date,
departure_date date,
currently_working boolean NOT NULL DEFAULT false,
total_duration text,
description text,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."employee_experience" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."employee_family_members" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
employee_id uuid NOT NULL,
name text NOT NULL,
phone text,
nid_number text,
date_of_birth date,
relationship text,
present_address text,
permanent_address text,
is_nominee boolean NOT NULL DEFAULT false,
working_in_synesis boolean NOT NULL DEFAULT false,
occupation text,
academic_qualification text,
blood_group text,
gender text,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."employee_family_members" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."employee_leave_balances" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
leave_type_id uuid NOT NULL,
balance_year integer NOT NULL,
opening_days numeric(7,2) NOT NULL DEFAULT 0,
allocated_days numeric(7,2) NOT NULL DEFAULT 0,
used_days numeric(7,2) NOT NULL DEFAULT 0,
pending_days numeric(7,2) NOT NULL DEFAULT 0,
adjusted_days numeric(7,2) NOT NULL DEFAULT 0,
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."employee_leave_balances" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."employee_lifecycle_events" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
employee_id uuid NOT NULL,
event_type text NOT NULL,
event_date date NOT NULL DEFAULT CURRENT_DATE,
title text NOT NULL,
description text,
from_value text,
to_value text,
performed_by uuid,
effective_date date NOT NULL,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."employee_lifecycle_events" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."employee_notifications" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
notification_type text NOT NULL,
title text NOT NULL,
body text NOT NULL,
related_type text,
related_id uuid,
read_at timestamp with time zone,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."employee_notifications" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."employee_professional_links" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
employee_id uuid NOT NULL,
label text NOT NULL,
url text NOT NULL,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."employee_professional_links" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."employee_profile_change_requests" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
requested_by uuid NOT NULL,
field_key text NOT NULL,
requested_value text NOT NULL,
reason text NOT NULL,
status text NOT NULL DEFAULT 'pending'::text,
submitted_at timestamp with time zone NOT NULL DEFAULT now(),
reviewed_by uuid,
reviewed_at timestamp with time zone,
review_note text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."employee_profile_change_requests" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."employee_referrals" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
referrer_employee_id uuid NOT NULL,
job_id uuid,
candidate_name text NOT NULL,
candidate_email text NOT NULL,
candidate_phone text,
relationship_note text,
cv_url text,
status text NOT NULL DEFAULT 'submitted'::text,
status_note text,
submitted_by uuid,
submitted_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."employee_referrals" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."employee_shift_assignments" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
shift_id uuid NOT NULL,
assignment_date date NOT NULL,
status text NOT NULL DEFAULT 'scheduled'::text,
created_by uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."employee_shift_assignments" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."employee_skills" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
employee_id uuid NOT NULL,
skill_name text NOT NULL,
proficiency text,
verified boolean NOT NULL DEFAULT false,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."employee_skills" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."employee_training" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
employee_id uuid NOT NULL,
title text NOT NULL,
institute_name text NOT NULL,
training_number text,
start_date date,
end_date date,
year text,
duration text,
summary text,
certificate_url text,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."employee_training" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."employees" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_number text NOT NULL,
user_id uuid,
full_name text NOT NULL,
preferred_name text,
official_email text NOT NULL,
phone text,
avatar_url text,
gender text,
date_of_birth date,
joining_date date NOT NULL,
employment_type text NOT NULL DEFAULT 'full_time'::text,
employment_status text NOT NULL DEFAULT 'active'::text,
department_id uuid,
team_id uuid,
designation_id uuid,
grade_id uuid,
reporting_manager_id uuid,
work_location_id uuid,
shift_id uuid,
probation_end_date date,
confirmation_date date,
notice_period_days integer NOT NULL DEFAULT 30,
resignation_date date,
last_working_date date,
address text,
emergency_contact_name text,
emergency_contact_phone text,
emergency_contact_relation text,
father_name text,
mother_name text,
birthplace text,
blood_group text,
religion text,
nationality text,
marital_status text,
personal_email text,
official_phone text,
nid_number text,
passport_number text,
etin_number text,
bank_branch_name text,
bank_routing_number text,
bank_account_name text,
mailing_address text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."employees" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."expense_categories" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
name text NOT NULL,
active boolean NOT NULL DEFAULT true,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."expense_categories" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."expense_claim_receipts" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
claim_id uuid NOT NULL,
employee_id uuid NOT NULL,
storage_path text NOT NULL,
file_name text NOT NULL,
mime_type text NOT NULL,
file_size bigint NOT NULL,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."expense_claim_receipts" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."expense_claim_status_history" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
claim_id uuid NOT NULL,
actor_user_id uuid,
previous_status text,
new_status text NOT NULL,
note text,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."expense_claim_status_history" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."expense_claims" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
description text NOT NULL,
category text,
claim_date date,
amount numeric(14,2),
currency character varying(3),
status text NOT NULL DEFAULT 'draft'::text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
category_id uuid,
submitted_at timestamp with time zone,
reviewed_by uuid,
reviewed_at timestamp with time zone,
review_note text,
reopened_at timestamp with time zone
);
ALTER TABLE public."expense_claims" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."expense_travel_links" (
claim_id uuid NOT NULL,
travel_request_id uuid NOT NULL,
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
linked_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."expense_travel_links" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."feedback_360_cycles" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
name text NOT NULL,
start_date date NOT NULL,
end_date date NOT NULL,
criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
anonymous boolean NOT NULL DEFAULT true,
status text NOT NULL DEFAULT 'draft'::text,
released_at timestamp with time zone,
created_by uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."feedback_360_cycles" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."feedback_360_requests" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
cycle_id uuid NOT NULL,
subject_employee_id uuid NOT NULL,
reviewer_employee_id uuid NOT NULL,
relationship text NOT NULL,
answers jsonb NOT NULL DEFAULT '[]'::jsonb,
overall_comment text,
status text NOT NULL DEFAULT 'pending'::text,
submitted_at timestamp with time zone,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."feedback_360_requests" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."grades" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
name text NOT NULL,
code text NOT NULL,
rank integer NOT NULL DEFAULT 1,
min_salary numeric,
max_salary numeric,
active boolean NOT NULL DEFAULT true,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."grades" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."holidays" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
name text NOT NULL,
start_date date NOT NULL,
end_date date NOT NULL,
holiday_type text NOT NULL DEFAULT 'general'::text,
description text,
active boolean NOT NULL DEFAULT true,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."holidays" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."hr_policies" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
title text NOT NULL,
category text NOT NULL DEFAULT 'policy'::text,
version text,
effective_date date,
content text,
attachment_url text,
active boolean NOT NULL DEFAULT true,
published_at timestamp with time zone,
created_by uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."hr_policies" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."interviews" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
application_id uuid NOT NULL,
scheduled_at timestamp with time zone NOT NULL,
interview_type text NOT NULL DEFAULT 'interview'::text,
location_or_link text,
panel_notes text,
status text NOT NULL DEFAULT 'scheduled'::text,
created_by uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
candidate_response text NOT NULL DEFAULT 'invited'::text,
candidate_response_note text,
candidate_proposed_times text,
candidate_responded_at timestamp with time zone,
duration_minutes integer NOT NULL DEFAULT 60,
timezone text NOT NULL DEFAULT 'Asia/Dhaka'::text,
instructions text,
panel_members text[] NOT NULL DEFAULT '{}'::text[]
);
ALTER TABLE public."interviews" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."job_applications" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
job_id uuid NOT NULL,
candidate_user_id uuid NOT NULL,
full_name text NOT NULL,
email text NOT NULL,
phone text,
years_experience numeric(6,2),
skills text[] NOT NULL DEFAULT '{}'::text[],
cv_url text,
cover_letter text,
stage text NOT NULL DEFAULT 'applied'::text,
status_note text,
applied_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
application_data jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public."job_applications" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."job_offers" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
application_id uuid NOT NULL,
offered_title text,
salary_amount numeric,
salary_currency text NOT NULL DEFAULT 'BDT'::text,
proposed_joining_date date,
terms text,
status text NOT NULL DEFAULT 'issued'::text,
issued_by uuid,
issued_at timestamp with time zone NOT NULL DEFAULT now(),
responded_at timestamp with time zone,
response_deadline date,
response_note text,
acceptance_signature text,
pay_period text NOT NULL DEFAULT 'Monthly'::text
);
ALTER TABLE public."job_offers" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."jobs" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
reference_number text NOT NULL,
title text NOT NULL,
department_name text,
team_name text,
location_name text,
workplace_type text NOT NULL,
employment_type text NOT NULL,
experience_level text DEFAULT 'mid'::text,
vacancy_count integer NOT NULL DEFAULT 1,
min_experience_years numeric(4,1) NOT NULL DEFAULT 0,
education_requirement text DEFAULT ''::text,
skills text[] NOT NULL DEFAULT '{}'::text[],
responsibilities text[] NOT NULL DEFAULT '{}'::text[],
requirements text[] NOT NULL DEFAULT '{}'::text[],
benefits text[] NOT NULL DEFAULT '{}'::text[],
salary_currency text NOT NULL DEFAULT 'BDT'::text,
salary_min numeric(14,2),
salary_max numeric(14,2),
is_salary_published boolean NOT NULL DEFAULT false,
posted_date date,
application_deadline date,
required_documents text[] NOT NULL DEFAULT '{}'::text[],
screening_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
instructions text,
status text NOT NULL DEFAULT 'draft'::text,
is_published boolean NOT NULL DEFAULT false,
is_active boolean NOT NULL DEFAULT true,
published_at timestamp with time zone,
created_by uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
requisition_id uuid,
department_id uuid,
team_id uuid,
designation_id uuid,
location_id uuid
);
ALTER TABLE public."jobs" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."learning_enrollments" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
program_id uuid NOT NULL,
session_id uuid,
source text NOT NULL,
status text NOT NULL,
mandatory boolean NOT NULL DEFAULT false,
due_date date,
recommendation_reason text,
skill_gap text,
requested_at timestamp with time zone,
resolved_at timestamp with time zone,
resolution_note text,
completed_at timestamp with time zone,
certificate_url text,
created_by uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."learning_enrollments" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."learning_programs" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
title text NOT NULL,
description text,
category text,
provider text,
delivery_mode text NOT NULL DEFAULT 'in_person'::text,
duration_hours numeric(8,2),
self_enrollment boolean NOT NULL DEFAULT false,
target_skills text[] NOT NULL DEFAULT '{}'::text[],
active boolean NOT NULL DEFAULT true,
created_by uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."learning_programs" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."learning_sessions" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
program_id uuid NOT NULL,
trainer_name text,
start_at timestamp with time zone,
end_at timestamp with time zone,
location text,
meeting_url text,
capacity integer,
enrollment_deadline timestamp with time zone,
status text NOT NULL DEFAULT 'scheduled'::text,
created_by uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."learning_sessions" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."leave_requests" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
leave_type_id uuid NOT NULL,
from_date date NOT NULL,
to_date date NOT NULL,
requested_days numeric(7,2) NOT NULL,
reason text NOT NULL,
attachment_url text,
status text NOT NULL DEFAULT 'pending'::text,
submitted_by uuid,
submitted_at timestamp with time zone NOT NULL DEFAULT now(),
resolved_by uuid,
resolved_at timestamp with time zone,
resolution_note text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
day_portion text NOT NULL DEFAULT 'full'::text
);
ALTER TABLE public."leave_requests" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."leave_types" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
name text NOT NULL,
code text NOT NULL,
description text,
annual_entitlement numeric(6,2),
is_paid boolean NOT NULL DEFAULT true,
allow_carry_forward boolean NOT NULL DEFAULT false,
max_carry_forward_days numeric(6,2),
requires_document_proof boolean NOT NULL DEFAULT false,
min_days_notice integer,
applicable_gender text,
active boolean NOT NULL DEFAULT true,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."leave_types" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."manpower_requisitions" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
reference_number text NOT NULL,
title text NOT NULL,
department_id uuid,
designation_id uuid,
employment_type text NOT NULL DEFAULT 'full_time'::text,
project_name text,
required_positions integer NOT NULL DEFAULT 1,
desired_joining_date date,
years_experience numeric(5,2),
education_qualifications text,
certifications text,
job_description text,
reason text,
status text NOT NULL DEFAULT 'pending'::text,
requested_by uuid,
requested_at timestamp with time zone NOT NULL DEFAULT now(),
resolved_by uuid,
resolved_at timestamp with time zone,
resolution_note text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."manpower_requisitions" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."notices" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
title text NOT NULL,
category text NOT NULL DEFAULT 'general'::text,
body text NOT NULL,
audience_type text NOT NULL DEFAULT 'all'::text,
audience_id uuid,
attachment_url text,
pinned boolean NOT NULL DEFAULT false,
active boolean NOT NULL DEFAULT true,
published_at timestamp with time zone NOT NULL DEFAULT now(),
created_by uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."notices" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."onboarding_handoffs" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
application_id uuid NOT NULL,
status text NOT NULL DEFAULT 'pending'::text,
notes text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."onboarding_handoffs" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."org_locations" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
name text NOT NULL,
code text NOT NULL,
address text,
timezone text NOT NULL DEFAULT 'Asia/Dhaka'::text,
active boolean NOT NULL DEFAULT true,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."org_locations" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."overtime_requests" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
overtime_date date NOT NULL,
requested_hours numeric(6,2) NOT NULL,
approved_hours numeric(6,2),
reason text NOT NULL,
status text NOT NULL DEFAULT 'pending'::text,
compensation_mode text NOT NULL,
approved_pay_amount numeric(14,2),
payroll_pay_period_id uuid,
submitted_by uuid,
submitted_at timestamp with time zone NOT NULL DEFAULT now(),
resolved_by uuid,
resolved_at timestamp with time zone,
resolution_note text
);
ALTER TABLE public."overtime_requests" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."overtime_settings" (
tenant_id uuid NOT NULL,
employee_can_submit boolean NOT NULL DEFAULT false,
compensation_mode text NOT NULL DEFAULT 'payroll'::text,
max_hours_per_day numeric(6,2),
updated_by uuid,
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."overtime_settings" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."pay_periods" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
name text NOT NULL,
start_date date NOT NULL,
end_date date NOT NULL,
pay_date date,
status text NOT NULL DEFAULT 'draft'::text,
currency text NOT NULL DEFAULT 'BDT'::text,
created_by uuid,
released_by uuid,
released_at timestamp with time zone,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."pay_periods" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."payslips" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
pay_period_id uuid NOT NULL,
employee_id uuid NOT NULL,
currency text NOT NULL DEFAULT 'BDT'::text,
basic_salary numeric(14,2) NOT NULL DEFAULT 0,
house_rent_allowance numeric(14,2) NOT NULL DEFAULT 0,
medical_allowance numeric(14,2) NOT NULL DEFAULT 0,
transport_allowance numeric(14,2) NOT NULL DEFAULT 0,
special_allowance numeric(14,2) NOT NULL DEFAULT 0,
overtime_pay numeric(14,2) NOT NULL DEFAULT 0,
bonus numeric(14,2) NOT NULL DEFAULT 0,
tax_deduction numeric(14,2) NOT NULL DEFAULT 0,
provident_fund_deduction numeric(14,2) NOT NULL DEFAULT 0,
leave_without_pay_deduction numeric(14,2) NOT NULL DEFAULT 0,
other_deductions numeric(14,2) NOT NULL DEFAULT 0,
gross_earnings numeric(14,2) DEFAULT ((((((basic_salary + house_rent_allowance) + medical_allowance) + transport_allowance) + special_allowance) + overtime_pay) + bonus),
total_deductions numeric(14,2) DEFAULT (((tax_deduction + provident_fund_deduction) + leave_without_pay_deduction) + other_deductions),
net_salary numeric(14,2) DEFAULT ((((((((((basic_salary + house_rent_allowance) + medical_allowance) + transport_allowance) + special_allowance) + overtime_pay) + bonus) - tax_deduction) - provident_fund_deduction) - leave_without_pay_deduction) - other_deductions),
bank_name text,
bank_account_no text,
tax_identification_no text,
status text NOT NULL DEFAULT 'draft'::text,
note text,
released_at timestamp with time zone,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."payslips" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."performance_appraisals" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
cycle_id uuid NOT NULL,
employee_id uuid NOT NULL,
reviewer_employee_id uuid,
self_scores jsonb NOT NULL DEFAULT '[]'::jsonb,
self_goal_comments jsonb NOT NULL DEFAULT '[]'::jsonb,
self_overall_comment text,
self_submitted_at timestamp with time zone,
manager_scores jsonb NOT NULL DEFAULT '[]'::jsonb,
manager_overall_comment text,
manager_rating numeric(3,2),
manager_reviewed_at timestamp with time zone,
final_rating numeric(3,2),
final_feedback text,
finalized_at timestamp with time zone,
released_at timestamp with time zone,
acknowledged_at timestamp with time zone,
status text NOT NULL DEFAULT 'draft'::text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."performance_appraisals" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."performance_cycle_criteria" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
cycle_id uuid NOT NULL,
title text NOT NULL,
weight numeric(5,2) NOT NULL,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."performance_cycle_criteria" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."performance_cycles" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
name text NOT NULL,
start_date date NOT NULL,
end_date date NOT NULL,
self_review_deadline date,
manager_review_deadline date,
status text NOT NULL DEFAULT 'upcoming'::text,
created_by uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."performance_cycles" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."performance_goal_history" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
goal_id uuid NOT NULL,
changed_by uuid,
changed_at timestamp with time zone NOT NULL DEFAULT now(),
old_value jsonb,
new_value jsonb
);
ALTER TABLE public."performance_goal_history" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."performance_goal_settings" (
tenant_id uuid NOT NULL,
employee_can_create_personal boolean NOT NULL DEFAULT false,
updated_by uuid,
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."performance_goal_settings" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."performance_goal_updates" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
goal_id uuid NOT NULL,
employee_id uuid NOT NULL,
update_type text NOT NULL,
progress numeric,
comment text,
evidence_url text,
created_by_user uuid,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."performance_goal_updates" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."performance_goals" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
cycle_id uuid,
title text NOT NULL,
description text NOT NULL DEFAULT ''::text,
category text NOT NULL,
target_metric text NOT NULL,
current_progress numeric(5,2) NOT NULL DEFAULT 0,
due_date date,
status text NOT NULL DEFAULT 'not_started'::text,
weight numeric(5,2) NOT NULL DEFAULT 0,
created_by uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
origin text NOT NULL DEFAULT 'assigned'::text
);
ALTER TABLE public."performance_goals" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."performance_improvement_plans" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
manager_employee_id uuid,
title text NOT NULL,
objectives jsonb NOT NULL DEFAULT '[]'::jsonb,
review_points jsonb NOT NULL DEFAULT '[]'::jsonb,
start_date date NOT NULL,
end_date date NOT NULL,
status text NOT NULL DEFAULT 'active'::text,
final_outcome text,
final_outcome_at timestamp with time zone,
created_by uuid,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."performance_improvement_plans" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."performance_improvement_updates" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
plan_id uuid NOT NULL,
actor_employee_id uuid,
update_type text NOT NULL,
comment text NOT NULL,
evidence_url text,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."performance_improvement_updates" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."permissions" (
id text NOT NULL,
module text NOT NULL,
action text NOT NULL,
description text,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."permissions" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."policy_acknowledgements" (
policy_id uuid NOT NULL,
employee_id uuid NOT NULL,
acknowledged_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."policy_acknowledgements" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."project_performance_reviews" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
project_name text NOT NULL,
project_manager_employee_id uuid,
role_in_project text NOT NULL,
start_date date NOT NULL,
end_date date NOT NULL,
technical_competence_score numeric(2,1) NOT NULL,
collaboration_score numeric(2,1) NOT NULL,
delivery_score numeric(2,1) NOT NULL,
feedback_notes text NOT NULL,
evaluated_by uuid NOT NULL,
evaluated_at timestamp with time zone NOT NULL DEFAULT now(),
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."project_performance_reviews" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."role_permissions" (
role_id text NOT NULL,
permission_id text NOT NULL,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."role_permissions" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."roles" (
id text NOT NULL,
name text NOT NULL,
description text,
active boolean NOT NULL DEFAULT true,
is_system boolean NOT NULL DEFAULT false,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."roles" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."service_requests" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
request_type text NOT NULL,
reason text NOT NULL,
request_data jsonb NOT NULL DEFAULT '{}'::jsonb,
status text NOT NULL DEFAULT 'pending'::text,
submitted_by uuid,
submitted_at timestamp with time zone NOT NULL DEFAULT now(),
resolved_by uuid,
resolved_at timestamp with time zone,
resolution_note text,
result_url text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."service_requests" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."shifts" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
name text NOT NULL,
code text NOT NULL,
start_time time without time zone NOT NULL,
end_time time without time zone NOT NULL,
grace_minutes integer NOT NULL DEFAULT 0,
full_day_hours numeric NOT NULL DEFAULT 8,
half_day_hours numeric NOT NULL DEFAULT 4,
active boolean NOT NULL DEFAULT true,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
weekly_off_days integer[] NOT NULL DEFAULT '{}'::integer[],
break_minutes integer NOT NULL DEFAULT 0
);
ALTER TABLE public."shifts" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."skill_verification_requests" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
employee_skill_id uuid NOT NULL,
status text NOT NULL DEFAULT 'pending'::text,
requested_at timestamp with time zone NOT NULL DEFAULT now(),
resolved_at timestamp with time zone,
resolved_by uuid,
resolution_note text
);
ALTER TABLE public."skill_verification_requests" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."teams" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
department_id uuid NOT NULL,
name text NOT NULL,
code text NOT NULL,
active boolean NOT NULL DEFAULT true,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."teams" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."tenant_memberships" (
tenant_id uuid NOT NULL,
user_id uuid NOT NULL,
role text NOT NULL,
status text NOT NULL DEFAULT 'active'::text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."tenant_memberships" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."tenants" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
slug text NOT NULL,
code text NOT NULL,
name text NOT NULL,
is_active boolean NOT NULL DEFAULT true,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
timezone text NOT NULL DEFAULT 'Asia/Dhaka'::text
);
ALTER TABLE public."tenants" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."timesheet_activities" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
activity_type text NOT NULL,
name text NOT NULL,
code text NOT NULL,
active boolean NOT NULL DEFAULT true,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."timesheet_activities" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."timesheet_entries" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
timesheet_id uuid NOT NULL,
activity_id uuid NOT NULL,
work_date date NOT NULL,
hours numeric(5,2) NOT NULL,
note text,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."timesheet_entries" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."timesheets" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
period_type text NOT NULL,
period_start date NOT NULL,
period_end date NOT NULL,
status text NOT NULL DEFAULT 'draft'::text,
submitted_at timestamp with time zone,
resolved_by uuid,
resolved_at timestamp with time zone,
resolution_note text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."timesheets" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."travel_requests" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
employee_id uuid NOT NULL,
destination text,
from_date date,
to_date date,
purpose text,
status text NOT NULL DEFAULT 'draft'::text,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now(),
estimated_cost numeric(14,2),
estimated_currency character varying(3),
submitted_at timestamp with time zone,
reviewed_at timestamp with time zone,
reviewed_by uuid,
review_note text
);
ALTER TABLE public."travel_requests" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."travel_status_history" (
id uuid NOT NULL DEFAULT gen_random_uuid(),
tenant_id uuid NOT NULL,
travel_request_id uuid NOT NULL,
actor_user_id uuid,
previous_status text,
new_status text NOT NULL,
note text,
created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."travel_status_history" ENABLE ROW LEVEL SECURITY;
CREATE TABLE public."user_roles" (
user_id uuid NOT NULL,
role_id text NOT NULL,
created_at timestamp with time zone NOT NULL DEFAULT now(),
updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_logs ADD CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY (id);
ALTER TABLE admin_users ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY (user_id);
ALTER TABLE attendance_correction_settings ADD CONSTRAINT "attendance_correction_settings_pkey" PRIMARY KEY (tenant_id);
ALTER TABLE attendance_corrections ADD CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY (id);
ALTER TABLE attendance_corrections ADD CONSTRAINT "attendance_corrections_requested_work_mode_check" CHECK (((requested_work_mode IS NULL) OR (requested_work_mode = ANY (ARRAY['office'::text, 'home'::text, 'client'::text, 'field'::text]))));
ALTER TABLE attendance_corrections ADD CONSTRAINT "attendance_corrections_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])));
ALTER TABLE attendance_records ADD CONSTRAINT "attendance_records_check_sequence" CHECK (((check_in IS NULL) OR (check_out IS NULL) OR (check_out >= check_in))) NOT VALID;
ALTER TABLE attendance_records ADD CONSTRAINT "attendance_records_pkey" PRIMARY KEY (id);
ALTER TABLE attendance_records ADD CONSTRAINT "attendance_records_source_check" CHECK ((source = ANY (ARRAY['system'::text, 'employee'::text, 'admin'::text, 'import'::text])));
ALTER TABLE attendance_records ADD CONSTRAINT "attendance_records_status_check" CHECK ((status = ANY (ARRAY['present'::text, 'late'::text, 'absent'::text, 'on_leave'::text, 'holiday'::text, 'weekend'::text, 'missing'::text, 'partial'::text])));
ALTER TABLE attendance_records ADD CONSTRAINT "attendance_records_tenant_id_employee_id_attendance_date_key" UNIQUE (tenant_id, employee_id, attendance_date);
ALTER TABLE attendance_records ADD CONSTRAINT "attendance_records_work_mode_check" CHECK ((work_mode = ANY (ARRAY['office'::text, 'home'::text, 'client'::text, 'field'::text])));
ALTER TABLE candidate_application_drafts ADD CONSTRAINT "candidate_application_drafts_candidate_user_id_job_id_key" UNIQUE (candidate_user_id, job_id);
ALTER TABLE candidate_application_drafts ADD CONSTRAINT "candidate_application_drafts_current_step_check" CHECK (((current_step >= 1) AND (current_step <= 7)));
ALTER TABLE candidate_application_drafts ADD CONSTRAINT "candidate_application_drafts_pkey" PRIMARY KEY (id);
ALTER TABLE candidate_application_stage_history ADD CONSTRAINT "candidate_application_stage_history_actor_check" CHECK ((actor_type = ANY (ARRAY['candidate'::text, 'recruitment'::text, 'system'::text])));
ALTER TABLE candidate_application_stage_history ADD CONSTRAINT "candidate_application_stage_history_pkey" PRIMARY KEY (id);
ALTER TABLE candidate_application_stage_history ADD CONSTRAINT "candidate_application_stage_history_stage_check" CHECK ((stage = ANY (ARRAY['applied'::text, 'screening'::text, 'shortlisted'::text, 'assessment'::text, 'interview'::text, 'final_review'::text, 'offer'::text, 'offer_accepted'::text, 'offer_declined'::text, 'hired'::text, 'rejected'::text, 'withdrawn'::text])));
ALTER TABLE candidate_assessments ADD CONSTRAINT "candidate_assessments_pkey" PRIMARY KEY (id);
ALTER TABLE candidate_assessments ADD CONSTRAINT "candidate_assessments_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'submitted'::text, 'reviewed'::text])));
ALTER TABLE candidate_cvs ADD CONSTRAINT "candidate_cvs_pkey" PRIMARY KEY (id);
ALTER TABLE candidate_document_requests ADD CONSTRAINT "candidate_document_requests_pkey" PRIMARY KEY (id);
ALTER TABLE candidate_document_requests ADD CONSTRAINT "candidate_document_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'submitted'::text, 'verified'::text])));
ALTER TABLE candidate_job_alerts ADD CONSTRAINT "candidate_job_alerts_frequency_check" CHECK ((frequency = 'Instant'::text));
ALTER TABLE candidate_job_alerts ADD CONSTRAINT "candidate_job_alerts_pkey" PRIMARY KEY (id);
ALTER TABLE candidate_job_changes ADD CONSTRAINT "candidate_job_changes_pkey" PRIMARY KEY (tenant_id);
ALTER TABLE candidate_notifications ADD CONSTRAINT "candidate_notifications_pkey" PRIMARY KEY (id);
ALTER TABLE candidate_profiles ADD CONSTRAINT "candidate_profiles_pkey" PRIMARY KEY (user_id);
ALTER TABLE candidate_profiles ADD CONSTRAINT "candidate_profiles_profile_status_check" CHECK ((profile_status = ANY (ARRAY['active'::text, 'disabled'::text])));
ALTER TABLE candidate_saved_jobs ADD CONSTRAINT "candidate_saved_jobs_candidate_user_id_job_id_key" UNIQUE (candidate_user_id, job_id);
ALTER TABLE candidate_saved_jobs ADD CONSTRAINT "candidate_saved_jobs_pkey" PRIMARY KEY (id);
ALTER TABLE confirmation_reviews ADD CONSTRAINT "confirmation_reviews_pkey" PRIMARY KEY (id);
ALTER TABLE confirmation_reviews ADD CONSTRAINT "confirmation_reviews_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'extended'::text, 'rejected'::text])));
ALTER TABLE departments ADD CONSTRAINT "departments_pkey" PRIMARY KEY (id);
ALTER TABLE departments ADD CONSTRAINT "departments_tenant_id_code_key" UNIQUE (tenant_id, code);
ALTER TABLE designation_skill_requirements ADD CONSTRAINT "designation_skill_requirements_designation_id_skill_name_key" UNIQUE (designation_id, skill_name);
ALTER TABLE designation_skill_requirements ADD CONSTRAINT "designation_skill_requirements_pkey" PRIMARY KEY (id);
ALTER TABLE designations ADD CONSTRAINT "designations_pkey" PRIMARY KEY (id);
ALTER TABLE designations ADD CONSTRAINT "designations_tenant_id_code_key" UNIQUE (tenant_id, code);
ALTER TABLE employee_addresses ADD CONSTRAINT "employee_addresses_address_type_check" CHECK ((address_type = ANY (ARRAY['Present'::text, 'Permanent'::text, 'Other'::text])));
ALTER TABLE employee_addresses ADD CONSTRAINT "employee_addresses_pkey" PRIMARY KEY (id);
ALTER TABLE employee_certifications ADD CONSTRAINT "employee_certifications_pkey" PRIMARY KEY (id);
ALTER TABLE employee_comp_time_ledger ADD CONSTRAINT "employee_comp_time_ledger_entry_type_check" CHECK ((entry_type = ANY (ARRAY['credit'::text, 'debit'::text])));
ALTER TABLE employee_comp_time_ledger ADD CONSTRAINT "employee_comp_time_ledger_pkey" PRIMARY KEY (id);
ALTER TABLE employee_comp_time_ledger ADD CONSTRAINT "employee_comp_time_ledger_source_overtime_request_id_key" UNIQUE (source_overtime_request_id);
ALTER TABLE employee_compensation ADD CONSTRAINT "employee_compensation_basic_salary_check" CHECK ((basic_salary >= (0)::numeric));
ALTER TABLE employee_compensation ADD CONSTRAINT "employee_compensation_house_rent_allowance_check" CHECK ((house_rent_allowance >= (0)::numeric));
ALTER TABLE employee_compensation ADD CONSTRAINT "employee_compensation_medical_allowance_check" CHECK ((medical_allowance >= (0)::numeric));
ALTER TABLE employee_compensation ADD CONSTRAINT "employee_compensation_pkey" PRIMARY KEY (employee_id);
ALTER TABLE employee_compensation ADD CONSTRAINT "employee_compensation_special_allowance_check" CHECK ((special_allowance >= (0)::numeric));
ALTER TABLE employee_compensation ADD CONSTRAINT "employee_compensation_transport_allowance_check" CHECK ((transport_allowance >= (0)::numeric));
ALTER TABLE employee_documents ADD CONSTRAINT "employee_documents_document_type_check" CHECK ((document_type = ANY (ARRAY['contract'::text, 'id_proof'::text, 'certificate'::text, 'nda'::text, 'offer_letter'::text, 'other'::text])));
ALTER TABLE employee_documents ADD CONSTRAINT "employee_documents_pkey" PRIMARY KEY (id);
ALTER TABLE employee_documents ADD CONSTRAINT "employee_documents_review_state_check" CHECK ((((verification_status = 'pending'::text) AND (verified = false) AND (reviewed_at IS NULL) AND (reviewed_by IS NULL)) OR ((verification_status = 'verified'::text) AND (verified = true) AND (reviewed_at IS NOT NULL) AND (reviewed_by IS NOT NULL)) OR ((verification_status = 'rejected'::text) AND (verified = false) AND (reviewed_at IS NOT NULL) AND (reviewed_by IS NOT NULL) AND (NULLIF(btrim(COALESCE(verification_note, ''::text)), ''::text) IS NOT NULL))));
ALTER TABLE employee_documents ADD CONSTRAINT "employee_documents_verification_status_check" CHECK ((verification_status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text])));
ALTER TABLE employee_education ADD CONSTRAINT "employee_education_pkey" PRIMARY KEY (id);
ALTER TABLE employee_experience ADD CONSTRAINT "employee_experience_pkey" PRIMARY KEY (id);
ALTER TABLE employee_family_members ADD CONSTRAINT "employee_family_members_gender_check" CHECK (((gender IS NULL) OR (gender = ANY (ARRAY['Male'::text, 'Female'::text, 'Other'::text]))));
ALTER TABLE employee_family_members ADD CONSTRAINT "employee_family_members_pkey" PRIMARY KEY (id);
ALTER TABLE employee_leave_balances ADD CONSTRAINT "employee_leave_balances_check" CHECK (((opening_days >= (0)::numeric) AND (allocated_days >= (0)::numeric) AND (used_days >= (0)::numeric) AND (pending_days >= (0)::numeric)));
ALTER TABLE employee_leave_balances ADD CONSTRAINT "employee_leave_balances_employee_id_leave_type_id_balance_y_key" UNIQUE (employee_id, leave_type_id, balance_year);
ALTER TABLE employee_leave_balances ADD CONSTRAINT "employee_leave_balances_pkey" PRIMARY KEY (id);
ALTER TABLE employee_lifecycle_events ADD CONSTRAINT "employee_lifecycle_events_event_type_check" CHECK ((event_type = ANY (ARRAY['hired'::text, 'probation_confirmed'::text, 'promoted'::text, 'transferred'::text, 'salary_revised'::text, 'resigned'::text, 'terminated'::text])));
ALTER TABLE employee_lifecycle_events ADD CONSTRAINT "employee_lifecycle_events_pkey" PRIMARY KEY (id);
ALTER TABLE employee_notifications ADD CONSTRAINT "employee_notifications_pkey" PRIMARY KEY (id);
ALTER TABLE employee_professional_links ADD CONSTRAINT "employee_professional_links_pkey" PRIMARY KEY (id);
ALTER TABLE employee_profile_change_requests ADD CONSTRAINT "employee_profile_change_requests_field_key_check" CHECK ((field_key = ANY (ARRAY['full_name'::text, 'official_email'::text, 'personal_email'::text, 'official_phone'::text, 'address'::text, 'mailing_address'::text, 'emergency_contact_name'::text, 'emergency_contact_phone'::text, 'emergency_contact_relation'::text, 'father_name'::text, 'mother_name'::text, 'birthplace'::text, 'blood_group'::text, 'religion'::text, 'nid_number'::text, 'passport_number'::text, 'etin_number'::text])));
ALTER TABLE employee_profile_change_requests ADD CONSTRAINT "employee_profile_change_requests_pkey" PRIMARY KEY (id);
ALTER TABLE employee_profile_change_requests ADD CONSTRAINT "employee_profile_change_requests_reason_check" CHECK (((length(btrim(reason)) >= 1) AND (length(btrim(reason)) <= 1000)));
ALTER TABLE employee_profile_change_requests ADD CONSTRAINT "employee_profile_change_requests_requested_value_check" CHECK (((length(btrim(requested_value)) >= 1) AND (length(btrim(requested_value)) <= 500)));
ALTER TABLE employee_profile_change_requests ADD CONSTRAINT "employee_profile_change_requests_review_note_check" CHECK (((review_note IS NULL) OR (length(review_note) <= 1000)));
ALTER TABLE employee_profile_change_requests ADD CONSTRAINT "employee_profile_change_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE employee_profile_change_requests ADD CONSTRAINT "employee_profile_change_resolution_consistency" CHECK ((((status = 'pending'::text) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL)) OR ((status = ANY (ARRAY['approved'::text, 'rejected'::text])) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL))));
ALTER TABLE employee_referrals ADD CONSTRAINT "employee_referrals_pkey" PRIMARY KEY (id);
ALTER TABLE employee_referrals ADD CONSTRAINT "employee_referrals_status_check" CHECK ((status = ANY (ARRAY['submitted'::text, 'in_review'::text, 'shortlisted'::text, 'rejected'::text, 'hired'::text, 'closed'::text])));
ALTER TABLE employee_shift_assignments ADD CONSTRAINT "employee_shift_assignments_pkey" PRIMARY KEY (id);
ALTER TABLE employee_shift_assignments ADD CONSTRAINT "employee_shift_assignments_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'cancelled'::text])));
ALTER TABLE employee_shift_assignments ADD CONSTRAINT "employee_shift_assignments_tenant_id_employee_id_assignment_key" UNIQUE (tenant_id, employee_id, assignment_date);
ALTER TABLE employee_skills ADD CONSTRAINT "employee_skills_pkey" PRIMARY KEY (id);
ALTER TABLE employee_training ADD CONSTRAINT "employee_training_pkey" PRIMARY KEY (id);
ALTER TABLE employees ADD CONSTRAINT "employees_employment_status_check" CHECK ((employment_status = ANY (ARRAY['active'::text, 'on_leave'::text, 'probation'::text, 'notice_period'::text, 'resigned'::text, 'terminated'::text])));
ALTER TABLE employees ADD CONSTRAINT "employees_employment_type_check" CHECK ((employment_type = ANY (ARRAY['full_time'::text, 'contract'::text, 'probation'::text, 'intern'::text, 'part_time'::text])));
ALTER TABLE employees ADD CONSTRAINT "employees_gender_check" CHECK (((gender IS NULL) OR (gender = ANY (ARRAY['Male'::text, 'Female'::text, 'Other'::text]))));
ALTER TABLE employees ADD CONSTRAINT "employees_notice_period_days_check" CHECK ((notice_period_days >= 0));
ALTER TABLE employees ADD CONSTRAINT "employees_pkey" PRIMARY KEY (id);
ALTER TABLE employees ADD CONSTRAINT "employees_tenant_id_employee_number_key" UNIQUE (tenant_id, employee_number);
ALTER TABLE employees ADD CONSTRAINT "employees_tenant_id_official_email_key" UNIQUE (tenant_id, official_email);
ALTER TABLE employees ADD CONSTRAINT "employees_user_id_key" UNIQUE (user_id);
ALTER TABLE expense_categories ADD CONSTRAINT "expense_categories_name_check" CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 80)));
ALTER TABLE expense_categories ADD CONSTRAINT "expense_categories_pkey" PRIMARY KEY (id);
ALTER TABLE expense_claim_receipts ADD CONSTRAINT "expense_claim_receipts_file_name_check" CHECK (((char_length(btrim(file_name)) >= 1) AND (char_length(btrim(file_name)) <= 255)));
ALTER TABLE expense_claim_receipts ADD CONSTRAINT "expense_claim_receipts_file_size_check" CHECK (((file_size > 0) AND (file_size <= 10485760)));
ALTER TABLE expense_claim_receipts ADD CONSTRAINT "expense_claim_receipts_mime_type_check" CHECK ((mime_type = ANY (ARRAY['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text])));
ALTER TABLE expense_claim_receipts ADD CONSTRAINT "expense_claim_receipts_pkey" PRIMARY KEY (id);
ALTER TABLE expense_claim_receipts ADD CONSTRAINT "expense_claim_receipts_storage_path_key" UNIQUE (storage_path);
ALTER TABLE expense_claim_receipts ADD CONSTRAINT "expense_receipts_storage_path_format" CHECK ((storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'::text));
ALTER TABLE expense_claim_status_history ADD CONSTRAINT "expense_claim_status_history_pkey" PRIMARY KEY (id);
ALTER TABLE expense_claims ADD CONSTRAINT "expense_claims_amount_check" CHECK (((amount IS NULL) OR (amount > (0)::numeric)));
ALTER TABLE expense_claims ADD CONSTRAINT "expense_claims_currency_check" CHECK (((currency IS NULL) OR ((currency)::text ~ '^[A-Z]{3}$'::text)));
ALTER TABLE expense_claims ADD CONSTRAINT "expense_claims_description_check" CHECK (((char_length(btrim(description)) >= 1) AND (char_length(btrim(description)) <= 2000)));
ALTER TABLE expense_claims ADD CONSTRAINT "expense_claims_pkey" PRIMARY KEY (id);
ALTER TABLE expense_claims ADD CONSTRAINT "expense_claims_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'paid'::text, 'cancelled'::text])));
ALTER TABLE expense_claims ADD CONSTRAINT "expense_submission_fields_required" CHECK (((status = 'draft'::text) OR ((category_id IS NOT NULL) AND (claim_date IS NOT NULL) AND (amount IS NOT NULL) AND (currency IS NOT NULL) AND (description IS NOT NULL) AND (submitted_at IS NOT NULL))));
ALTER TABLE expense_travel_links ADD CONSTRAINT "expense_travel_links_pkey" PRIMARY KEY (claim_id);
ALTER TABLE feedback_360_cycles ADD CONSTRAINT "feedback_360_cycles_check" CHECK ((end_date >= start_date));
ALTER TABLE feedback_360_cycles ADD CONSTRAINT "feedback_360_cycles_pkey" PRIMARY KEY (id);
ALTER TABLE feedback_360_cycles ADD CONSTRAINT "feedback_360_cycles_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'closed'::text])));
ALTER TABLE feedback_360_requests ADD CONSTRAINT "feedback_360_requests_cycle_id_subject_employee_id_reviewer_key" UNIQUE (cycle_id, subject_employee_id, reviewer_employee_id);
ALTER TABLE feedback_360_requests ADD CONSTRAINT "feedback_360_requests_pkey" PRIMARY KEY (id);
ALTER TABLE feedback_360_requests ADD CONSTRAINT "feedback_360_requests_relationship_check" CHECK ((relationship = ANY (ARRAY['peer'::text, 'manager'::text, 'direct_report'::text])));
ALTER TABLE feedback_360_requests ADD CONSTRAINT "feedback_360_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'draft'::text, 'submitted'::text])));
ALTER TABLE grades ADD CONSTRAINT "grades_check" CHECK (((min_salary IS NULL) OR (max_salary IS NULL) OR (max_salary >= min_salary)));
ALTER TABLE grades ADD CONSTRAINT "grades_max_salary_check" CHECK (((max_salary IS NULL) OR (max_salary >= (0)::numeric)));
ALTER TABLE grades ADD CONSTRAINT "grades_min_salary_check" CHECK (((min_salary IS NULL) OR (min_salary >= (0)::numeric)));
ALTER TABLE grades ADD CONSTRAINT "grades_pkey" PRIMARY KEY (id);
ALTER TABLE grades ADD CONSTRAINT "grades_rank_check" CHECK ((rank > 0));
ALTER TABLE grades ADD CONSTRAINT "grades_tenant_id_code_key" UNIQUE (tenant_id, code);
ALTER TABLE holidays ADD CONSTRAINT "holidays_check" CHECK ((end_date >= start_date));
ALTER TABLE holidays ADD CONSTRAINT "holidays_pkey" PRIMARY KEY (id);
ALTER TABLE hr_policies ADD CONSTRAINT "hr_policies_pkey" PRIMARY KEY (id);
ALTER TABLE interviews ADD CONSTRAINT "interviews_candidate_response_check" CHECK ((candidate_response = ANY (ARRAY['invited'::text, 'confirmed'::text, 'reschedule_requested'::text, 'declined'::text])));
ALTER TABLE interviews ADD CONSTRAINT "interviews_duration_minutes_check" CHECK (((duration_minutes >= 15) AND (duration_minutes <= 480)));
ALTER TABLE interviews ADD CONSTRAINT "interviews_pkey" PRIMARY KEY (id);
ALTER TABLE interviews ADD CONSTRAINT "interviews_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE job_applications ADD CONSTRAINT "job_applications_job_id_candidate_user_id_key" UNIQUE (job_id, candidate_user_id);
ALTER TABLE job_applications ADD CONSTRAINT "job_applications_pkey" PRIMARY KEY (id);
ALTER TABLE job_applications ADD CONSTRAINT "job_applications_stage_check" CHECK ((stage = ANY (ARRAY['applied'::text, 'screening'::text, 'shortlisted'::text, 'assessment'::text, 'interview'::text, 'final_review'::text, 'offer'::text, 'offer_accepted'::text, 'offer_declined'::text, 'hired'::text, 'rejected'::text, 'withdrawn'::text])));
ALTER TABLE job_offers ADD CONSTRAINT "job_offers_application_id_key" UNIQUE (application_id);
ALTER TABLE job_offers ADD CONSTRAINT "job_offers_pay_period_check" CHECK ((pay_period = ANY (ARRAY['Monthly'::text, 'Annual'::text])));
ALTER TABLE job_offers ADD CONSTRAINT "job_offers_pkey" PRIMARY KEY (id);
ALTER TABLE job_offers ADD CONSTRAINT "job_offers_status_check" CHECK ((status = ANY (ARRAY['issued'::text, 'accepted'::text, 'declined'::text, 'withdrawn'::text])));
ALTER TABLE jobs ADD CONSTRAINT "jobs_check" CHECK (((salary_min IS NULL) OR (salary_max IS NULL) OR (salary_max >= salary_min)));
ALTER TABLE jobs ADD CONSTRAINT "jobs_employment_type_check" CHECK ((employment_type = ANY (ARRAY['full-time'::text, 'part-time'::text, 'contract'::text, 'internship'::text])));
ALTER TABLE jobs ADD CONSTRAINT "jobs_experience_level_check" CHECK (((experience_level IS NULL) OR (experience_level = ANY (ARRAY['entry'::text, 'mid'::text, 'senior'::text, 'lead'::text, 'executive'::text]))));
ALTER TABLE jobs ADD CONSTRAINT "jobs_min_experience_years_check" CHECK ((min_experience_years >= (0)::numeric));
ALTER TABLE jobs ADD CONSTRAINT "jobs_pkey" PRIMARY KEY (id);
ALTER TABLE jobs ADD CONSTRAINT "jobs_reference_number_key" UNIQUE (reference_number);
ALTER TABLE jobs ADD CONSTRAINT "jobs_salary_max_check" CHECK (((salary_max IS NULL) OR (salary_max >= (0)::numeric)));
ALTER TABLE jobs ADD CONSTRAINT "jobs_salary_min_check" CHECK (((salary_min IS NULL) OR (salary_min >= (0)::numeric)));
ALTER TABLE jobs ADD CONSTRAINT "jobs_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'closed'::text, 'archived'::text])));
ALTER TABLE jobs ADD CONSTRAINT "jobs_vacancy_count_check" CHECK ((vacancy_count > 0));
ALTER TABLE jobs ADD CONSTRAINT "jobs_workplace_type_check" CHECK ((workplace_type = ANY (ARRAY['remote'::text, 'hybrid'::text, 'on-site'::text])));
ALTER TABLE learning_enrollments ADD CONSTRAINT "learning_enrollments_pkey" PRIMARY KEY (id);
ALTER TABLE learning_enrollments ADD CONSTRAINT "learning_enrollments_source_check" CHECK ((source = ANY (ARRAY['self_enrollment'::text, 'employee_request'::text, 'admin_assignment'::text, 'manager_recommendation'::text])));
ALTER TABLE learning_enrollments ADD CONSTRAINT "learning_enrollments_status_check" CHECK ((status = ANY (ARRAY['requested'::text, 'enrolled'::text, 'rejected'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE learning_programs ADD CONSTRAINT "learning_programs_delivery_mode_check" CHECK ((delivery_mode = ANY (ARRAY['in_person'::text, 'virtual'::text, 'hybrid'::text, 'self_paced'::text])));
ALTER TABLE learning_programs ADD CONSTRAINT "learning_programs_duration_hours_check" CHECK (((duration_hours IS NULL) OR (duration_hours >= (0)::numeric)));
ALTER TABLE learning_programs ADD CONSTRAINT "learning_programs_pkey" PRIMARY KEY (id);
ALTER TABLE learning_sessions ADD CONSTRAINT "learning_sessions_capacity_check" CHECK (((capacity IS NULL) OR (capacity > 0)));
ALTER TABLE learning_sessions ADD CONSTRAINT "learning_sessions_check" CHECK (((end_at IS NULL) OR (start_at IS NULL) OR (end_at >= start_at)));
ALTER TABLE learning_sessions ADD CONSTRAINT "learning_sessions_pkey" PRIMARY KEY (id);
ALTER TABLE learning_sessions ADD CONSTRAINT "learning_sessions_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE leave_requests ADD CONSTRAINT "leave_requests_check" CHECK ((to_date >= from_date));
ALTER TABLE leave_requests ADD CONSTRAINT "leave_requests_day_portion_check" CHECK ((day_portion = ANY (ARRAY['full'::text, 'first_half'::text, 'second_half'::text])));
ALTER TABLE leave_requests ADD CONSTRAINT "leave_requests_pkey" PRIMARY KEY (id);
ALTER TABLE leave_requests ADD CONSTRAINT "leave_requests_requested_days_check" CHECK ((requested_days > (0)::numeric));
ALTER TABLE leave_requests ADD CONSTRAINT "leave_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])));
ALTER TABLE leave_types ADD CONSTRAINT "leave_types_annual_entitlement_check" CHECK (((annual_entitlement IS NULL) OR (annual_entitlement >= (0)::numeric)));
ALTER TABLE leave_types ADD CONSTRAINT "leave_types_max_carry_forward_days_check" CHECK (((max_carry_forward_days IS NULL) OR (max_carry_forward_days >= (0)::numeric)));
ALTER TABLE leave_types ADD CONSTRAINT "leave_types_min_days_notice_check" CHECK (((min_days_notice IS NULL) OR (min_days_notice >= 0)));
ALTER TABLE leave_types ADD CONSTRAINT "leave_types_pkey" PRIMARY KEY (id);
ALTER TABLE leave_types ADD CONSTRAINT "leave_types_tenant_id_code_key" UNIQUE (tenant_id, code);
ALTER TABLE manpower_requisitions ADD CONSTRAINT "manpower_requisitions_pkey" PRIMARY KEY (id);
ALTER TABLE manpower_requisitions ADD CONSTRAINT "manpower_requisitions_required_positions_check" CHECK ((required_positions > 0));
ALTER TABLE manpower_requisitions ADD CONSTRAINT "manpower_requisitions_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'approved'::text, 'rejected'::text, 'closed'::text])));
ALTER TABLE manpower_requisitions ADD CONSTRAINT "manpower_requisitions_tenant_id_reference_number_key" UNIQUE (tenant_id, reference_number);
ALTER TABLE notices ADD CONSTRAINT "notices_audience_type_check" CHECK ((audience_type = ANY (ARRAY['all'::text, 'department'::text, 'location'::text])));
ALTER TABLE notices ADD CONSTRAINT "notices_pkey" PRIMARY KEY (id);
ALTER TABLE onboarding_handoffs ADD CONSTRAINT "onboarding_handoffs_application_id_key" UNIQUE (application_id);
ALTER TABLE onboarding_handoffs ADD CONSTRAINT "onboarding_handoffs_pkey" PRIMARY KEY (id);
ALTER TABLE onboarding_handoffs ADD CONSTRAINT "onboarding_handoffs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE org_locations ADD CONSTRAINT "org_locations_pkey" PRIMARY KEY (id);
ALTER TABLE org_locations ADD CONSTRAINT "org_locations_tenant_id_code_key" UNIQUE (tenant_id, code);
ALTER TABLE overtime_requests ADD CONSTRAINT "overtime_requests_approved_hours_check" CHECK (((approved_hours IS NULL) OR ((approved_hours >= (0)::numeric) AND (approved_hours <= (24)::numeric))));
ALTER TABLE overtime_requests ADD CONSTRAINT "overtime_requests_approved_pay_amount_check" CHECK (((approved_pay_amount IS NULL) OR (approved_pay_amount >= (0)::numeric)));
ALTER TABLE overtime_requests ADD CONSTRAINT "overtime_requests_compensation_mode_check" CHECK ((compensation_mode = ANY (ARRAY['payroll'::text, 'comp_time'::text])));
ALTER TABLE overtime_requests ADD CONSTRAINT "overtime_requests_pkey" PRIMARY KEY (id);
ALTER TABLE overtime_requests ADD CONSTRAINT "overtime_requests_requested_hours_check" CHECK (((requested_hours > (0)::numeric) AND (requested_hours <= (24)::numeric)));
ALTER TABLE overtime_requests ADD CONSTRAINT "overtime_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])));
ALTER TABLE overtime_settings ADD CONSTRAINT "overtime_settings_compensation_mode_check" CHECK ((compensation_mode = ANY (ARRAY['payroll'::text, 'comp_time'::text])));
ALTER TABLE overtime_settings ADD CONSTRAINT "overtime_settings_pkey" PRIMARY KEY (tenant_id);
ALTER TABLE pay_periods ADD CONSTRAINT "pay_periods_check" CHECK ((end_date >= start_date));
ALTER TABLE pay_periods ADD CONSTRAINT "pay_periods_pkey" PRIMARY KEY (id);
ALTER TABLE pay_periods ADD CONSTRAINT "pay_periods_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'prepared'::text, 'released'::text, 'closed'::text])));
ALTER TABLE payslips ADD CONSTRAINT "payslips_basic_salary_check" CHECK ((basic_salary >= (0)::numeric));
ALTER TABLE payslips ADD CONSTRAINT "payslips_bonus_check" CHECK ((bonus >= (0)::numeric));
ALTER TABLE payslips ADD CONSTRAINT "payslips_house_rent_allowance_check" CHECK ((house_rent_allowance >= (0)::numeric));
ALTER TABLE payslips ADD CONSTRAINT "payslips_leave_without_pay_deduction_check" CHECK ((leave_without_pay_deduction >= (0)::numeric));
ALTER TABLE payslips ADD CONSTRAINT "payslips_medical_allowance_check" CHECK ((medical_allowance >= (0)::numeric));
ALTER TABLE payslips ADD CONSTRAINT "payslips_other_deductions_check" CHECK ((other_deductions >= (0)::numeric));
ALTER TABLE payslips ADD CONSTRAINT "payslips_overtime_pay_check" CHECK ((overtime_pay >= (0)::numeric));
ALTER TABLE payslips ADD CONSTRAINT "payslips_pay_period_id_employee_id_key" UNIQUE (pay_period_id, employee_id);
ALTER TABLE payslips ADD CONSTRAINT "payslips_pkey" PRIMARY KEY (id);
ALTER TABLE payslips ADD CONSTRAINT "payslips_provident_fund_deduction_check" CHECK ((provident_fund_deduction >= (0)::numeric));
ALTER TABLE payslips ADD CONSTRAINT "payslips_special_allowance_check" CHECK ((special_allowance >= (0)::numeric));
ALTER TABLE payslips ADD CONSTRAINT "payslips_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'released'::text, 'void'::text])));
ALTER TABLE payslips ADD CONSTRAINT "payslips_tax_deduction_check" CHECK ((tax_deduction >= (0)::numeric));
ALTER TABLE payslips ADD CONSTRAINT "payslips_transport_allowance_check" CHECK ((transport_allowance >= (0)::numeric));
ALTER TABLE performance_appraisals ADD CONSTRAINT "performance_appraisals_cycle_id_employee_id_key" UNIQUE (cycle_id, employee_id);
ALTER TABLE performance_appraisals ADD CONSTRAINT "performance_appraisals_final_rating_check" CHECK (((final_rating IS NULL) OR ((final_rating >= (1)::numeric) AND (final_rating <= (5)::numeric))));
ALTER TABLE performance_appraisals ADD CONSTRAINT "performance_appraisals_manager_rating_check" CHECK (((manager_rating IS NULL) OR ((manager_rating >= (1)::numeric) AND (manager_rating <= (5)::numeric))));
ALTER TABLE performance_appraisals ADD CONSTRAINT "performance_appraisals_pkey" PRIMARY KEY (id);
ALTER TABLE performance_appraisals ADD CONSTRAINT "performance_appraisals_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'submitted_by_employee'::text, 'reviewed_by_manager'::text, 'finalized'::text])));
ALTER TABLE performance_cycle_criteria ADD CONSTRAINT "performance_cycle_criteria_pkey" PRIMARY KEY (id);
ALTER TABLE performance_cycle_criteria ADD CONSTRAINT "performance_cycle_criteria_weight_check" CHECK (((weight > (0)::numeric) AND (weight <= (100)::numeric)));
ALTER TABLE performance_cycles ADD CONSTRAINT "performance_cycles_check" CHECK ((end_date >= start_date));
ALTER TABLE performance_cycles ADD CONSTRAINT "performance_cycles_pkey" PRIMARY KEY (id);
ALTER TABLE performance_cycles ADD CONSTRAINT "performance_cycles_status_check" CHECK ((status = ANY (ARRAY['upcoming'::text, 'active'::text, 'in_review'::text, 'completed'::text])));
ALTER TABLE performance_goal_history ADD CONSTRAINT "performance_goal_history_pkey" PRIMARY KEY (id);
ALTER TABLE performance_goal_settings ADD CONSTRAINT "performance_goal_settings_pkey" PRIMARY KEY (tenant_id);
ALTER TABLE performance_goal_updates ADD CONSTRAINT "performance_goal_updates_pkey" PRIMARY KEY (id);
ALTER TABLE performance_goal_updates ADD CONSTRAINT "performance_goal_updates_progress_check" CHECK (((progress IS NULL) OR ((progress >= (0)::numeric) AND (progress <= (100)::numeric))));
ALTER TABLE performance_goal_updates ADD CONSTRAINT "performance_goal_updates_update_type_check" CHECK ((update_type = ANY (ARRAY['employee_progress'::text, 'manager_feedback'::text, 'admin_note'::text])));
ALTER TABLE performance_goals ADD CONSTRAINT "performance_goals_category_check" CHECK ((category = ANY (ARRAY['Strategic'::text, 'Operational'::text, 'Individual'::text, 'Skill'::text])));
ALTER TABLE performance_goals ADD CONSTRAINT "performance_goals_current_progress_check" CHECK (((current_progress >= (0)::numeric) AND (current_progress <= (100)::numeric)));
ALTER TABLE performance_goals ADD CONSTRAINT "performance_goals_origin_check" CHECK ((origin = ANY (ARRAY['assigned'::text, 'personal'::text])));
ALTER TABLE performance_goals ADD CONSTRAINT "performance_goals_pkey" PRIMARY KEY (id);
ALTER TABLE performance_goals ADD CONSTRAINT "performance_goals_status_check" CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE performance_goals ADD CONSTRAINT "performance_goals_weight_check" CHECK (((weight >= (0)::numeric) AND (weight <= (100)::numeric)));
ALTER TABLE performance_improvement_plans ADD CONSTRAINT "performance_improvement_plans_check" CHECK ((end_date >= start_date));
ALTER TABLE performance_improvement_plans ADD CONSTRAINT "performance_improvement_plans_pkey" PRIMARY KEY (id);
ALTER TABLE performance_improvement_plans ADD CONSTRAINT "performance_improvement_plans_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE performance_improvement_updates ADD CONSTRAINT "performance_improvement_updates_pkey" PRIMARY KEY (id);
ALTER TABLE performance_improvement_updates ADD CONSTRAINT "performance_improvement_updates_update_type_check" CHECK ((update_type = ANY (ARRAY['employee_update'::text, 'manager_feedback'::text])));
ALTER TABLE permissions ADD CONSTRAINT "permissions_pkey" PRIMARY KEY (id);
ALTER TABLE policy_acknowledgements ADD CONSTRAINT "policy_acknowledgements_pkey" PRIMARY KEY (policy_id, employee_id);
ALTER TABLE project_performance_reviews ADD CONSTRAINT "project_performance_reviews_check" CHECK ((end_date >= start_date));
ALTER TABLE project_performance_reviews ADD CONSTRAINT "project_performance_reviews_collaboration_score_check" CHECK (((collaboration_score >= (1)::numeric) AND (collaboration_score <= (5)::numeric)));
ALTER TABLE project_performance_reviews ADD CONSTRAINT "project_performance_reviews_delivery_score_check" CHECK (((delivery_score >= (1)::numeric) AND (delivery_score <= (5)::numeric)));
ALTER TABLE project_performance_reviews ADD CONSTRAINT "project_performance_reviews_pkey" PRIMARY KEY (id);
ALTER TABLE project_performance_reviews ADD CONSTRAINT "project_performance_reviews_technical_competence_score_check" CHECK (((technical_competence_score >= (1)::numeric) AND (technical_competence_score <= (5)::numeric)));
ALTER TABLE role_permissions ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY (role_id, permission_id);
ALTER TABLE roles ADD CONSTRAINT "roles_pkey" PRIMARY KEY (id);
ALTER TABLE service_requests ADD CONSTRAINT "service_requests_pkey" PRIMARY KEY (id);
ALTER TABLE service_requests ADD CONSTRAINT "service_requests_request_type_check" CHECK ((request_type = ANY (ARRAY['employment_certificate'::text, 'noc_letter'::text, 'salary_certificate'::text, 'other'::text, 'work_from_home'::text, 'movement'::text, 'shift_change'::text, 'shift_swap'::text])));
ALTER TABLE service_requests ADD CONSTRAINT "service_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])));
ALTER TABLE shifts ADD CONSTRAINT "shifts_break_minutes_check" CHECK (((break_minutes >= 0) AND (break_minutes <= 720)));
ALTER TABLE shifts ADD CONSTRAINT "shifts_full_day_hours_check" CHECK ((full_day_hours > (0)::numeric));
ALTER TABLE shifts ADD CONSTRAINT "shifts_grace_minutes_check" CHECK ((grace_minutes >= 0));
ALTER TABLE shifts ADD CONSTRAINT "shifts_half_day_hours_check" CHECK ((half_day_hours > (0)::numeric));
ALTER TABLE shifts ADD CONSTRAINT "shifts_pkey" PRIMARY KEY (id);
ALTER TABLE shifts ADD CONSTRAINT "shifts_tenant_id_code_key" UNIQUE (tenant_id, code);
ALTER TABLE shifts ADD CONSTRAINT "shifts_weekly_off_days_check" CHECK ((weekly_off_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]));
ALTER TABLE skill_verification_requests ADD CONSTRAINT "skill_verification_requests_pkey" PRIMARY KEY (id);
ALTER TABLE skill_verification_requests ADD CONSTRAINT "skill_verification_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text])));
ALTER TABLE teams ADD CONSTRAINT "teams_pkey" PRIMARY KEY (id);
ALTER TABLE teams ADD CONSTRAINT "teams_tenant_id_code_key" UNIQUE (tenant_id, code);
ALTER TABLE tenant_memberships ADD CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY (tenant_id, user_id);
ALTER TABLE tenant_memberships ADD CONSTRAINT "tenant_memberships_role_check" CHECK ((role = ANY (ARRAY['hr_admin'::text, 'hr_recruiter'::text])));
ALTER TABLE tenant_memberships ADD CONSTRAINT "tenant_memberships_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])));
ALTER TABLE tenants ADD CONSTRAINT "tenants_code_key" UNIQUE (code);
ALTER TABLE tenants ADD CONSTRAINT "tenants_pkey" PRIMARY KEY (id);
ALTER TABLE tenants ADD CONSTRAINT "tenants_slug_key" UNIQUE (slug);
ALTER TABLE timesheet_activities ADD CONSTRAINT "timesheet_activities_activity_type_check" CHECK ((activity_type = ANY (ARRAY['project'::text, 'client'::text, 'task'::text, 'activity'::text])));
ALTER TABLE timesheet_activities ADD CONSTRAINT "timesheet_activities_pkey" PRIMARY KEY (id);
ALTER TABLE timesheet_activities ADD CONSTRAINT "timesheet_activities_tenant_id_code_key" UNIQUE (tenant_id, code);
ALTER TABLE timesheet_entries ADD CONSTRAINT "timesheet_entries_hours_check" CHECK (((hours > (0)::numeric) AND (hours <= (24)::numeric)));
ALTER TABLE timesheet_entries ADD CONSTRAINT "timesheet_entries_pkey" PRIMARY KEY (id);
ALTER TABLE timesheets ADD CONSTRAINT "timesheets_check" CHECK ((period_end >= period_start));
ALTER TABLE timesheets ADD CONSTRAINT "timesheets_period_type_check" CHECK ((period_type = ANY (ARRAY['daily'::text, 'weekly'::text])));
ALTER TABLE timesheets ADD CONSTRAINT "timesheets_pkey" PRIMARY KEY (id);
ALTER TABLE timesheets ADD CONSTRAINT "timesheets_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE timesheets ADD CONSTRAINT "timesheets_tenant_id_employee_id_period_type_period_start_p_key" UNIQUE (tenant_id, employee_id, period_type, period_start, period_end);
ALTER TABLE travel_requests ADD CONSTRAINT "travel_cost_currency_pair" CHECK (((estimated_cost IS NULL) = (estimated_currency IS NULL)));
ALTER TABLE travel_requests ADD CONSTRAINT "travel_no_employee_review_forgery" CHECK (((status <> ALL (ARRAY['draft'::text, 'submitted'::text])) OR ((reviewed_at IS NULL) AND (reviewed_by IS NULL) AND (review_note IS NULL))));
ALTER TABLE travel_requests ADD CONSTRAINT "travel_requests_destination_check" CHECK (((destination IS NULL) OR (char_length(destination) <= 300)));
ALTER TABLE travel_requests ADD CONSTRAINT "travel_requests_estimated_cost_check" CHECK (((estimated_cost IS NULL) OR (estimated_cost > (0)::numeric)));
ALTER TABLE travel_requests ADD CONSTRAINT "travel_requests_estimated_currency_check" CHECK (((estimated_currency IS NULL) OR ((estimated_currency)::text ~ '^[A-Z]{3}$'::text)));
ALTER TABLE travel_requests ADD CONSTRAINT "travel_requests_pkey" PRIMARY KEY (id);
ALTER TABLE travel_requests ADD CONSTRAINT "travel_requests_purpose_check" CHECK (((purpose IS NULL) OR (char_length(purpose) <= 2000)));
ALTER TABLE travel_requests ADD CONSTRAINT "travel_requests_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])));
ALTER TABLE travel_requests ADD CONSTRAINT "travel_submitted_fields_required" CHECK (((status = 'draft'::text) OR ((destination IS NOT NULL) AND (from_date IS NOT NULL) AND (to_date IS NOT NULL) AND (purpose IS NOT NULL) AND (submitted_at IS NOT NULL))));
ALTER TABLE travel_requests ADD CONSTRAINT "travel_valid_date_range" CHECK (((from_date IS NULL) OR (to_date IS NULL) OR (to_date >= from_date)));
ALTER TABLE travel_status_history ADD CONSTRAINT "travel_status_history_pkey" PRIMARY KEY (id);
ALTER TABLE user_roles ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY (user_id);
SET check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.hris_own_employee_for_tenant(p_tenant_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
  SELECT e.id
  FROM public.employees e
  WHERE e.user_id = auth.uid()
    AND e.tenant_id = p_tenant_id
    AND e.employment_status NOT IN ('resigned', 'terminated')
    AND public.is_live_session()
  ORDER BY e.created_at
  LIMIT 1
$function$
;
CREATE OR REPLACE FUNCTION public.is_live_session()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'auth'
AS $function$
  select
    auth.uid() is not null
    and exists (
      select 1
      from auth.sessions s
      where s.id = nullif(auth.jwt()->>'session_id','')::uuid
        and s.user_id = auth.uid()
        and (s.not_after is null or s.not_after > now())
    );
$function$
;
CREATE OR REPLACE FUNCTION public.synesis_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select id
  from public.tenants
  where slug = 'synesis-it'
    and is_active = true
  limit 1;
$function$
;
CREATE OR REPLACE FUNCTION public.is_active_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
  select
    public.is_live_session()
    and exists (
      select 1
      from public.admin_users au
      join auth.users u on u.id = au.user_id
      where au.user_id = auth.uid()
        and au.active = true
        and u.email_confirmed_at is not null
    );
$function$
;
CREATE OR REPLACE FUNCTION public.admin_list_profile_change_requests()
 RETURNS TABLE(id uuid, employee_id uuid, employee_number text, full_name text, field_key text, requested_value text, reason text, submitted_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
begin
  if not public.is_live_session() or not public.has_permission('self_service.manage') then
    raise exception 'Self-service management permission required.' using errcode = '42501';
  end if;
  return query
    select r.id, r.employee_id, e.employee_number, e.full_name,
      r.field_key, r.requested_value, r.reason, r.submitted_at
    from public.employee_profile_change_requests r
    join public.employees e on e.id = r.employee_id and e.tenant_id = r.tenant_id
    where r.tenant_id = public.synesis_tenant_id() and r.status = 'pending'
    order by r.submitted_at asc
    limit 100;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_resolve_attendance_correction(p_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare v_request public.attendance_corrections%rowtype; v_record uuid;
begin
 if not public.has_permission('attendance.manage') then raise exception 'Attendance management permission required.' using errcode='42501'; end if;
 if p_decision not in('approved','rejected') then raise exception 'Decision must be approved or rejected.' using errcode='22000'; end if;
 select * into v_request from public.attendance_corrections where id=p_id and status='pending' for update;
 if not found then raise exception 'Pending correction request not found.' using errcode='P0002'; end if;

 if p_decision='approved' then
  v_record:=public.admin_save_attendance(v_request.employee_id,v_request.attendance_date,jsonb_build_object(
   'check_in',coalesce(v_request.requested_check_in::text,''),
   'check_out',coalesce(v_request.requested_check_out::text,''),
   'work_mode',coalesce(v_request.requested_work_mode,'office'),
   'client_name',coalesce(v_request.client_name,''),
   'status','present',
   'remarks',coalesce(p_note,'Approved attendance correction')
  ));
 end if;

 update public.attendance_corrections set status=p_decision,resolved_by=auth.uid(),resolved_at=now(),resolution_note=nullif(btrim(coalesce(p_note,'')),'')
 where id=p_id;

 insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
 values(auth.uid(),'attendance.correction.'||p_decision,'attendance_correction',p_id::text,jsonb_build_object('attendance_record_id',v_record,'note',p_note));
 return jsonb_build_object('success',true,'decision',p_decision,'attendance_record_id',v_record);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_resolve_leave_request(p_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  r public.leave_requests%rowtype;
  v_year integer;
  v_yfrom date;
  v_yto date;
  v_ydays numeric;
begin
  if not public.has_permission('leave.manage') then
    raise exception 'Leave management permission required.' using errcode='42501';
  end if;
  if p_decision not in('approved','rejected') then
    raise exception 'Decision must be approved or rejected.' using errcode='22000';
  end if;
  select * into r from public.leave_requests where id=p_id and status='pending' for update;
  if not found then raise exception 'Pending leave request not found.' using errcode='P0002'; end if;

  update public.leave_requests
  set status=p_decision,resolved_by=auth.uid(),resolved_at=now(),
      resolution_note=nullif(btrim(coalesce(p_note,'')),''),updated_at=now()
  where id=p_id;

  for v_year in select generate_series(extract(year from r.from_date)::integer,extract(year from r.to_date)::integer)
  loop
    v_yfrom:=greatest(r.from_date,make_date(v_year,1,1));
    v_yto:=least(r.to_date,make_date(v_year,12,31));
    v_ydays:=public.employee_calculate_leave_days(
      v_yfrom,v_yto,case when r.from_date=r.to_date then r.day_portion else 'full' end
    );
    update public.employee_leave_balances
    set pending_days=greatest(0,pending_days-v_ydays),
        used_days=used_days+case when p_decision='approved' then v_ydays else 0 end,
        updated_at=now()
    where employee_id=r.employee_id and leave_type_id=r.leave_type_id and balance_year=v_year;
  end loop;

  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  values(
    auth.uid(),'leave.request.'||p_decision,'leave_request',p_id::text,
    jsonb_build_object('note',p_note,'requested_days',r.requested_days,'day_portion',r.day_portion)
  );
  return jsonb_build_object('success',true,'decision',p_decision);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_review_profile_change_request(p_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  r public.employee_profile_change_requests%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_live_session() or not public.has_permission('self_service.manage') then
    raise exception 'Self-service management permission required.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 1000 then
    raise exception 'Review note must be 1000 characters or fewer.' using errcode = '22023';
  end if;

  select * into r
  from public.employee_profile_change_requests
  where id = p_id
    and tenant_id = public.synesis_tenant_id()
    and status = 'pending'
  for update;
  if not found then
    raise exception 'Pending profile change request not found.' using errcode = 'P0002';
  end if;

  if p_decision = 'approved' then
    update public.employees e set
      full_name = case when r.field_key = 'full_name' then r.requested_value else e.full_name end,
      official_email = case when r.field_key = 'official_email' then r.requested_value else e.official_email end,
      personal_email = case when r.field_key = 'personal_email' then r.requested_value else e.personal_email end,
      official_phone = case when r.field_key = 'official_phone' then r.requested_value else e.official_phone end,
      address = case when r.field_key = 'address' then r.requested_value else e.address end,
      mailing_address = case when r.field_key = 'mailing_address' then r.requested_value else e.mailing_address end,
      emergency_contact_name = case when r.field_key = 'emergency_contact_name' then r.requested_value else e.emergency_contact_name end,
      emergency_contact_phone = case when r.field_key = 'emergency_contact_phone' then r.requested_value else e.emergency_contact_phone end,
      emergency_contact_relation = case when r.field_key = 'emergency_contact_relation' then r.requested_value else e.emergency_contact_relation end,
      father_name = case when r.field_key = 'father_name' then r.requested_value else e.father_name end,
      mother_name = case when r.field_key = 'mother_name' then r.requested_value else e.mother_name end,
      birthplace = case when r.field_key = 'birthplace' then r.requested_value else e.birthplace end,
      blood_group = case when r.field_key = 'blood_group' then r.requested_value else e.blood_group end,
      religion = case when r.field_key = 'religion' then r.requested_value else e.religion end,
      nid_number = case when r.field_key = 'nid_number' then r.requested_value else e.nid_number end,
      passport_number = case when r.field_key = 'passport_number' then r.requested_value else e.passport_number end,
      etin_number = case when r.field_key = 'etin_number' then r.requested_value else e.etin_number end,
      updated_at = now()
    where e.id = r.employee_id and e.tenant_id = r.tenant_id;
    if not found then
      raise exception 'Linked employee record not found.' using errcode = 'P0002';
    end if;
  end if;

  update public.employee_profile_change_requests
  set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = v_note, updated_at = now()
  where id = r.id;
  insert into public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  values (
    auth.uid(), 'self_service.profile_change.' || p_decision,
    'employee_profile_change_request', r.id::text,
    jsonb_build_object('employee_id', r.employee_id, 'field_key', r.field_key)
  );
  return jsonb_build_object('success', true, 'status', p_decision);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_save_attendance(p_employee_id uuid, p_date date, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare v_tenant uuid:=public.synesis_tenant_id(); v_id uuid;
begin
 if not public.has_permission('attendance.manage') then raise exception 'Attendance management permission required.' using errcode='42501'; end if;
 if not exists(select 1 from public.employees where id=p_employee_id and tenant_id=v_tenant) then raise exception 'Employee not found.' using errcode='P0002'; end if;
 if p_date is null then raise exception 'Attendance date is required.' using errcode='22000'; end if;

 insert into public.attendance_records(tenant_id,employee_id,attendance_date,check_in,check_out,work_mode,client_name,status,source,remarks)
 values(v_tenant,p_employee_id,p_date,nullif(p_payload->>'check_in','')::timestamptz,nullif(p_payload->>'check_out','')::timestamptz,
  coalesce(nullif(p_payload->>'work_mode',''),'office'),nullif(btrim(coalesce(p_payload->>'client_name','')),''),
  coalesce(nullif(p_payload->>'status',''),'present'),'admin',nullif(btrim(coalesce(p_payload->>'remarks','')),''))
 on conflict(tenant_id,employee_id,attendance_date) do update set
  check_in=excluded.check_in,check_out=excluded.check_out,work_mode=excluded.work_mode,client_name=excluded.client_name,
  status=excluded.status,source='admin',remarks=excluded.remarks
 returning id into v_id;

 insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
 values(auth.uid(),'attendance.record.saved','attendance_record',v_id::text,jsonb_build_object('employee_id',p_employee_id,'date',p_date));
 return v_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.employee_get_my_profile_change_requests()
 RETURNS TABLE(id uuid, field_key text, reason text, status text, submitted_at timestamp with time zone, reviewed_at timestamp with time zone, review_note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_employee uuid := public.employee_for_auth_user();
  v_tenant uuid := public.synesis_tenant_id();
begin
  if not public.is_live_session() or v_employee is null or v_tenant is null then
    raise exception 'Active employee session required.' using errcode = '42501';
  end if;
  return query
    select r.id, r.field_key, r.reason, r.status, r.submitted_at, r.reviewed_at, r.review_note
    from public.employee_profile_change_requests r
    where r.employee_id = v_employee and r.tenant_id = v_tenant
    order by r.submitted_at desc
    limit 50;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.employee_submit_profile_change_request(p_field_key text, p_requested_value text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_employee uuid := public.employee_for_auth_user();
  v_tenant uuid := public.synesis_tenant_id();
  v_value text := nullif(btrim(coalesce(p_requested_value, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_current text;
  v_id uuid;
begin
  if not public.is_live_session() or v_employee is null or v_tenant is null then
    raise exception 'Active employee session required.' using errcode = '42501';
  end if;
  if p_field_key is null or p_field_key not in (
    'full_name', 'official_email', 'personal_email', 'official_phone',
    'address', 'mailing_address', 'emergency_contact_name',
    'emergency_contact_phone', 'emergency_contact_relation',
    'father_name', 'mother_name', 'birthplace', 'blood_group', 'religion',
    'nid_number', 'passport_number', 'etin_number'
  ) then
    raise exception 'This profile field is not available for an employee change request.' using errcode = '22023';
  end if;
  if v_value is null or length(v_value) > 500 then
    raise exception 'Enter a proposed value of 1 to 500 characters.' using errcode = '22023';
  end if;
  if v_reason is null or length(v_reason) > 1000 then
    raise exception 'Enter a reason of 1 to 1000 characters.' using errcode = '22023';
  end if;
  if p_field_key in ('official_email', 'personal_email')
     and v_value !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;

  select case p_field_key
    when 'full_name' then e.full_name
    when 'official_email' then e.official_email
    when 'personal_email' then e.personal_email
    when 'official_phone' then e.official_phone
    when 'address' then e.address
    when 'mailing_address' then e.mailing_address
    when 'emergency_contact_name' then e.emergency_contact_name
    when 'emergency_contact_phone' then e.emergency_contact_phone
    when 'emergency_contact_relation' then e.emergency_contact_relation
    when 'father_name' then e.father_name
    when 'mother_name' then e.mother_name
    when 'birthplace' then e.birthplace
    when 'blood_group' then e.blood_group
    when 'religion' then e.religion
    when 'nid_number' then e.nid_number
    when 'passport_number' then e.passport_number
    when 'etin_number' then e.etin_number
  end
  into v_current
  from public.employees e
  where e.id = v_employee and e.tenant_id = v_tenant;
  if not found then
    raise exception 'Linked employee record not found.' using errcode = 'P0002';
  end if;
  if v_current is not distinct from v_value then
    raise exception 'The proposed value matches the current value.' using errcode = '22023';
  end if;

  insert into public.employee_profile_change_requests(
    tenant_id, employee_id, requested_by, field_key, requested_value, reason
  ) values (v_tenant, v_employee, auth.uid(), p_field_key, v_value, v_reason)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'A pending request already exists for this profile field.' using errcode = '23505';
end;
$function$
;
CREATE OR REPLACE FUNCTION public.has_permission(p_permission_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_super boolean := false;
begin
  if not public.is_active_admin() then
    return false;
  end if;

  select au.is_super_admin
  into v_super
  from public.admin_users au
  where au.user_id = auth.uid()
    and au.active = true;

  if v_super is true then
    return exists (
      select 1
      from public.permissions p
      where p.id = p_permission_id
    );
  end if;

  return exists (
    select 1
    from public.user_roles ur
    join public.roles r
      on r.id = ur.role_id
     and r.active = true
    join public.role_permissions rp
      on rp.role_id = r.id
    where ur.user_id = auth.uid()
      and rp.permission_id = p_permission_id
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hris_admin_can_read_tenant(p_tenant_id uuid, p_permission_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
  SELECT
    p_tenant_id IS NOT NULL
    AND p_tenant_id = public.synesis_tenant_id()
    AND public.is_active_admin()
    AND public.has_permission(p_permission_id)
$function$
;
SET check_function_bodies = on;
CREATE POLICY "hris_notices_legacy_security_guard" ON public.notices AS RESTRICTIVE FOR SELECT TO authenticated USING (((tenant_id = synesis_tenant_id()) AND ((is_active_admin() AND (has_permission('notices.view'::text) OR has_permission('notices.manage'::text))) OR ((active IS TRUE) AND (hris_own_employee_for_tenant(tenant_id) IS NOT NULL) AND ((audience_type = 'all'::text) OR ((audience_type = 'department'::text) AND (audience_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = hris_own_employee_for_tenant(notices.tenant_id)) AND (e.tenant_id = notices.tenant_id) AND (e.department_id = notices.audience_id))))))))));
CREATE POLICY "notices_read" ON public.notices AS PERMISSIVE FOR SELECT TO authenticated USING (((active = true) OR has_permission('notices.manage'::text)));

INSERT INTO auth.users VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','super@example.invalid',now(),NULL,NULL),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','other@example.invalid',now(),NULL,NULL);
INSERT INTO public.admin_users(user_id,active,is_super_admin) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,true),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true,false);
INSERT INTO public.tenants(id,code,slug,name,is_active) VALUES
('11111111-1111-4111-8111-111111111111','SY','synesis-it','Synthetic hosted-shaped tenant',true);
INSERT INTO public.roles(id,name,active,is_system) VALUES
('hr_admin','Minimal administrator',true,false),('hris_system_admin','Legacy global administrator',true,true);
INSERT INTO public.permissions(id,module,action)
SELECT CASE WHEN i=1 THEN 'organization.manage' ELSE 'synthetic.permission.'||i END,'synthetic','read'
FROM generate_series(1,45) i;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT 'hris_system_admin',id FROM public.permissions;
INSERT INTO public.role_permissions(role_id,permission_id) VALUES('hr_admin','organization.manage');
INSERT INTO public.user_roles(user_id,role_id) VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','hris_system_admin');
INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status) VALUES
('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','hr_admin','active');

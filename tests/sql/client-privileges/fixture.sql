-- Disposable PostgreSQL 17 fixture only. No hosted credentials or records.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

CREATE TABLE public.leave_requests (id bigint PRIMARY KEY);
CREATE TABLE public.leave_types (id bigint PRIMARY KEY);
CREATE TABLE public.candidate_job_alerts (id bigint PRIMARY KEY);
CREATE TABLE public.employee_addresses (id bigint PRIMARY KEY);
CREATE TABLE public.employee_family_members (id bigint PRIMARY KEY);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_job_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_family_members ENABLE ROW LEVEL SECURITY;

-- Deliberately reproduce the excessive hosted maintenance grants. Positive
-- CRUD grants and service_role privileges must survive the correction.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

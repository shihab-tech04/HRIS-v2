-- Mask salary currency consistently with existing hidden salary amounts.
CREATE OR REPLACE FUNCTION public.candidate_public_jobs_source()
 RETURNS TABLE(id uuid, tenant_id uuid, reference_number text, title text, department_name text, team_name text, location_name text, workplace_type text, employment_type text, experience_level text, vacancy_count integer, min_experience_years numeric, education_requirement text, skills text[], responsibilities text[], requirements text[], benefits text[], salary_currency text, salary_min numeric, salary_max numeric, is_salary_published boolean, posted_date date, application_deadline date, required_documents text[], screening_questions jsonb, instructions text, status text, is_published boolean, is_active boolean, published_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
 SELECT id,
    tenant_id,
    reference_number,
    title,
    department_name,
    team_name,
    location_name,
    workplace_type,
    employment_type,
    experience_level,
    vacancy_count,
    min_experience_years,
    education_requirement,
    skills,
    responsibilities,
    requirements,
    benefits,
    CASE WHEN is_salary_published THEN salary_currency ELSE NULL::text END AS salary_currency,
        CASE
            WHEN is_salary_published THEN salary_min
            ELSE NULL::numeric
        END AS salary_min,
        CASE
            WHEN is_salary_published THEN salary_max
            ELSE NULL::numeric
        END AS salary_max,
    is_salary_published,
    posted_date,
    application_deadline,
    required_documents,
    screening_questions,
    instructions,
    status,
    is_published,
    is_active,
    published_at,
    created_at
   FROM jobs j
  WHERE tenant_id = (( SELECT tenants.id
           FROM tenants
          WHERE tenants.slug = 'synesis-it'::text)) AND is_published = true AND status = 'published'::text AND is_active = true AND (application_deadline IS NULL OR application_deadline >= CURRENT_DATE);
$function$


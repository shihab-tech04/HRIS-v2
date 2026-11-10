#!/usr/bin/env bash
# Protected exact-Main release for E06 attendance correction and E11 movement parity.
set -euo pipefail
umask 077

test "$GITHUB_REPOSITORY" = 'shihab-tech04/HRIS-v2'
test "$GITHUB_REF" = 'refs/heads/main'
test -n "$PGPASSWORD" || { echo 'HRIS DB credential unavailable'; exit 1; }
[[ "$PGHOST" =~ ^aws-[0-9]+-ap-northeast-2\.pooler\.supabase\.com$ ]] || {
  echo 'Invalid HRIS pooler host'; exit 1;
}

migration='20261110193754_hris_attendance_correction_movement_parity.sql'
source_sql="supabase/migrations/$migration"
test -s "$source_sql"
test "$(sha256sum "$source_sql" | cut -d ' ' -f1)" = 'ea8bcec380837da54f3696815239b2a03e5796f8faf599c99d8a31718dd143b1' || {
  echo 'Reviewed E06/E11 SQL bytes changed; no release'; exit 1;
}

python3 - <<'PY'
import json, os, re, subprocess, urllib.request
repo='shihab-tech04/HRIS-v2'
main=os.environ['GITHUB_SHA']
ids={key:os.environ[key] for key in
     ('SOURCE_BACKUP_RUN_ID','DATABASE_BACKUP_RUN_ID','RESTORE_RUN_ID')}
for run_id in ids.values():
    if not re.fullmatch(r'[1-9][0-9]{7,11}',run_id):
        raise SystemExit('Invalid recovery run ID')
for key in ('OFFSITE_SOURCE_ARCHIVE_SHA256','OFFSITE_DATABASE_ARCHIVE_SHA256'):
    if not re.fullmatch(r'[a-fA-F0-9]{64}',os.environ[key]):
        raise SystemExit('Invalid offsite SHA-256 value')

def get(path):
    req=urllib.request.Request('https://api.github.com/repos/'+repo+'/'+path,
      headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],
               'Accept':'application/vnd.github+json',
               'User-Agent':'HRIS-E06-E11-Gated-Release'})
    with urllib.request.urlopen(req,timeout=30) as response:
        return json.load(response)

if get('git/ref/heads/main').get('object',{}).get('sha') != main:
    raise SystemExit('Protected Main moved')
pr=get('pulls/196')
if pr.get('merged_at') is None or pr.get('base',{}).get('ref') != 'main' or not pr.get('merge_commit_sha'):
    raise SystemExit('E06/E11 implementation PR #196 is not merged into Main')
if subprocess.run(['git','merge-base','--is-ancestor',pr['merge_commit_sha'],main],check=False).returncode:
    raise SystemExit('PR #196 merge is not an ancestor of exact Main')

# Require feature SQL/Auth/browser tests on the reviewed PR head and a green
# build check on the protected Main commit being released.
pr_checks=get('commits/'+pr['head']['sha']+'/check-runs?per_page=100').get('check_runs',[])
for name in ('check','isolated-hris'):
    if not any(c.get('name')==name and c.get('status')=='completed'
               and c.get('conclusion')=='success' for c in pr_checks):
        raise SystemExit('PR #196 verification is not green: '+name)
main_checks=get('commits/'+main+'/check-runs?per_page=100').get('check_runs',[])
if not any(c.get('name')=='check' and c.get('status')=='completed'
           and c.get('conclusion')=='success' for c in main_checks):
    raise SystemExit('Exact protected Main build check is not green')

expected={
 'SOURCE_BACKUP_RUN_ID':('HRIS exact protected Main source history backup',
                         'hris-exact-main-source-'+main),
 'DATABASE_BACKUP_RUN_ID':('HRIS Step 1 - Encrypted database export',
                            'hris-db-encrypted-'+ids['DATABASE_BACKUP_RUN_ID']),
 'RESTORE_RUN_ID':('HRIS Step 1 - Isolated PostgreSQL restore proof',
                   'hris-restore-proof-'+ids['RESTORE_RUN_ID']),
}
for key,(name,artifact_name) in expected.items():
    run=get('actions/runs/'+ids[key])
    if (run.get('name')!=name or run.get('status')!='completed'
        or run.get('conclusion')!='success' or run.get('head_sha')!=main
        or run.get('head_branch')!='main'
        or run.get('repository',{}).get('full_name')!=repo):
        raise SystemExit('Recovery run is not successful for exact Main: '+key)
    artifacts=get('actions/runs/'+ids[key]+'/artifacts?per_page=100').get('artifacts',[])
    if not any(a.get('name')==artifact_name and a.get('expired') is False
               and a.get('size_in_bytes',0)>0 for a in artifacts):
        raise SystemExit('Exact recovery artifact missing, empty or expired: '+key)

source=os.environ['SOURCE_BACKUP_DIR']
bundle='hris-main-'+main+'.git.bundle'
if not os.path.isfile(os.path.join(source,bundle)):
    raise SystemExit('Exact-Main source bundle is missing')
if subprocess.run(['sha256sum','--check','--status','restore.sha256'],
                  cwd=source,check=False).returncode:
    raise SystemExit('Source backup SHA-256 verification failed')
source_sha=subprocess.check_output(['sha256sum',bundle],cwd=source,text=True).split()[0]
if source_sha.lower()!=os.environ['OFFSITE_SOURCE_ARCHIVE_SHA256'].lower():
    raise SystemExit('Drive source bundle hash does not match the verified exact-Main archive')
source_manifest=open(os.path.join(source,'restore-manifest.txt'),encoding='utf-8').read().splitlines()
for line in ('repo='+repo,'main='+main,'restored_main='+main):
    if line not in source_manifest:
        raise SystemExit('Source bundle restore manifest does not match exact Main')

database=os.environ['DATABASE_BACKUP_DIR']
encrypted='hris-replacement-'+ids['DATABASE_BACKUP_RUN_ID']+'.pgcustom.gpg'
if subprocess.run(['sha256sum','--check','--status','encrypted.sha256'],
                  cwd=database,check=False).returncode:
    raise SystemExit('Encrypted database backup SHA-256 verification failed')
database_sha=subprocess.check_output(['sha256sum',encrypted],cwd=database,text=True).split()[0]
if database_sha.lower()!=os.environ['OFFSITE_DATABASE_ARCHIVE_SHA256'].lower():
    raise SystemExit('Drive database archive hash does not match the encrypted export')
backup_manifest=open(os.path.join(database,'backup-manifest.txt'),encoding='utf-8').read().splitlines()
if ('source_project=xfuxnljfrgvusbrpvxpa' not in backup_manifest
    or 'github_run_id='+ids['DATABASE_BACKUP_RUN_ID'] not in backup_manifest):
    raise SystemExit('Encrypted database manifest does not match the requested project/run')

proof_file=os.path.join(os.environ['RESTORE_PROOF_DIR'],'manifest.txt')
if not os.path.isfile(proof_file):
    raise SystemExit('Isolated restore proof manifest is missing')
proof=open(proof_file,encoding='utf-8').read().splitlines()
for line in ('repository='+repo,'source_main_sha='+main,
             'backup_run_id='+ids['DATABASE_BACKUP_RUN_ID'],
             'restore_run_id='+ids['RESTORE_RUN_ID'],'restore_result=success'):
    if line not in proof:
        raise SystemExit('Isolated restore proof does not match exact Main/database backup')
print('PASS: exact Main, PR #196 verification, offsite checksums and isolated restore verified')
PY

db_psql() {
  docker run --rm --env PGHOST --env PGPORT --env PGDATABASE \
    --env PGUSER --env PGSSLMODE --env PGPASSWORD \
    postgres:17-alpine psql -X -q -A -t -v ON_ERROR_STOP=1 "$@"
}

scratch="$(mktemp -d "$RUNNER_TEMP/hris-attendance-release.XXXXXXXX")"
trap 'rm -rf "$scratch"' EXIT
db_psql -F '|' -c 'SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version' > "$scratch/before.tsv"
grep -Fxq '20261110120000|hris_work_from_home_request_parity' "$scratch/before.tsv" || {
  echo 'The prerequisite Work From Home migration is missing'; exit 1;
}
! grep -q '^20261110193754|' "$scratch/before.tsv" || { echo 'E06/E11 migration is already installed'; exit 1; }

db_psql -c "SELECT CASE WHEN
  to_regclass('public.attendance_corrections') IS NOT NULL
  AND to_regclass('public.attendance_records') IS NOT NULL
  AND to_regclass('public.service_requests') IS NOT NULL
  AND to_regclass('public.service_request_status_history') IS NOT NULL
  AND to_regclass('public.attendance_correction_settings') IS NOT NULL
  AND to_regclass('public.admin_audit_logs') IS NOT NULL
  AND to_regclass('public.tenants') IS NOT NULL
  AND to_regnamespace('private') IS NOT NULL
  AND to_regclass('storage.objects') IS NOT NULL
  AND to_regprocedure('storage.foldername(text)') IS NOT NULL
  AND to_regprocedure('public.is_live_session()') IS NOT NULL
  AND to_regprocedure('public.hris_own_employee_for_tenant(uuid)') IS NOT NULL
  AND to_regprocedure('public.has_tenant_permission(uuid,text)') IS NOT NULL
  AND to_regprocedure('public.admin_save_attendance(uuid,date,jsonb)') IS NOT NULL
  AND to_regprocedure('public.hris_submit_my_work_from_home_request(uuid,date,date,time,time,jsonb,text,text)') IS NOT NULL
  AND to_regprocedure('public.hris_update_my_work_from_home_request(uuid,uuid,date,date,time,time,jsonb,text,text)') IS NOT NULL
  AND to_regprocedure('public.hris_cancel_my_work_from_home_request(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('public.hris_resolve_tenant_work_from_home_request(uuid,uuid,text,text,text)') IS NOT NULL
  AND EXISTS (SELECT 1 FROM storage.buckets WHERE id='attendance-evidence' AND public=false)
  THEN 'ATTENDANCE_PRODUCTION_PRECHECK_PASS' ELSE 'ATTENDANCE_PRODUCTION_PRECHECK_FAIL' END;" |
  grep -Fxq 'ATTENDANCE_PRODUCTION_PRECHECK_PASS'

db_psql -c "SELECT 'users='||(SELECT count(*) FROM auth.users)::text
  ||'|employees='||(SELECT count(*) FROM public.employees)::text
  ||'|tenants='||(SELECT count(*) FROM public.tenants)::text
  ||'|service_requests='||(SELECT count(*) FROM public.service_requests)::text
  ||'|request_history='||(SELECT count(*) FROM public.service_request_status_history)::text
  ||'|attendance='||(SELECT count(*) FROM public.attendance_records)::text
  ||'|attendance_corrections='||(SELECT count(*) FROM public.attendance_corrections)::text
  ||'|correction_settings='||(SELECT count(*) FROM public.attendance_correction_settings)::text
  ||'|audit='||(SELECT count(*) FROM public.admin_audit_logs)::text;" > "$scratch/counts-before.txt"
db_psql -c "SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.schemaname,p.tablename,p.policyname),'[]'::jsonb)
  FROM pg_policies p WHERE p.schemaname IN ('public','storage')
    AND ((p.schemaname='public' AND p.tablename IN ('service_requests','service_request_status_history','attendance_records','attendance_corrections','attendance_correction_settings'))
      OR (p.schemaname='storage' AND p.tablename='objects' AND p.policyname IN ('attendance_evidence_own_select','hris_private_storage_tenant_read_guard')));" > "$scratch/policies-before.txt"
db_psql -c "SELECT table_name||'|'||grantee||'|'||privilege_type FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name IN ('service_requests','service_request_status_history','attendance_records','attendance_corrections','attendance_correction_settings')
  ORDER BY table_name,grantee,privilege_type;" > "$scratch/grants-before.txt"

supabase init --workdir "$scratch" --force >/dev/null
mkdir -p "$scratch/supabase/migrations"
while IFS='|' read -r version name; do
  [[ "$version" =~ ^[0-9]{14}$ && "$name" =~ ^[a-z0-9_]+$ ]] || exit 1
  : > "$scratch/supabase/migrations/${version}_${name}.sql"
done < "$scratch/before.tsv"
cp "$source_sql" "$scratch/supabase/migrations/$migration"
test "$(find "$scratch/supabase/migrations" -type f -name '*.sql' | wc -l)" -eq "$(( $(wc -l < "$scratch/before.tsv") + 1 ))"
cmp "$source_sql" "$scratch/supabase/migrations/$migration"

db_url="$(python3 - <<'PY'
import os, urllib.parse
username=urllib.parse.quote(os.environ['PGUSER'],safe='')
password=urllib.parse.quote(os.environ['PGPASSWORD'],safe='')
print('postgresql://'+username+':'+password+'@'+os.environ['PGHOST']+':5432/postgres?sslmode=require')
PY
)"
(cd "$scratch" && supabase db push --db-url "$db_url" --include-all --dry-run > "$scratch/plan.txt" 2>&1) || {
  echo 'Attendance SQL dry run failed; production database unchanged'; exit 1;
}
grep -Eo '[0-9]{14}_[a-z0-9_]+[.]sql' "$scratch/plan.txt" | sort -u > "$scratch/planned.txt"
printf '%s\n' "$migration" > "$scratch/expected.txt"
diff -u "$scratch/expected.txt" "$scratch/planned.txt" || {
  echo 'Dry run selected more than the approved E06/E11 migration'; exit 1;
}

test "$(git rev-parse HEAD)" = "$GITHUB_SHA"
db_psql -F '|' -c 'SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version' > "$scratch/pre-apply.tsv"
cmp "$scratch/before.tsv" "$scratch/pre-apply.tsv" || { echo 'Hosted migration history changed before apply'; exit 1; }
(cd "$scratch" && supabase --yes db push --db-url "$db_url" --include-all > "$scratch/apply.txt" 2>&1) || {
  echo 'Scoped E06/E11 SQL apply failed; inspect the protected workflow result'; exit 1;
}

db_psql -F '|' -c 'SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version' > "$scratch/after.tsv"
test "$(wc -l < "$scratch/after.tsv")" -eq "$(( $(wc -l < "$scratch/before.tsv") + 1 ))"
grep -Fxq '20261110120000|hris_work_from_home_request_parity' "$scratch/after.tsv"
grep -Fxq '20261110193754|hris_attendance_correction_movement_parity' "$scratch/after.tsv"
grep -v '^20261110193754|' "$scratch/after.tsv" > "$scratch/unchanged.tsv"
cmp "$scratch/before.tsv" "$scratch/unchanged.tsv"

db_psql -c "SELECT 'users='||(SELECT count(*) FROM auth.users)::text
  ||'|employees='||(SELECT count(*) FROM public.employees)::text
  ||'|tenants='||(SELECT count(*) FROM public.tenants)::text
  ||'|service_requests='||(SELECT count(*) FROM public.service_requests)::text
  ||'|request_history='||(SELECT count(*) FROM public.service_request_status_history)::text
  ||'|attendance='||(SELECT count(*) FROM public.attendance_records)::text
  ||'|attendance_corrections='||(SELECT count(*) FROM public.attendance_corrections)::text
  ||'|correction_settings='||(SELECT count(*) FROM public.attendance_correction_settings)::text
  ||'|audit='||(SELECT count(*) FROM public.admin_audit_logs)::text;" > "$scratch/counts-after.txt"
cmp "$scratch/counts-before.txt" "$scratch/counts-after.txt"
db_psql -c "SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.schemaname,p.tablename,p.policyname),'[]'::jsonb)
  FROM pg_policies p WHERE p.schemaname IN ('public','storage')
    AND ((p.schemaname='public' AND p.tablename IN ('service_requests','service_request_status_history','attendance_records','attendance_corrections','attendance_correction_settings'))
      OR (p.schemaname='storage' AND p.tablename='objects' AND p.policyname IN ('attendance_evidence_own_select','hris_private_storage_tenant_read_guard')));" > "$scratch/policies-after.txt"
cmp "$scratch/policies-before.txt" "$scratch/policies-after.txt"
db_psql -c "SELECT table_name||'|'||grantee||'|'||privilege_type FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name IN ('service_requests','service_request_status_history','attendance_records','attendance_corrections','attendance_correction_settings')
  ORDER BY table_name,grantee,privilege_type;" > "$scratch/grants-after.txt"
cmp "$scratch/grants-before.txt" "$scratch/grants-after.txt"

db_psql -c "SELECT CASE WHEN
  to_regprocedure('public.hris_submit_my_work_from_home_request(uuid,date,date,time,time,jsonb,text,text)') IS NOT NULL
  AND to_regprocedure('public.hris_update_my_work_from_home_request(uuid,uuid,date,date,time,time,jsonb,text,text)') IS NOT NULL
  AND to_regprocedure('public.hris_cancel_my_work_from_home_request(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('public.hris_resolve_tenant_work_from_home_request(uuid,uuid,text,text,text)') IS NOT NULL
  AND has_function_privilege('authenticated','public.hris_submit_my_work_from_home_request(uuid,date,date,time,time,jsonb,text,text)','EXECUTE')
  AND has_function_privilege('authenticated','public.hris_update_my_work_from_home_request(uuid,uuid,date,date,time,time,jsonb,text,text)','EXECUTE')
  AND has_function_privilege('authenticated','public.hris_cancel_my_work_from_home_request(uuid,uuid)','EXECUTE')
  AND has_function_privilege('authenticated','public.hris_resolve_tenant_work_from_home_request(uuid,uuid,text,text,text)','EXECUTE')
  AND NOT has_function_privilege('anon','public.hris_resolve_tenant_work_from_home_request(uuid,uuid,text,text,text)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.hris_resolve_tenant_work_from_home_request(uuid,uuid,text,text,text)','EXECUTE')
  AND to_regprocedure('public.hris_get_my_attendance_correction_context(uuid)') IS NOT NULL
  AND to_regprocedure('public.hris_employee_submit_attendance_correction(uuid,jsonb)') IS NOT NULL
  AND to_regprocedure('public.hris_employee_update_attendance_correction(uuid,uuid,jsonb)') IS NOT NULL
  AND to_regprocedure('public.hris_employee_cancel_attendance_correction(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('public.admin_resolve_attendance_correction(uuid,text,text)') IS NOT NULL
  AND to_regprocedure('public.hris_submit_my_movement_request(uuid,jsonb)') IS NOT NULL
  AND to_regprocedure('public.hris_resolve_tenant_movement_request(uuid,uuid,text,text,text)') IS NOT NULL
  AND to_regprocedure('public.hris_mark_my_movement_returned(uuid,uuid)') IS NOT NULL
  AND NOT has_function_privilege('anon','public.hris_get_my_attendance_correction_context(uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.hris_employee_submit_attendance_correction(uuid,jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon','public.hris_employee_update_attendance_correction(uuid,uuid,jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon','public.hris_employee_cancel_attendance_correction(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.admin_resolve_attendance_correction(uuid,text,text)','EXECUTE')
  AND NOT has_function_privilege('anon','public.hris_submit_my_movement_request(uuid,jsonb)','EXECUTE')
  AND NOT has_function_privilege('anon','public.hris_resolve_tenant_movement_request(uuid,uuid,text,text,text)','EXECUTE')
  AND NOT has_function_privilege('anon','public.hris_mark_my_movement_returned(uuid,uuid)','EXECUTE')
  AND has_function_privilege('authenticated','public.hris_get_my_attendance_correction_context(uuid)','EXECUTE')
  AND has_function_privilege('authenticated','public.hris_employee_submit_attendance_correction(uuid,jsonb)','EXECUTE')
  AND has_function_privilege('authenticated','public.hris_employee_update_attendance_correction(uuid,uuid,jsonb)','EXECUTE')
  AND has_function_privilege('authenticated','public.hris_employee_cancel_attendance_correction(uuid,uuid)','EXECUTE')
  AND has_function_privilege('authenticated','public.admin_resolve_attendance_correction(uuid,text,text)','EXECUTE')
  AND has_function_privilege('authenticated','public.hris_submit_my_movement_request(uuid,jsonb)','EXECUTE')
  AND has_function_privilege('authenticated','public.hris_resolve_tenant_movement_request(uuid,uuid,text,text,text)','EXECUTE')
  AND has_function_privilege('authenticated','public.hris_mark_my_movement_returned(uuid,uuid)','EXECUTE')
  AND has_function_privilege('service_role','public.hris_get_my_attendance_correction_context(uuid)','EXECUTE')
  AND has_function_privilege('service_role','public.hris_employee_submit_attendance_correction(uuid,jsonb)','EXECUTE')
  AND has_function_privilege('service_role','public.hris_employee_update_attendance_correction(uuid,uuid,jsonb)','EXECUTE')
  AND has_function_privilege('service_role','public.hris_employee_cancel_attendance_correction(uuid,uuid)','EXECUTE')
  AND has_function_privilege('service_role','public.admin_resolve_attendance_correction(uuid,text,text)','EXECUTE')
  AND has_function_privilege('service_role','public.hris_submit_my_movement_request(uuid,jsonb)','EXECUTE')
  AND has_function_privilege('service_role','public.hris_resolve_tenant_movement_request(uuid,uuid,text,text,text)','EXECUTE')
  AND has_function_privilege('service_role','public.hris_mark_my_movement_returned(uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','private.hris_attendance_correction_values(uuid,uuid,jsonb,text)','EXECUTE')
  AND NOT has_function_privilege('authenticated','private.hris_attendance_correction_values(uuid,uuid,jsonb,text)','EXECUTE')
  AND NOT has_function_privilege('service_role','private.hris_attendance_correction_values(uuid,uuid,jsonb,text)','EXECUTE')
  AND EXISTS (SELECT 1 FROM pg_class c WHERE c.oid='public.attendance_correction_settings'::regclass AND c.relrowsecurity)
  AND NOT has_table_privilege('anon','public.attendance_correction_settings','SELECT')
  AND NOT has_table_privilege('anon','public.attendance_correction_settings','INSERT')
  AND NOT has_table_privilege('anon','public.attendance_correction_settings','UPDATE')
  AND NOT has_table_privilege('anon','public.attendance_correction_settings','DELETE')
  AND NOT has_table_privilege('authenticated','public.attendance_correction_settings','SELECT')
  AND NOT has_table_privilege('authenticated','public.attendance_correction_settings','INSERT')
  AND NOT has_table_privilege('authenticated','public.attendance_correction_settings','UPDATE')
  AND NOT has_table_privilege('authenticated','public.attendance_correction_settings','DELETE')
  AND EXISTS (SELECT 1 FROM storage.buckets WHERE id='attendance-evidence' AND public=false)
  AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='attendance_corrections'
       AND column_name IN ('correction_categories','original_check_in','original_check_out','original_work_mode','original_client_name'))=5
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.attendance_records'::regclass
       AND conname='attendance_records_work_mode_check' AND pg_get_constraintdef(oid) LIKE '%client_meeting%')
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.attendance_corrections'::regclass
       AND conname='attendance_corrections_requested_work_mode_check' AND pg_get_constraintdef(oid) LIKE '%client_meeting%')
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.attendance_corrections'::regclass
       AND conname='attendance_corrections_categories_allowed')
  AND (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
       AND policyname IN ('attendance_evidence_own_select','hris_private_storage_tenant_read_guard'))=2
  THEN 'ATTENDANCE_PRODUCTION_POSTCHECK_PASS' ELSE 'ATTENDANCE_PRODUCTION_POSTCHECK_FAIL' END;" |
  grep -Fxq 'ATTENDANCE_PRODUCTION_POSTCHECK_PASS'

echo 'PASS: exactly the pinned E06/E11 migration applied; existing data, WFH, policies, grants, and RLS were preserved.'

#!/usr/bin/env bash
# Only the existing Employee Self-Service recovery may be released by this operator.
# Never call from a PR/feature branch or without separate offsite/restorable backups.
set -euo pipefail
umask 077

test "$GITHUB_REPOSITORY" = 'shihab-tech04/HRIS-v2'
test "$GITHUB_REF" = 'refs/heads/main'
test -n "${PGPASSWORD:-}" || { echo 'HRIS DB credential unavailable'; exit 1; }
[[ "$PGHOST" =~ ^aws-[0-9]+-ap-northeast-2\.pooler\.supabase\.com$ ]] || { echo 'Invalid HRIS pooler host'; exit 1; }

migration='20261109174000_hris_service_request_legacy_contract_forward_port.sql'
source_sql="supabase/migrations/$migration"
test -s "$source_sql"
test "$(sha256sum "$source_sql" | cut -d ' ' -f1)" = '2472b816193dc56480a447fc0f8a577f41df0580e211d0c3ebbc4ac0e4f608d4' || {
  echo 'Reviewed SQL bytes changed; no release'; exit 1;
}

python3 - <<'PY'
import json, os, re, urllib.request
repo='shihab-tech04/HRIS-v2'
main=os.environ['GITHUB_SHA']
before='2b2705c0ff3643df1a280eef873c33bce0e814db'
ids={'source':os.environ['SOURCE_BACKUP_RUN_ID'],
     'database':os.environ['DATABASE_BACKUP_RUN_ID'],
     'restore':os.environ['RESTORE_RUN_ID']}
for x in ids.values():
    if not re.fullmatch(r'[1-9][0-9]{7,11}',x):
        raise SystemExit('Invalid recovery run id')
expect={'source':('HRIS exact protected Main source history backup',
                  'hris-exact-main-source-'+before),
        'database':('HRIS Step 1 - Encrypted database export',
                    'hris-db-encrypted-'+ids['database']),
        'restore':('HRIS Step 1 - Isolated PostgreSQL restore proof',
                   'hris-restore-proof-'+ids['restore'])}
sha={'source':'cccda6aa429f9ff74aecd0688a99ff128e838a7506209d43a45fab499e5b6f2a',
     'database':'2b7e26a9ccf372880093ea94b6a94cd8f54acfab0d4c3f2ddf8181d615afdffb'}
for kind,val in sha.items():
    supplied=os.environ['OFFSITE_'+kind.upper()+'_SHA256']
    if not re.fullmatch('[a-fA-F0-9]{64}',supplied) or supplied.lower()!=val:
        raise SystemExit('Offsite '+kind+' backup checksum does not match verified archive')
def get(path):
    request=urllib.request.Request('https://api.github.com/repos/'+repo+'/'+path,
      headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],
               'Accept':'application/vnd.github+json',
               'User-Agent':'HRIS-Phase1-Gated-ServiceRequest-SQL'})
    with urllib.request.urlopen(request,timeout=30) as response: return json.load(response)
if get('git/ref/heads/main').get('object',{}).get('sha')!=main:
    raise SystemExit('Protected Main moved')
pr=get('pulls/187')
if pr.get('merged_at') is None or pr.get('merge_commit_sha')!='2d037bff09b821ca4e762a69ed39a794bc887ff4':
    raise SystemExit('Reviewed service-request PR is not merged')
checks=get('commits/'+main+'/check-runs?per_page=100').get('check_runs',[])
if not any(c.get('name')=='check' and c.get('status')=='completed'
           and c.get('conclusion')=='success' for c in checks):
    raise SystemExit('Exact protected Main build check is not green')
for kind,(name,artifact) in expect.items():
    run=get('actions/runs/'+ids[kind])
    if run.get('name')!=name or run.get('conclusion')!='success' or run.get('status')!='completed' \
       or run.get('head_sha')!=before or run.get('head_branch')!='main':
        raise SystemExit('Backup/restore run is not the approved pre-release Main: '+kind)
    objects=get('actions/runs/'+ids[kind]+'/artifacts?per_page=100').get('artifacts',[])
    if not any(a.get('name')==artifact and a.get('expired') is False
               and a.get('size_in_bytes',0)>0 for a in objects):
        raise SystemExit('Backup/restore proof artifact expired or missing: '+kind)
print('PASS: exact protected Main, reviewed PR, pre-release source/DB backups, and linked restore evidence')
PY

db_psql() {
  docker run --rm --env PGHOST --env PGPORT --env PGDATABASE \
    --env PGUSER --env PGSSLMODE --env PGPASSWORD \
    postgres:17-alpine psql -X -q -A -t -v ON_ERROR_STOP=1 "$@"
}

scratch="$(mktemp -d "$RUNNER_TEMP/hris-existing-service-requests.XXXXXXXX")"
trap 'rm -rf "$scratch"' EXIT
db_psql -F '|' -c 'SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version' > "$scratch/before.tsv"
test "$(wc -l < "$scratch/before.tsv")" -eq 135 || { echo 'Hosted migration baseline moved'; exit 1; }
grep -Fxq '20261106090000|hris_new_workforce_account' "$scratch/before.tsv"
! grep -q '^20261109174000|' "$scratch/before.tsv"

# Confirm missing contracts and that no person/request data is silently rewritten.
db_psql -c "SELECT CASE WHEN
  to_regprocedure('public.hris_get_my_service_requests(uuid)') IS NULL
  AND to_regprocedure('public.hris_submit_my_service_request(uuid,text,text)') IS NULL
  AND to_regprocedure('public.hris_get_tenant_service_requests(uuid)') IS NULL
  AND to_regprocedure('public.hris_resolve_tenant_service_request(uuid,uuid,text,text,text)') IS NULL
  AND to_regclass('public.service_request_status_history') IS NULL
  THEN 'MISSING_OK' ELSE 'STATE_CHANGED' END;" | grep -Fxq 'MISSING_OK' || {
    echo 'Target service-request objects changed before release'; exit 1;
  }
db_psql -c "SELECT (SELECT count(*) FROM auth.users), (SELECT count(*) FROM public.employees),
  (SELECT count(*) FROM public.service_requests), (SELECT count(*) FROM public.tenants),
  (SELECT count(*) FROM public.admin_audit_logs);" > "$scratch/counts-before.txt"
db_psql -c "SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.policyname),'[]'::jsonb)
  FROM pg_policies p WHERE p.schemaname='public' AND p.tablename='service_requests';" > "$scratch/policies-before.txt"
db_psql -c "SELECT has_table_privilege('anon','public.service_requests','SELECT'),
  has_table_privilege('authenticated','public.service_requests','SELECT'),
  has_table_privilege('authenticated','public.service_requests','INSERT'),
  has_table_privilege('authenticated','public.service_requests','UPDATE'),
  has_table_privilege('authenticated','public.service_requests','DELETE');" > "$scratch/grants-before.txt"

supabase init --workdir "$scratch" --force >/dev/null
mkdir -p "$scratch/supabase/migrations"
while IFS='|' read -r version name; do
  [[ "$version" =~ ^[0-9]{14}$ && "$name" =~ ^[a-z0-9_]+$ ]] || exit 1
  : > "$scratch/supabase/migrations/${version}_${name}.sql"
done < "$scratch/before.tsv"
cp "$source_sql" "$scratch/supabase/migrations/$migration"
test "$(find "$scratch/supabase/migrations" -type f -name '*.sql' | wc -l)" -eq 136
cmp "$source_sql" "$scratch/supabase/migrations/$migration"

# Private runner-only connection string; never echo it or expose it in an artifact.
db_url="$(python3 - <<'PY'
import os, urllib.parse
username=urllib.parse.quote(os.environ['PGUSER'],safe='')
password=urllib.parse.quote(os.environ['PGPASSWORD'],safe='')
print('postgresql://'+username+':'+password+'@'+os.environ['PGHOST']+':5432/postgres?sslmode=require')
PY
)"
(cd "$scratch" && supabase db push --db-url "$db_url" --include-all --dry-run > "$scratch/plan.txt" 2>&1) || {
  echo 'SQL dry run failed'; exit 1;
}
grep -Eo '[0-9]{14}_[a-z0-9_]+[.]sql' "$scratch/plan.txt" | sort -u > "$scratch/planned.txt"
printf '%s\n' "$migration" > "$scratch/expected.txt"
diff -u "$scratch/expected.txt" "$scratch/planned.txt" || {
  echo 'More than the approved one migration was selected'; exit 1;
}

# Detect concurrent GitHub or hosted DB changes before applying.
test "$(git rev-parse HEAD)" = "$GITHUB_SHA"
db_psql -F '|' -c 'SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version' > "$scratch/pre-apply.tsv"
cmp "$scratch/before.tsv" "$scratch/pre-apply.tsv" || { echo 'DB changed before apply'; exit 1; }

(cd "$scratch" && supabase --yes db push --db-url "$db_url" --include-all > "$scratch/apply.txt" 2>&1) || {
  echo 'Scoped SQL apply failed; inspect private logs and recovery proof'; exit 1;
}
db_psql -F '|' -c 'SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version' > "$scratch/after.tsv"
test "$(wc -l < "$scratch/after.tsv")" -eq 136
grep -Fxq '20261109174000|hris_service_request_legacy_contract_forward_port' "$scratch/after.tsv"
grep -v '^20261109174000|' "$scratch/after.tsv" > "$scratch/unchanged.tsv"
cmp "$scratch/before.tsv" "$scratch/unchanged.tsv"

db_psql -c "SELECT (SELECT count(*) FROM auth.users), (SELECT count(*) FROM public.employees),
  (SELECT count(*) FROM public.service_requests), (SELECT count(*) FROM public.tenants),
  (SELECT count(*) FROM public.admin_audit_logs);" > "$scratch/counts-after.txt"
cmp "$scratch/counts-before.txt" "$scratch/counts-after.txt"
db_psql -c "SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.policyname),'[]'::jsonb)
  FROM pg_policies p WHERE p.schemaname='public' AND p.tablename='service_requests';" > "$scratch/policies-after.txt"
cmp "$scratch/policies-before.txt" "$scratch/policies-after.txt"
db_psql -c "SELECT has_table_privilege('anon','public.service_requests','SELECT'),
  has_table_privilege('authenticated','public.service_requests','SELECT'),
  has_table_privilege('authenticated','public.service_requests','INSERT'),
  has_table_privilege('authenticated','public.service_requests','UPDATE'),
  has_table_privilege('authenticated','public.service_requests','DELETE');" > "$scratch/grants-after.txt"
cmp "$scratch/grants-before.txt" "$scratch/grants-after.txt"

db_psql -c "SELECT CASE WHEN
  to_regprocedure('public.hris_get_my_service_requests(uuid)') IS NOT NULL
  AND to_regprocedure('public.hris_submit_my_service_request(uuid,text,text)') IS NOT NULL
  AND to_regprocedure('public.hris_get_tenant_service_requests(uuid)') IS NOT NULL
  AND to_regprocedure('public.hris_resolve_tenant_service_request(uuid,uuid,text,text,text)') IS NOT NULL
  AND to_regclass('public.service_request_status_history') IS NOT NULL
  AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.service_request_status_history'::regclass)
  AND NOT has_table_privilege('anon','public.service_request_status_history','SELECT')
  AND NOT has_table_privilege('authenticated','public.service_request_status_history','SELECT')
  AND NOT has_function_privilege('anon','public.hris_submit_my_service_request(uuid,text,text)','EXECUTE')
  AND NOT has_function_privilege('anon','public.hris_resolve_tenant_service_request(uuid,uuid,text,text,text)','EXECUTE')
  AND has_function_privilege('authenticated','public.hris_get_my_service_requests(uuid)','EXECUTE')
  AND has_function_privilege('authenticated','public.hris_submit_my_service_request(uuid,text,text)','EXECUTE')
  AND has_function_privilege('authenticated','public.hris_get_tenant_service_requests(uuid)','EXECUTE')
  AND has_function_privilege('authenticated','public.hris_resolve_tenant_service_request(uuid,uuid,text,text,text)','EXECUTE')
  THEN 'PASS' ELSE 'FAIL' END;" | grep -Fxq 'PASS'
echo 'PASS: single service-request SQL recovery applied and verified; unrelated rows, policies and privileges preserved.'

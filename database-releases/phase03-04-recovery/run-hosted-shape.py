"""Synthetic PostgreSQL 17 only: no production URL or connector credentials."""
import csv, hashlib, io, json, os, pathlib, subprocess
root = pathlib.Path(__file__).resolve().parent
if os.environ.get('PGDATABASE') != 'hris_recovery_synthetic' or os.environ.get('PGHOST') != '127.0.0.1':
    raise SystemExit('Refusing non-disposable database')
def sql(text, expect_ok=True):
    result = subprocess.run(['psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1'], input=text, text=True, capture_output=True)
    if expect_ok and result.returncode:
        raise RuntimeError(result.stderr)
    if not expect_ok and result.returncode == 0:
        raise RuntimeError('Expected fail-closed transaction unexpectedly succeeded')
    return result
package = (root/'phase03_phase04_hosted_compatibility.sql').read_text()
assert hashlib.sha256(package.encode()).hexdigest() == 'fa390e603bb08ad2417e11d627304cce2197ad003aa44c4f097cc7ea1dcf82ed'
lines = package.splitlines()
assert sum(x.strip() == 'BEGIN;' for x in lines) == 1
assert sum(x.strip() == 'COMMIT;' for x in lines) == 1
start = next(i for i,x in enumerate(lines) if x.strip() == 'BEGIN;')
end = max(i for i,x in enumerate(lines) if x.strip() == 'COMMIT;')
body = '\n'.join(lines[start+1:end])
sql((root/'hosted-shape.synthetic.sql').read_text())
snapshot = """SELECT jsonb_build_object(
 'tables',(SELECT md5(string_agg(table_name||'.'||column_name||':'||udt_name,'|' ORDER BY table_name,ordinal_position)) FROM information_schema.columns WHERE table_schema='public'),
 'functions',(SELECT md5(string_agg(pg_get_functiondef(p.oid),'|' ORDER BY p.oid::regprocedure::text)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','private') AND p.prokind='f'),
 'policies',(SELECT md5(string_agg(to_jsonb(p)::text,'|' ORDER BY schemaname,tablename,policyname)) FROM pg_policies p),
 'admins',(SELECT jsonb_agg(to_jsonb(a) ORDER BY user_id) FROM public.admin_users a),
 'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY tenant_id,user_id) FROM public.tenant_memberships m),
 'role_permissions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY role_id,permission_id) FROM public.role_permissions r),
 'auth',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM auth.users u)
);"""
before = sql(snapshot).stdout.strip()
rejected = sql('BEGIN;\n' + body + '\nSELECT 1/0; COMMIT;', False)
assert 'division by zero' in rejected.stderr, rejected.stderr
assert sql(snapshot).stdout.strip() == before
print('PASS atomic failed-first-install rollback preserves schema, functions, policies, Auth, admins, memberships and role grants')
negative = sql("""BEGIN;
INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
VALUES('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','hr_admin','active');
""" + body + '\nCOMMIT;', False)
assert 'topology changed' in negative.stderr, negative.stderr
assert sql(snapshot).stdout.strip() == before
print('PASS preflight refuses second-administrator tenant assignment and leaves no partial installation')
sql(package)
parity = (root.parents[1]/'tests/sql/hosted-parity/check-read-only.sql').read_text().rstrip().rstrip(';')
checks = json.loads(sql('SELECT jsonb_agg(to_jsonb(g)) FROM ('+parity+') g;').stdout)
assert len(checks) == 26 and all(x['passed'] for x in checks), checks
assert sql("SELECT public.hris_can_read_learning_catalog(NULL::uuid);").stdout.strip() == 'f'
assert sql("SELECT has_function_privilege('anon','public.hris_can_read_learning_catalog(uuid)','EXECUTE');").stdout.strip() == 'f'
assert sql("SELECT has_function_privilege('authenticated','public.hris_can_read_learning_catalog(uuid)','EXECUTE');").stdout.strip() == 't'
print('PASS first install from production-shaped missing-dependency baseline; 26/26 catalog parity; learning-helper ACL and null-tenant rejection')
sql(package)
checks = json.loads(sql('SELECT jsonb_agg(to_jsonb(g)) FROM ('+parity+') g;').stdout)
assert len(checks) == 26 and all(x['passed'] for x in checks)
assert sql("SELECT count(*) FROM public.admin_users WHERE active AND is_super_admin;").stdout.strip() == '1'
assert sql("SELECT count(*) FROM public.tenant_memberships m JOIN public.admin_users a ON a.user_id=m.user_id WHERE a.active AND NOT a.is_super_admin AND lower(m.status)='active';").stdout.strip() == '0'
print('PASS replay retains 26/26 parity, sole Super Admin and unassigned second administrator')
print('Synthetic schema rehearsal only; hosted production acceptance NOT EXECUTED by this job.')

# Rehearse the source-backed ACL follow-up independently of the applied package.
acl = (root/'learning_context_acl.sql').read_text()
definition_before = sql("SELECT md5(pg_get_functiondef('public.hris_get_my_learning_context(uuid)'::regprocedure));").stdout.strip()
acl_before = sql("SELECT proacl::text FROM pg_proc WHERE oid='public.hris_get_my_learning_context(uuid)'::regprocedure;").stdout.strip()
acl_lines = acl.splitlines()
a_start = next(i for i,x in enumerate(acl_lines) if x.strip() == 'BEGIN;')
a_end = max(i for i,x in enumerate(acl_lines) if x.strip() == 'COMMIT;')
acl_body = '\n'.join(acl_lines[a_start+1:a_end])
sql('BEGIN;\n'+acl_body+'\nROLLBACK;')
assert sql("SELECT proacl::text FROM pg_proc WHERE oid='public.hris_get_my_learning_context(uuid)'::regprocedure;").stdout.strip() == acl_before
sql(acl)
assert sql("SELECT md5(pg_get_functiondef('public.hris_get_my_learning_context(uuid)'::regprocedure));").stdout.strip() == definition_before
assert sql("SELECT has_function_privilege('anon','public.hris_get_my_learning_context(uuid)','EXECUTE');").stdout.strip() == 'f'
assert sql("SELECT has_function_privilege('authenticated','public.hris_get_my_learning_context(uuid)','EXECUTE') AND has_function_privilege('service_role','public.hris_get_my_learning_context(uuid)','EXECUTE');").stdout.strip() == 't'
sql(acl)
print('PASS learning-context ACL follow-up: rollback, apply, replay, definition preservation, anonymous denial and authenticated/service access')

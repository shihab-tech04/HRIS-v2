// Compile HRIS User Management migrations only on the disposable local PG17 stack.
// Never connect to a hosted database and never commit writes: entire test rolls back.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const workdir = resolve(process.env.HRIS_SUPABASE_TEST_WORKDIR || '/tmp/synesis-local-hris-test');
if (!['/tmp/synesis-local-hris-test','/private/tmp/synesis-local-hris-test'].includes(workdir)) {
  throw new Error('Only the dedicated disposable HRIS workdir may run this SQL test.');
}
const context = process.env.HRIS_DOCKER_CONTEXT || 'default';
const container = execFileSync('docker',['--context',context,'ps','--filter',
  'name=supabase_db_synesis-local-hris-test','--format','{{.Names}}'],
  { encoding:'utf8' }).trim().split(/\r?\n/)[0];
if (container !== 'supabase_db_synesis-local-hris-test') {
  throw new Error('Refusing to run without exact disposable Supabase Postgres container.');
}
const psql = sql => execFileSync('docker',[
  '--context',context,'exec','-i',container,'psql','-X','-q',
  '-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'
],{ encoding:'utf8',input:sql,stdio:['pipe','pipe','pipe'],maxBuffer:4*1024*1024 });
const pgVersion=psql('SHOW server_version_num;').trim().match(/(\d{6})/);
if (!pgVersion || !pgVersion[1].startsWith('17')) {
  throw new Error('Refusing to run outside disposable PostgreSQL 17.');
}
const base=readFileSync(new URL('../../../supabase/migrations/20261105093000_hris_scoped_user_finalization.sql',import.meta.url),'utf8');
const newUser=readFileSync(new URL('../../../supabase/migrations/20261106090000_hris_new_workforce_account.sql',import.meta.url),'utf8');
const sql = [
  'BEGIN;',
  base,
  newUser,
  `DO $verify$
  BEGIN
    IF to_regprocedure('public.admin_finalize_new_workforce_user(uuid,uuid,uuid,text,text,text)') IS NULL THEN
      RAISE EXCEPTION 'Missing new-employee finalization RPC';
    END IF;
    IF has_function_privilege('anon',
      'public.admin_finalize_new_workforce_user(uuid,uuid,uuid,text,text,text)','EXECUTE')
    OR has_function_privilege('authenticated',
      'public.admin_finalize_new_workforce_user(uuid,uuid,uuid,text,text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.admin_finalize_new_workforce_user(uuid,uuid,uuid,text,text,text)','EXECUTE') THEN
      RAISE EXCEPTION 'New-employee privileged RPC execution grants are unsafe';
    END IF;
    IF to_regprocedure('public.admin_finalize_system_user(uuid,uuid,text,uuid,text)') IS NULL THEN
      RAISE EXCEPTION 'Existing employee-linking RPC lost';
    END IF;
  END;
  $verify$;`,
  'ROLLBACK;'
].join('\n');
psql(sql);
console.log('PASS: both user-provisioning SQL migrations compile on disposable PG17, grants correct, transaction rolled back.');

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const sql=readFileSync(new URL('../../supabase/staging/feature-projects/projects-hosted-dependency-preflight-read-only.sql',import.meta.url),'utf8');
test('Projects hosted preflight never mutates production SQL or returns identity records',()=>{
 assert.match(sql,/SOURCE_CANDIDATE_ONLY_BACKUP_AND_ISOLATED_AUTH_TEST_REQUIRED/);
 for (const name of ['projects','project_allocations','hris_get_tenant_project_workspace','hris_own_employee_for_tenant','has_tenant_permission','is_live_session']) assert.ok(sql.includes(name),name);
 assert.match(sql,/REVIEW_PARTIAL_INSTALLATION/);
 assert.match(sql,/BLOCKED_SOURCE_HELPERS/);
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE|GRANT|REVOKE)\s+(?:INTO|FROM|TABLE|FUNCTION|POLICY|public)/i);
 assert.doesNotMatch(sql,/SELECT\s+.*\b(?:user_id|email|session_id)\b/i);
});

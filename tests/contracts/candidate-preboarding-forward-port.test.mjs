import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const original=readFileSync(new URL('../../supabase/migrations/20261013190200_hris_candidate_preboarding_workflow.sql',import.meta.url),'utf8');
const staged=readFileSync(new URL('../../supabase/migrations/20261024200001_hris_preboarding_missing_rpcs_forward_port.sql',import.meta.url),'utf8');
const segment=(str,start,end)=>str.slice(str.indexOf(start),str.indexOf(end));
test('preboarding structural alterations copied exactly from canonical source',()=>{
 const a='ALTER TABLE public.onboarding_handoffs\\n'.replace('\\n','\n');
 const b='ALTER TABLE public.onboarding_handoffs ENABLE ROW LEVEL SECURITY;';
 assert.equal(segment(staged,a,'CREATE OR REPLACE FUNCTION public.candidate_get_my_preboarding_handoff'),segment(original,a,b)+'\n');
});
test('three missing RPC source definitions retained without rewriting existing offer RPC or RLS policies',()=>{
 const start='CREATE OR REPLACE FUNCTION public.candidate_get_my_preboarding_handoff';
 const end='REVOKE ALL ON FUNCTION public.candidate_respond_offer_record';
 const expected=segment(original,start,end)
   .replace(
     "WHERE step=ANY(v_handoff.candidate_completed_steps || ARRAY[p_step_key]::text[]));",
     "WHERE step=p_step_key\n      OR step=ANY(COALESCE(v_handoff.candidate_completed_steps,ARRAY[]::text[])));"
   )
   .replace(
     "WHERE h.candidate_submitted_at IS NOT NULL AND h.status IN ('in_progress','completed');",
     "WHERE h.candidate_submitted_at IS NOT NULL AND h.status IN ('in_progress','completed','submitted_for_verification');"
   ).trim();
 assert.ok(staged.includes(expected));
 assert.match(staged,/h\.status IN \('in_progress','completed','submitted_for_verification'\)/);
 assert.equal((staged.match(/CREATE OR REPLACE FUNCTION public\./g)||[]).length,3);
 assert.doesNotMatch(staged,/CREATE OR REPLACE FUNCTION public\.candidate_respond_offer_record|DROP POLICY|CREATE POLICY/);
 for(const name of ['candidate_get_my_preboarding_handoff','candidate_save_my_preboarding_step','hris_get_candidate_preboarding_queue']){
   assert.match(staged,new RegExp('REVOKE ALL ON FUNCTION public\\.'+name+'\\('));
   assert.match(staged,new RegExp('GRANT EXECUTE ON FUNCTION public\\.'+name+'\\('));
 }
 assert.match(staged,/is_live_session\(\)/);
 assert.match(staged,/auth\.uid\(\)/);
 assert.match(staged,/has_tenant_permission\(p_tenant_id,'recruitment\.manage'\)/);
});

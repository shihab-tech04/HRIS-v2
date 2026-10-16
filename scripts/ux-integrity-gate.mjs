#!/usr/bin/env node
/**
 * UX Design Intelligence Agent operational verification controller (v1).
 * Verifies actual source files, manifests and evidence digests; does NOT certify
 * that an asserted human approval occurred. Independent visual review is external.
 * No npm dependencies. Node 20+.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const validSha = x => typeof x === 'string' && /^[0-9a-f]{40}$/i.test(x);
const validDigest = x => typeof x === 'string' && /^[0-9a-f]{64}$/i.test(x);
const hasText = x => typeof x === 'string' && !!x.trim();
const checkStatus = x => x === 'PASS';
const safePath = x => hasText(x) && !path.isAbsolute(x) && !x.split(/[\\/]/).includes('..');
const readFile = (root, file) => {
  if (!safePath(file)) throw Error(`Invalid file path ${JSON.stringify(file)}`);
  // Lexical containment alone is insufficient: a checked-out symlink can
  // redirect a seemingly safe evidence path outside the repository.
  const base=fs.realpathSync(root);
  const target=fs.realpathSync(path.resolve(root,file));
  if (!target.startsWith(base+path.sep)) throw Error(`Invalid file boundary ${file}`);
  return fs.readFileSync(target);
};
const runGit=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const unique = xs => [...new Set(xs)];

export function validate({manifest,root,stage='audit',git=null}) {
  const errors=[],warnings=[],proof=[];
  const fail=(id,msg)=>errors.push({id,message:msg});
  const warn=(id,msg)=>warnings.push({id,message:msg});
  const isRelease = stage==='predeploy'||stage==='postdeploy';
  if (!['audit','predeploy','postdeploy'].includes(stage)) throw Error('Invalid stage');
  if (manifest?.schemaVersion !== 'ux-agent/operational-v1') fail('SCHEMA','Exact operational-v1 schema required');
  if(!hasText(manifest?.project)) fail('PROJECT','Project identifier required');
  if(!hasText(manifest?.changeId)) fail('CHANGE_ID','Approved change request ID required');
  if(!hasText(manifest?.author)) fail('AUTHOR','Change author identity required');
  if(!validSha(manifest?.baseSHA)) fail('BASE_SHA','Full 40-hex source baseline required');
  if(!validSha(manifest?.candidateSHA)) fail('CANDIDATE_SHA','Full 40-hex candidate required');
  if(manifest?.baseSHA === manifest?.candidateSHA) warn('NO_SOURCE_CHANGE','Baseline and candidate SHA are identical');

  if (!Array.isArray(manifest?.authorities)||manifest.authorities.length===0) fail('AUTHORITY','Original approved requirements/design authority must be identified');
  else for(const [i,a] of manifest.authorities.entries()) {
    if(!hasText(a?.id)||!hasText(a?.source)||!hasText(a?.decision)) fail('AUTHORITY',`Authority ${i} lacks source/decision`);
    if(a?.status!=='APPROVED' && a?.status!=='CONFLICT_REQUIRES_DECISION') fail('AUTHORITY',`Authority ${i} has unresolved status`);
    if(isRelease && a?.status!=='APPROVED') fail('AUTHORITY_CONFLICT',`Authority ${i} not independently resolved`);
  }

  // The reviewed route/data contract is rechecked against CURRENT candidate bytes.
  // Never keep a historical failed-source probe hardcoded after a verified repair.
  if(!Array.isArray(manifest?.sourceExpectations)||!manifest.sourceExpectations.length)
    fail('SOURCE_CONTRACT','At least one independently approved current-source probe is required');
  else for(const probe of manifest.sourceExpectations){
    if(!hasText(probe?.id)||!hasText(probe?.requirementId)||!safePath(probe?.file)){
      fail('SOURCE_CONTRACT','Invalid current-source probe');continue;
    }
    if(probe.reviewedSourceSHA!==manifest.candidateSHA)fail('STALE_SOURCE_CONTRACT',`${probe.id}: source expectation is not tied to candidate SHA`);
    if(!Array.isArray(probe.required)||!Array.isArray(probe.forbidden)||(!probe.required.length&&!probe.forbidden.length)){
      fail('SOURCE_CONTRACT',`${probe.id}: required/forbidden regex inventory missing`);continue;
    }
    try {
      const current=readFile(root,probe.file).toString('utf8');
      for(const pattern of probe.required)if(!new RegExp(pattern,'m').test(current))fail('SOURCE_REQUIREMENT',`${probe.id}: expected pattern absent in current source`);
      for(const pattern of probe.forbidden)if(new RegExp(pattern,'m').test(current))fail('SOURCE_FORBIDDEN',`${probe.id}: prohibited pattern remains in current source`);
    }catch(e){fail('SOURCE_CONTRACT',`${probe.id}: cannot inspect source: ${e.message}`)}
  }

  const paths=manifest?.scope?.allowedPaths;
  if(!Array.isArray(paths)||!paths.length||paths.some(x=>!safePath(x))||unique(paths).length!==paths.length)
    fail('SCOPE','Approved nonempty unique exact path list required');
  const actual = git?.changedPaths;
  if(isRelease && !Array.isArray(actual)) fail('DIFF','Verified git diff required for release');
  if(!git?.headSHA && !isRelease) warn('GIT_UNVERIFIED','Audit does not have checked-out source provenance; do not treat it as acceptance');
  if(Array.isArray(actual)&&Array.isArray(paths)){
    const extra=unique(actual).filter(p=>!paths.includes(p));
    if(extra.length)fail('SCOPE_UNAUTHORIZED',`Unexpected changed paths: ${extra.join(', ')}`);
    else proof.push(`Diff scope: ${unique(actual).length} changed paths allowed`);
  }
  if(!Array.isArray(manifest?.scope?.visibleElementChanges))fail('VISIBLE_MANIFEST','Visible-element change inventory is required (empty array allowed)');
  else for(const c of manifest.scope.visibleElementChanges){
    if(!hasText(c?.id)||!hasText(c?.approvedRequirementId)||!hasText(c?.reviewEvidence))fail('UNAPPROVED_VISIBLE_CHANGE',`Visible change ${c?.id||'?'} missing independent source approval`);
  }
  if(!Array.isArray(manifest?.scope?.forbiddenElements)||!manifest.scope.forbiddenElements.length)
    fail('NEGATIVE_SPACE_INVENTORY','At least one explicit forbidden-element assertion is required');
  for(const neg of (Array.isArray(manifest?.scope?.forbiddenElements)?manifest.scope.forbiddenElements:[])){
    if(!safePath(neg.file)||!hasText(neg.pattern)) {fail('NEGATIVE_SPACE','Invalid forbidden element assertion');continue}
    try {if(new RegExp(neg.pattern,'m').test(readFile(root,neg.file).toString('utf8')))fail('FORBIDDEN_UI',`Forbidden element found in ${neg.file}: ${neg.id||neg.pattern}`)}
    catch(e){fail('NEGATIVE_SPACE',`Cannot check negative-space assertion: ${e.message}`)}
  }

  const states = manifest?.affectedStates;
  if(!Array.isArray(states)||!states.length)fail('IMPACT','At least one affected source/UI state required');
  else {
    const ids=states.map(s=>s?.id).filter(hasText);
    if(unique(ids).length!==states.length)fail('IMPACT_DUPLICATE','Every affected UI state needs a unique ID');
  }
  if(Array.isArray(states)) for(const [i,s] of states.entries()) {
    const key=hasText(s?.id)?s.id:`state-${i}`;
    for(const field of ['route','role','locale','viewport','fixture','interaction']) if(!hasText(s?.[field]))fail('STATE_DESCRIPTOR',`${key}: missing ${field}`);
    const target=s?.baseline;
    if(target?.role !== 'APPROVED_TARGET') fail('BASELINE_ROLE',`${key}: broken/current screenshot cannot be golden`);
    if(!hasText(target?.reviewer)||target?.reviewer===manifest.author||!hasText(target?.approvalEvidence))fail('BASELINE_APPROVAL',`${key}: independent baseline approval not attested`);
    if(!validDigest(target?.sha256)||!safePath(target?.path))fail('BASELINE_DIGEST',`${key}: immutable SHA256/path missing`);
    else {
      try {
        const bytes = git?.baselineBytes?.[key] ?? readFile(root,target.path);
        if(sha256(bytes)!==target.sha256)fail('BASELINE_MISMATCH',`${key}: baseline bytes do not match approved SHA256`);
        else proof.push(`${key}: approved baseline bytes digest matches`);
      }catch(e){fail('BASELINE_MISSING',`${key}: cannot inspect baseline: ${e.message}`)}
    }
    const compare=s?.comparison;
    if(!checkStatus(compare?.status)||!hasText(compare?.testRef)||!hasText(compare?.reviewer)||compare?.reviewer===manifest.author||!hasText(compare?.approvalEvidence))fail('VISUAL_COMPARISON',`${key}: independently reviewed actual visual comparison missing`);
    if(!validDigest(compare?.reportSHA256)||!safePath(compare?.reportPath))fail('VISUAL_REPORT',`${key}: actual comparison report hash/path missing`);
    else {
      try {if(sha256(readFile(root,compare.reportPath))!==compare.reportSHA256)fail('VISUAL_REPORT_MISMATCH',`${key}: comparison report digest mismatch`)}
      catch(e){fail('VISUAL_REPORT_MISSING',`${key}: ${e.message}`)}
    }
    const task=s?.interactionQA;
    if(!checkStatus(task?.status)||!hasText(task?.testRef)||!hasText(task?.executionEvidence))fail('TASK_USABILITY',`${key}: complete-task interaction/keyboard/geometry evidence missing`);
  }

  if(!Array.isArray(manifest?.requirements)||!manifest.requirements.length)fail('REQUIREMENTS','Authentic requirement coverage rows required');
  else for(const r of manifest.requirements){
    if(!hasText(r.id)||!hasText(r.source)||!hasText(r.expectation))fail('REQUIREMENT_SOURCE','Missing authentic requirement ID/text/source');
    if(!checkStatus(r.status)||!hasText(r.testRef)||!hasText(r.evidence))fail('REQUIREMENT_UNVERIFIED',`${r.id||'?'}: independent acceptance evidence not passed`);
  }
  if(Array.isArray(manifest?.requirements)){
    const ids=manifest.requirements.map(r=>r?.id).filter(hasText);
    if(unique(ids).length!==manifest.requirements.length)fail('REQUIREMENT_DUPLICATE','Every requirement needs a unique ID');
    for(const probe of (Array.isArray(manifest?.sourceExpectations)?manifest.sourceExpectations:[]))
      if(!ids.includes(probe?.requirementId))fail('SOURCE_TRACEABILITY',`${probe?.id||'?'} does not reference an inventoried requirement`);
  }
  if(!Array.isArray(manifest?.blockingDefects))fail('DEFECT_REGISTER','Known defect register required');
  else for(const d of manifest.blockingDefects){if(!hasText(d.id)||!hasText(d.severity)||!hasText(d.status))fail('DEFECT_REGISTER','Incomplete known defect row');else if(isRelease && d.status!=='CLOSED' && (d.severity==='P0'||d.severity==='P1'))fail('OPEN_BLOCKER',`${d.id}: release-blocking defect remains ${d.status}`)}

  if(!Array.isArray(manifest?.releaseChecks)||!manifest.releaseChecks.length)fail('TEST_EVIDENCE','At least one release check required');
  else for(const check of manifest.releaseChecks){if(!checkStatus(check.status)||!hasText(check.name)||!hasText(check.evidence)||!hasText(check.sourceSHA)||check.sourceSHA!==manifest.candidateSHA)fail('TEST_EVIDENCE',`${check.name||'?'} test not tied to verified candidate source SHA`)}

  if(git?.headSHA && git.headSHA!==manifest.candidateSHA) fail('SOURCE_DRIFT','Candidate manifest SHA differs from checked-out source HEAD');
  if(stage==='postdeploy'){
    const d=manifest?.deployment;
    if(!d||d.status!=='PASS'||d.sourceSHA!==manifest.candidateSHA||!hasText(d.url)||!hasText(d.readbackEvidence))fail('DEPLOYMENT','Independent deployed asset/source readback not verified');
  }
  const status=errors.length?'BLOCKED':stage==='audit'&&!git?.headSHA?'AUDIT_UNVERIFIED':stage==='audit'?'AUDIT_EVIDENCE_COMPLETE':'EVIDENCE_CHECK_PASS_NOT_AUTOMATIC_ACCEPTANCE';
  return {schemaVersion:'ux-agent/report-v1',stage,project:manifest?.project,status,errors,warnings,proof};
}

function selfTest() {
  const root=fs.mkdtempSync(path.join(process.cwd(),'ux-gate-fixture-'));
  try {
    fs.writeFileSync(path.join(root,'baseline.png'),'independently-approved-baseline');
    fs.writeFileSync(path.join(root,'visual-report.json'),'test-report-evidence');
    fs.writeFileSync(path.join(root,'screen.tsx'),'<button>Save</button>');
    const base={schemaVersion:'ux-agent/operational-v1',project:'Sample',changeId:'CR-01',author:'developer',baseSHA:'a'.repeat(40),candidateSHA:'b'.repeat(40),
      sourceExpectations:[{id:'SAVE-BUTTON',requirementId:'REQ-01',file:'screen.tsx',reviewedSourceSHA:'b'.repeat(40),required:['Save'],forbidden:['OfficeManagementLogin']}],
      authorities:[{id:'DS-01',source:'approved-reference-id',decision:'preserve',status:'APPROVED'}],
      scope:{allowedPaths:['screen.tsx'],visibleElementChanges:[],forbiddenElements:[{id:'NO-REMOVE',file:'screen.tsx',pattern:'Remove last'}]},
      affectedStates:[{id:'home.desktop.en',route:'/home',role:'user',locale:'en',viewport:'1280x800',fixture:'fixture-v1',interaction:'modal-open',
        baseline:{role:'APPROVED_TARGET',path:'baseline.png',sha256:sha256('independently-approved-baseline'),reviewer:'independent-reviewer',approvalEvidence:'signed-baseline-reference'},
        comparison:{status:'PASS',testRef:'visual-test-123',reviewer:'independent-reviewer',approvalEvidence:'review-ack',reportPath:'visual-report.json',reportSHA256:sha256('test-report-evidence')},
        interactionQA:{status:'PASS',testRef:'browser-run',executionEvidence:'CI-run-123'}}],
      requirements:[{id:'REQ-01',source:'approved-spec',expectation:'Save works and control visible',status:'PASS',testRef:'browser-run',evidence:'screenshot+interaction'}],
      blockingDefects:[],releaseChecks:[{name:'browser',status:'PASS',evidence:'CI-run-123',sourceSHA:'b'.repeat(40)}],
      deployment:{status:'PASS',sourceSHA:'b'.repeat(40),url:'https://example.invalid/',readbackEvidence:'browser CI readback'}};
    const git={changedPaths:['screen.tsx'],headSHA:'b'.repeat(40)};
    const t=(mutate,stage='predeploy')=>{const m=structuredClone(base);mutate(m);return validate({manifest:m,root,stage,git})};
    let tests=0;
    const ok=(mutate=()=>{},stage='predeploy')=>{const v=t(mutate,stage);assert.equal(v.errors.length,0,JSON.stringify(v.errors));tests++};
    const blocked=(id,mutate,stage='predeploy')=>{const v=t(mutate,stage);assert.ok(v.errors.some(e=>e.id===id),`${id} not caught: ${JSON.stringify(v.errors)}`);tests++};
    ok();ok(()=>{},'postdeploy');
    blocked('SCOPE_UNAUTHORIZED',m=>m.scope.allowedPaths=[]);
    blocked('STALE_SOURCE_CONTRACT',m=>m.sourceExpectations[0].reviewedSourceSHA='a'.repeat(40));
    blocked('SOURCE_REQUIREMENT',m=>m.sourceExpectations[0].required=['Wrong label']);
    blocked('SOURCE_FORBIDDEN',m=>m.sourceExpectations[0].forbidden=['Save']);
    blocked('UNAPPROVED_VISIBLE_CHANGE',m=>m.scope.visibleElementChanges.push({id:'extra-button'}));
    blocked('FORBIDDEN_UI',m=>m.scope.forbiddenElements[0].pattern='Save');
    blocked('NEGATIVE_SPACE_INVENTORY',m=>m.scope.forbiddenElements=[]);
    blocked('SOURCE_TRACEABILITY',m=>m.sourceExpectations[0].requirementId='GHOST-REQ');
    blocked('IMPACT_DUPLICATE',m=>m.affectedStates.push(structuredClone(m.affectedStates[0])));
    blocked('REQUIREMENT_DUPLICATE',m=>m.requirements.push(structuredClone(m.requirements[0])));
    blocked('BASELINE_ROLE',m=>m.affectedStates[0].baseline.role='CURRENT_DEFECT');
    blocked('BASELINE_APPROVAL',m=>m.affectedStates[0].baseline.reviewer='developer');
    blocked('BASELINE_MISMATCH',m=>m.affectedStates[0].baseline.sha256='0'.repeat(64));
    blocked('VISUAL_COMPARISON',m=>m.affectedStates[0].comparison.status='NOT_VERIFIED');
    blocked('VISUAL_REPORT_MISMATCH',m=>m.affectedStates[0].comparison.reportSHA256='0'.repeat(64));
    blocked('TASK_USABILITY',m=>m.affectedStates[0].interactionQA.status='FAIL');
    blocked('REQUIREMENT_UNVERIFIED',m=>m.requirements[0].status='NOT_VERIFIED');
    blocked('OPEN_BLOCKER',m=>m.blockingDefects.push({id:'BUG-1',severity:'P0',status:'OPEN'}));
    blocked('TEST_EVIDENCE',m=>m.releaseChecks[0].sourceSHA='a'.repeat(40));
    blocked('DEPLOYMENT',m=>m.deployment.sourceSHA='a'.repeat(40),'postdeploy');
    blocked('AUTHORITY_CONFLICT',m=>m.authorities[0].status='CONFLICT_REQUIRES_DECISION');
    blocked('SOURCE_DRIFT',m=>m.candidateSHA='c'.repeat(40));
    const outside=fs.mkdtempSync(path.join(process.cwd(),'ux-external-'));
    try {
      fs.writeFileSync(path.join(outside,'leak.txt'),'not repository evidence');
      fs.symlinkSync(path.join(outside,'leak.txt'),path.join(root,'external-symlink.txt'));
      blocked('SOURCE_CONTRACT',m=>m.sourceExpectations[0].file='external-symlink.txt');
    } finally {fs.rmSync(outside,{recursive:true,force:true})}
    const audit=validate({manifest:structuredClone(base),root,stage:'audit',git:null});
    assert.equal(audit.status,'AUDIT_UNVERIFIED');tests++;
    console.log(`PASS: ${tests} positive/negative executable integrity tests`);
  } finally {fs.rmSync(root,{recursive:true,force:true})}
}

async function cli(){
  const args=process.argv.slice(2);
  if(args.includes('--self-test'))return selfTest();
  const stage=(args.includes('--postdeploy')?'postdeploy':args.includes('--predeploy')?'predeploy':'audit');
  const idx=args.indexOf('--manifest');const loc=idx>=0?args[idx+1]:'';
  if(!loc){console.error('Usage: node ux-integrity-gate.mjs --self-test | --manifest evidence.json [--repo-root repo] [--audit|--predeploy|--postdeploy]');process.exitCode=2;return}
  const manifest=JSON.parse(fs.readFileSync(loc,'utf8'));
  const repoIdx=args.indexOf('--repo-root');
  const root=path.resolve(repoIdx>=0 ? args[repoIdx+1] : process.cwd());
  let git=null;
  try {const headSHA=runGit(root,['rev-parse','HEAD']); const diff=runGit(root,['diff','--name-only',manifest.baseSHA,'HEAD']);const changedPaths=diff?diff.split('\n'):[];
    const baselineBytes={};for(const s of manifest.affectedStates??[]){if(s.baseline?.path)baselineBytes[s.id]=execFileSync('git',['show',`${manifest.baseSHA}:${s.baseline.path}`],{cwd:root,stdio:['ignore','pipe','pipe']})};
    git={headSHA,changedPaths,baselineBytes};
  }catch(e){if(stage!=='audit'){console.error('BLOCKED: cannot independently inspect source git diff/baselines:',e.message);process.exitCode=2;return}}
  const result=validate({manifest,root,stage,git});
  console.log(JSON.stringify(result,null,2));
  if(result.errors.length)process.exitCode=2;
}
cli().catch(e=>{console.error('BLOCKED: unexpected verification error',e);process.exitCode=2});

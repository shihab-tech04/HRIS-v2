#!/usr/bin/env node
/** Product integrity gate v1 — contracts are approval evidence *references*, not self-certification.
 * No dependencies. Static coverage cannot substitute for browser, Figma or live Auth/RLS verification.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(thisDir, '..');
const modeArg = process.argv.find(a => a.startsWith('--mode='));
const mode = modeArg?.slice('--mode='.length) || 'audit';
if (!['audit', 'release', 'self-test', 'pr'].includes(mode)) {
  console.error('Valid modes: audit | pr | release | self-test'); process.exit(2);
}
function readRelative(file, base = root) {
  const canonicalBase = fs.realpathSync(base);
  const full = fs.realpathSync(path.resolve(base, file));
  if (!full.startsWith(canonicalBase + path.sep)) throw Error('Path escapes repository: ' + file);
  return fs.readFileSync(full, 'utf8');
}
function checkedHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding:'utf8'}).trim();
}
function probe(check, base = root) {
  let source;
  try { source = readRelative(check.path, base); }
  catch (error) { return { id: check.id, pass: false, detail: `Cannot read ${check.path}: ${error.code || error.message}` }; }
  let matched = false;
  if (check.op === 'contains') matched = source.includes(check.text);
  else if (check.op === 'not_contains') matched = !source.includes(check.text);
  else if (check.op === 'json_field_equals') {
    try { let data = JSON.parse(source); for (const key of check.field.split('.')) data = data?.[key]; matched = data === check.value; }
    catch { matched = false; }
  } else if (check.op === 'json_story_inventory') {
    try {
      const data = JSON.parse(source);
      const moduleIds = new Set((data.modules || []).map(m => m.id));
      const ids = new Set();
      matched = data.schema_version === 'source-verified-traceability-1.0'
        && data.source_sha256 === check.sourceSha256
        && createHash('sha256').update(source).digest('hex') === check.integritySha256
        && data.story_total === check.value && data.module_total === check.moduleCount
        && data.stories?.length === check.value && data.modules?.length === check.moduleCount
        && Array.isArray(data.validation_anomalies) && data.validation_anomalies.length === 0
        && data.stories.every(story => {
          if (!story?.story_id || ids.has(story.story_id) || !moduleIds.has(story.module_id)
              || !story?.verbatim_requirement?.trim() || !story?.source_locator?.file_id
              || !Number.isInteger(story.source_locator.line) || story.source_locator.line < 1) return false;
          ids.add(story.story_id); return true;
        });
    } catch { matched = false; }
  } else if (check.op === 'json_story_coverage') {
    try {
      const data = JSON.parse(source), stories = data.acceptedStories;
      const originalSource = readRelative('docs/programme/CANONICAL_USER_STORY_MATRIX.json', base);
      const original = JSON.parse(originalSource);
      const originalIds = new Set(original.stories.map(story => story.story_id));
      const ids = new Set();
      matched = data.schema === 'hris/story-acceptance-v1'
        && data.sourceMatrixSha256 === check.sourceMatrixSha256
        && createHash('sha256').update(originalSource).digest('hex') === data.sourceMatrixSha256
        && Array.isArray(stories) && stories.length === check.value && stories.every(story => {
        const id = story?.storyId;
        if (typeof id !== 'string' || !originalIds.has(id) || ids.has(id)) return false;
        ids.add(id);
        return story?.status === 'PASS' && typeof story?.acceptanceCriteria === 'string'
          && !!story.acceptanceCriteria.trim() && Array.isArray(story?.testIds)
          && story.testIds.length > 0 && typeof story?.evidenceReference === 'string'
          && !!story.evidenceReference.trim() && typeof story?.reviewer === 'string'
          && !!story.reviewer.trim() && /^[0-9a-f]{40}$/i.test(story?.reviewedSourceSha || '');
      });
    } catch { matched = false; }
  } else throw Error('Unsupported probe operation: ' + check.op);
  return { id: check.id, pass: matched, detail: matched ? 'Observed' : `Mismatch: ${check.path} (${check.op})` };
}
function validate(contract, sourceSha = null) {
  assert.equal(contract.schema, 'product-integrity/1');
  assert.ok(contract.product && contract.sourceOfApproval);
  assert.ok(Array.isArray(contract.checks) && contract.checks.length > 0);
  assert.ok(Array.isArray(contract.requiredEvidence) && contract.requiredEvidence.length > 0);
  const ids = new Set();
  for (const x of contract.checks) {
    assert.ok(x.id && x.path && x.op && x.reason && x.approvalReference, 'Incomplete check');
    assert.ok(!ids.has(x.id), 'Duplicate check ID: ' + x.id); ids.add(x.id);
    assert.ok(['release','always'].includes(x.enforcement));
    if (x.op === 'contains' || x.op === 'not_contains') assert.equal(typeof x.text, 'string');
    else if (x.op === 'json_field_equals') assert.equal(typeof x.field, 'string');
    else if (x.op === 'json_story_inventory') {
      assert.ok(Number.isInteger(x.value) && x.value > 0 && Number.isInteger(x.moduleCount) && x.moduleCount > 0);
      assert.match(x.sourceSha256, /^[a-f0-9]{64}$/i);
      assert.match(x.integritySha256, /^[a-f0-9]{64}$/i);
    }
    else if (x.op === 'json_story_coverage') {
      assert.ok(Number.isInteger(x.value) && x.value > 0);
      assert.match(x.sourceMatrixSha256, /^[a-f0-9]{64}$/i);
    }
    else throw Error('Unsupported contract operation: ' + x.op);
  }
  for (const x of contract.requiredEvidence) {
    assert.ok(x.id && x.description && x.reference && x.status, 'Incomplete evidence');
    assert.ok(['VERIFIED', 'NOT_VERIFIED', 'BLOCKED', 'CONFLICT', 'FAILED'].includes(x.status));
    assert.ok(!ids.has(x.id)); ids.add(x.id);
    if (x.status === 'VERIFIED') {
      assert.ok(x.reviewer && x.evidence && x.verifiedSourceSha, `VERIFIED requires independent reviewer, evidence and observed source SHA: ${x.id}`);
      assert.match(x.verifiedSourceSha, /^[a-f0-9]{40}$/i, `VERIFIED requires a full source SHA: ${x.id}`);
      if (sourceSha) assert.equal(x.verifiedSourceSha, sourceSha, `Stale VERIFIED evidence for ${x.id}`);
    }
  }
}
function impactsVisibleUi(file) {
  const normalized = file.replace(/\\/g, '/');
  if (/^(?:index\.html|(?:vite|tailwind|postcss|next)\.config\.[cm]?[jt]s)$/i.test(normalized)) return true;
  return /^(?:src|app|components|pages|styles|public|assets|static)\//.test(normalized)
    && /\.(?:ts|tsx|js|jsx|css|scss|sass|less|html|htm|mdx|svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|json)$/i.test(normalized);
}
function checkUiManifest(changedFiles, base = root) {
  const ui = changedFiles.filter(impactsVisibleUi);
  if (!ui.length) return [];
  const manifest = JSON.parse(readRelative('docs/product-integrity/ui-change-manifest.json', base));
  if (manifest.schema !== 'approved-ui-change/1' || !Array.isArray(manifest.changes)) throw Error('UI manifest schema invalid');
  return ui.filter(f => !manifest.changes.some(e => e.path === f && e.requirement && e.approvalReference && e.approvedDesign && Array.isArray(e.forbiddenAdditions)));
}
function changedFiles() {
  const base = process.env.PRODUCT_INTEGRITY_BASE_REF || process.env.GITHUB_BASE_REF || 'main';
  // GitHub Actions checkout must fetch-depth: 0, so expected baseline can be checked independently.
  return execFileSync('git', ['diff', '--name-only', `origin/${base}...HEAD`], {cwd: root, encoding:'utf8'}).split(/\r?\n/).filter(Boolean);
}
function selfTest() {
  const tmp = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || '/tmp', 'product-integrity-'));
  try {
    fs.writeFileSync(path.join(tmp, 'source.txt'), 'approved route /my-account');
    const base = { id:'t', path:'source.txt', op:'not_contains', text:'office-management' };
    assert.equal(probe(base, tmp).pass, true);
    assert.equal(probe({...base, text:'/my-account'}, tmp).pass, false);
    assert.equal(probe({...base, op:'contains', text:'/my-account'}, tmp).pass, true);
    assert.equal(probe({...base, path:'../escape'}, tmp).pass, false);
    const outside = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || '/tmp','product-integrity-outside-'));
    try {
      fs.writeFileSync(path.join(outside,'secret.txt'), 'approved route /my-account');
      fs.symlinkSync(path.join(outside,'secret.txt'), path.join(tmp,'external-link.txt'));
      assert.equal(probe({...base,path:'external-link.txt',op:'contains',text:'/my-account'},tmp).pass,false);
    } finally { fs.rmSync(outside,{recursive:true,force:true}); }
    fs.writeFileSync(path.join(tmp, 'story.json'), JSON.stringify({ mapped_story_count: 0 }));
    assert.equal(probe({id:'count',path:'story.json',op:'json_field_equals',field:'mapped_story_count',value:1047},tmp).pass,false);
    assert.equal(probe({id:'stories',path:'story.json',op:'json_story_coverage',value:1047},tmp).pass,false);
    fs.mkdirSync(path.join(tmp,'docs/programme'),{recursive:true});
    const sample = {schema_version:'source-verified-traceability-1.0',source_sha256:'a'.repeat(64),story_total:1,module_total:1,
      validation_anomalies:[],modules:[{id:'E01'}],stories:[{story_id:'E01-01',module_id:'E01',verbatim_requirement:'Original user story',source_locator:{file_id:'original-source',line:11}}]};
    const sampleSource = JSON.stringify(sample), matrixSha = createHash('sha256').update(sampleSource).digest('hex');
    fs.writeFileSync(path.join(tmp,'docs/programme/CANONICAL_USER_STORY_MATRIX.json'),sampleSource);
    const inventory = {id:'source',path:'docs/programme/CANONICAL_USER_STORY_MATRIX.json',op:'json_story_inventory',value:1,moduleCount:1,sourceSha256:sample.source_sha256,integritySha256:matrixSha};
    assert.equal(probe(inventory,tmp).pass,true);
    assert.equal(probe({...inventory,integritySha256:'0'.repeat(64)},tmp).pass,false);
    const accepted = {schema:'hris/story-acceptance-v1',sourceMatrixSha256:matrixSha,acceptedStories:[{storyId:'E01-01',status:'PASS',acceptanceCriteria:'Verified in complete user journey',testIds:['browser-1'],evidenceReference:'CI-run-1',reviewer:'independent-reviewer',reviewedSourceSha:'b'.repeat(40)}]};
    fs.writeFileSync(path.join(tmp,'docs/programme/HRIS_STORY_ACCEPTANCE.json'),JSON.stringify(accepted));
    const coverage = {id:'coverage',path:'docs/programme/HRIS_STORY_ACCEPTANCE.json',op:'json_story_coverage',value:1,sourceMatrixSha256:matrixSha};
    assert.equal(probe(coverage,tmp).pass,true);
    accepted.acceptedStories[0].storyId='invented-story';
    fs.writeFileSync(path.join(tmp,'docs/programme/HRIS_STORY_ACCEPTANCE.json'),JSON.stringify(accepted));
    assert.equal(probe(coverage,tmp).pass,false);
    fs.mkdirSync(path.join(tmp,'docs/product-integrity'),{recursive:true});
    fs.writeFileSync(path.join(tmp,'docs/product-integrity/ui-change-manifest.json'),JSON.stringify({schema:'approved-ui-change/1',changes:[]}));
    const newlyCovered = ['public/logo.svg', 'index.html', 'src/router.ts', 'styles/app.css', 'tailwind.config.js'];
    assert.deepEqual(checkUiManifest(newlyCovered, tmp), newlyCovered);
    assert.equal(impactsVisibleUi('docs/README.md'), false);
    assert.equal(impactsVisibleUi('src/components/Modal.tsx'), true);
    const valid={schema:'product-integrity/1',product:'Example',sourceOfApproval:'accepted requirements',
      checks:[{id:'SRC-1',path:'source.txt',op:'contains',text:'/my-account',reason:'route',approvalReference:'decision',enforcement:'release'}],
      requiredEvidence:[{id:'E-1',description:'browser evidence',reference:'run',status:'VERIFIED',reviewer:'reviewer',evidence:'approved review',verifiedSourceSha:'a'.repeat(40)}]};
    assert.doesNotThrow(()=>validate(valid,'a'.repeat(40)));
    assert.throws(()=>validate(valid,'b'.repeat(40)),/Stale VERIFIED evidence/);
    // UI-change manifest accepts only explicitly traced changes; see checkUiManifest path in repository execution.
    console.log('PASS — wrong-route, zero-story, symlink-escape and stale-evidence-SHA cases correctly reject.');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
if (mode === 'self-test') { selfTest(); process.exit(0); }
if (mode === 'pr') {
  try {
    const paths = changedFiles();
    const missing = checkUiManifest(paths);
    if (missing.length) { console.error('FAIL — untraced UI files:', missing.join(', ')); process.exit(1); }
    console.log(`PASS — change traceability contract: ${paths.length} changed files; no untraced visible UI source.`);
    console.log('LIMIT — approval references require an independent reviewer; syntax is not consent.');
    process.exit(0);
  } catch (error) { console.error('BLOCKED — cannot verify PR change inventory:', error.message); process.exit(2); }
}
let contract;
let sourceSha;
try { sourceSha = checkedHead(); }
catch (error) { if(mode==='release'){ console.error('BLOCKED — cannot verify source commit:',error.message); process.exit(2); } sourceSha = null; }
try { contract = JSON.parse(readRelative('docs/product-integrity/contract.json')); validate(contract,sourceSha); }
catch (error) { console.error('BLOCKED — invalid/missing approved product contract:', error.message); process.exit(2); }
const results = contract.checks.map(probeCheck => ({ ...probe(probeCheck), enforcement:probeCheck.enforcement, reason:probeCheck.reason }));
const unresolved = contract.requiredEvidence.filter(e => e.status !== 'VERIFIED');
const blockers = results.filter(r => !r.pass && (mode === 'release' || r.enforcement === 'always'));
for (const item of results) console.log(`${item.pass?'PASS':'FAIL'} ${item.id}: ${item.detail} — ${item.reason}`);
for (const item of contract.requiredEvidence) console.log(`${item.status} ${item.id}: ${item.description}; reference=${item.reference}`);
const report = {schema:'product-integrity-report/1', product:contract.product, mode, sourceSha:sourceSha || 'LOCAL_UNVERIFIED', staticChecks:results, requiredEvidence:contract.requiredEvidence, verdict:mode==='release'?(blockers.length||unresolved.length?'NOT_ACCEPTED':'STATIC_GATE_PASS_REQUIRES_LIVE_REVIEW'):'DIAGNOSTIC_ONLY_NOT_ACCEPTANCE'};
const output = process.env.PRODUCT_INTEGRITY_REPORT || path.join(root, 'product-integrity-report.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(`RESULT ${report.verdict}; static mismatches=${results.filter(x=>!x.pass).length}; unresolved evidence=${unresolved.length}; report=${output}`);
if (mode === 'release' && (blockers.length || unresolved.length)) process.exit(1);
if (blockers.length) process.exit(1);

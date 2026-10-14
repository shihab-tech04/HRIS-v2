#!/usr/bin/env node
/** Product integrity gate v1 — contracts are approval evidence *references*, not self-certification.
 * No dependencies. Static coverage cannot substitute for browser, Figma or live Auth/RLS verification.
 */
import fs from 'node:fs';
import path from 'node:path';
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
  const full = path.resolve(base, file);
  if (full !== base && !full.startsWith(base + path.sep)) throw Error('Path escapes repository: ' + file);
  return fs.readFileSync(full, 'utf8');
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
  } else if (check.op === 'json_story_coverage') {
    try {
      const data = JSON.parse(source), stories = data.stories;
      const ids = new Set();
      matched = Array.isArray(stories) && stories.length === check.value && stories.every(story => {
        const id = story?.id;
        if (typeof id !== 'string' || !id || ids.has(id)) return false;
        ids.add(id);
        return story?.status === 'PASS' && typeof story?.sourceLocator === 'string'
          && story.sourceLocator.length > 0 && typeof story?.acceptanceCriteria === 'string'
          && story.acceptanceCriteria.length > 0 && Array.isArray(story?.acceptanceEvidence)
          && story.acceptanceEvidence.length > 0;
      });
    } catch { matched = false; }
  } else throw Error('Unsupported probe operation: ' + check.op);
  return { id: check.id, pass: matched, detail: matched ? 'Observed' : `Mismatch: ${check.path} (${check.op})` };
}
function validate(contract) {
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
    else if (x.op === 'json_story_coverage') assert.ok(Number.isInteger(x.value) && x.value > 0);
    else throw Error('Unsupported contract operation: ' + x.op);
  }
  for (const x of contract.requiredEvidence) {
    assert.ok(x.id && x.description && x.reference && x.status, 'Incomplete evidence');
    assert.ok(['VERIFIED', 'NOT_VERIFIED', 'BLOCKED', 'CONFLICT', 'FAILED'].includes(x.status));
    assert.ok(!ids.has(x.id)); ids.add(x.id);
    if (x.status === 'VERIFIED') {
      assert.ok(x.reviewer && x.evidence && x.verifiedSourceSha, `VERIFIED requires independent reviewer, evidence and observed source SHA: ${x.id}`);
    }
  }
}
function checkUiManifest(changedFiles) {
  const ui = changedFiles.filter(f => /^(src\/|app\/|components\/).*\.(tsx|jsx|css|scss)$/.test(f));
  if (!ui.length) return [];
  const manifest = JSON.parse(readRelative('docs/product-integrity/ui-change-manifest.json'));
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
    fs.writeFileSync(path.join(tmp, 'story.json'), JSON.stringify({ mapped_story_count: 0 }));
    assert.equal(probe({id:'count',path:'story.json',op:'json_field_equals',field:'mapped_story_count',value:1047},tmp).pass,false);
    assert.equal(probe({id:'stories',path:'story.json',op:'json_story_coverage',value:1047},tmp).pass,false);
    fs.mkdirSync(path.join(tmp,'docs/product-integrity'),{recursive:true});
    fs.writeFileSync(path.join(tmp,'docs/product-integrity/ui-change-manifest.json'),JSON.stringify({schema:'approved-ui-change/1',changes:[]}));
    // UI-change manifest accepts only explicitly traced changes; see checkUiManifest path in repository execution.
    console.log('PASS — negative wrong-route, missing proof, forbidden path and zero-story cases correctly reject.');
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
try { contract = JSON.parse(readRelative('docs/product-integrity/contract.json')); validate(contract); }
catch (error) { console.error('BLOCKED — invalid/missing approved product contract:', error.message); process.exit(2); }
const results = contract.checks.map(probeCheck => ({ ...probe(probeCheck), enforcement:probeCheck.enforcement, reason:probeCheck.reason }));
const unresolved = contract.requiredEvidence.filter(e => e.status !== 'VERIFIED');
const blockers = results.filter(r => !r.pass && (mode === 'release' || r.enforcement === 'always'));
for (const item of results) console.log(`${item.pass?'PASS':'FAIL'} ${item.id}: ${item.detail} — ${item.reason}`);
for (const item of contract.requiredEvidence) console.log(`${item.status} ${item.id}: ${item.description}; reference=${item.reference}`);
const report = {schema:'product-integrity-report/1', product:contract.product, mode, sourceSha:process.env.GITHUB_SHA || 'LOCAL_UNVERIFIED', staticChecks:results, requiredEvidence:contract.requiredEvidence, verdict:mode==='release'?(blockers.length||unresolved.length?'NOT_ACCEPTED':'STATIC_GATE_PASS_REQUIRES_LIVE_REVIEW'):'DIAGNOSTIC_ONLY_NOT_ACCEPTANCE'};
const output = process.env.PRODUCT_INTEGRITY_REPORT || path.join(root, 'product-integrity-report.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(`RESULT ${report.verdict}; static mismatches=${results.filter(x=>!x.pass).length}; unresolved evidence=${unresolved.length}; report=${output}`);
if (mode === 'release' && (blockers.length || unresolved.length)) process.exit(1);
if (blockers.length) process.exit(1);
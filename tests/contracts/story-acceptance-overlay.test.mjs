import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const sourceBytes = readFileSync(new URL('../../docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json', import.meta.url));
const source = JSON.parse(sourceBytes.toString('utf8'));
const overlay = JSON.parse(readFileSync(new URL('../../docs/programme/USER_STORY_ACCEPTANCE_OVERLAY.json', import.meta.url), 'utf8'));

test('acceptance overlay references the unchanged canonical 1,047-story source', () => {
  assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), overlay.canonical_source.sha256);
  assert.equal(overlay.canonical_source.story_count, source.story_total);
  assert.equal(overlay.canonical_source.module_count, source.module_total);
  const uniqueIds = new Set(source.stories.map(story => story.story_id));
  assert.equal(uniqueIds.size, 1047);
  assert.equal(source.stories.length, 1047);
  assert.ok(source.stories.every(story => story.status === 'NOT TESTED'), 'Immutable source statuses must not be rewritten.');
});

test('every individual evidence record maps to a real and uniquely evidenced canonical story', () => {
  const sourceIds = new Set(source.stories.map(story => story.story_id));
  const evidenceIds = overlay.evidence_sets.flatMap(set => set.story_ids);
  assert.equal(new Set(evidenceIds).size, evidenceIds.length, 'Evidence IDs must be deduplicated across suites.');
  for (const id of evidenceIds) assert.ok(sourceIds.has(id), `Unknown canonical story: ${id}`);
  assert.equal(evidenceIds.length, overlay.reconciliation.individual_verified_ids_recorded);
  const ca14 = source.stories.filter(story => story.module_id === 'CA14').map(story => story.story_id);
  const ca14Set = overlay.evidence_sets.find(set => set.id === 'candidate-ca14-20261017');
  assert.deepEqual(ca14Set.story_ids, ca14);
  assert.equal(ca14Set.classification, 'VERIFIED_IN_DISPOSABLE_AUTH_POSTGRES_BROWSER_JOURNEY');
  assert.equal(ca14Set.hosted_cross_system_acceptance, 'NOT_VERIFIED');
  assert.match(ca14Set.runtime_marker, /^CANDIDATE_CA14_STORY_EVIDENCE PASS=12 FAIL=0$/);
  assert.match(ca14Set.commit, /^[a-f0-9]{40}$/);
  assert.match(ca14Set.workflow_run, /\/actions\/runs\/39025809497$/);
  const e03 = overlay.evidence_sets.find(set => set.id === 'employee-e03-documents-20261017');
  const e04 = overlay.evidence_sets.find(set => set.id === 'employee-e04-digital-id-20261017');
  assert.deepEqual(e03.story_ids, ['E03-01', 'E03-04', 'E03-05', 'E03-07', 'E03-08']);
  assert.deepEqual(e04.story_ids, ['E04-01', 'E04-02', 'E04-03', 'E04-04']);
  for (const set of [e03, e04]) {
    assert.match(set.workflow_run, /\/actions\/runs\/39018685182$/);
    assert.match(set.commit, /^[a-f0-9]{40}$/);
    assert.equal(set.hosted_cross_system_acceptance, 'NOT_VERIFIED');
    const report = readFileSync(new URL(`../../${set.evidence_document}`, import.meta.url), 'utf8');
    for (const id of set.story_ids) assert.ok(report.includes(id), `${set.id} evidence missing ${id}`);
  }
  const e04Browser = readFileSync(new URL('../../tests/sql/isolated-auth/run-employee-dashboard-attendance-browser.mjs', import.meta.url), 'utf8');
  for (const id of e04.story_ids) assert.ok(e04Browser.includes(`${id}_`), `E04 runtime marker missing: ${id}`);
  for (const [name, expected] of [
    ['employee-e13-shift-change-20261017', ['E13-04', 'E13-05']],
    ['employee-e37-directory-privacy-20261017', ['E37-01', 'E37-05']],
  ]) {
    const set = overlay.evidence_sets.find(item => item.id === name);
    assert.deepEqual(set.story_ids, expected);
    assert.match(set.workflow_run, /\/actions\/runs\/39025622956$/);
    const report = readFileSync(new URL(`../../${set.evidence_document}`, import.meta.url), 'utf8');
    for (const id of set.story_ids) assert.ok(report.includes(id), `${name} evidence missing ${id}`);
  }
  const e02 = overlay.evidence_sets.find(set => set.id === 'employee-e02-profile-change-20261018');
  assert.deepEqual(e02.story_ids, ['E02-03', 'E02-17']);
  assert.match(e02.workflow_run, /\/actions\/runs\/39147470480$/);
  assert.equal(e02.hosted_cross_system_acceptance, 'NOT_VERIFIED');
  const e02Runner = readFileSync(new URL('../../tests/sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
  const e02Browser = readFileSync(new URL('../../tests/sql/isolated-auth/run-profile-change-browser.mjs', import.meta.url), 'utf8');
  for (const id of e02.story_ids) assert.ok(e02Runner.includes(`${id} `) || e02Runner.includes(`${id}/`), `Missing ${id} real-Auth runtime record`);
  assert.ok(e02Browser.includes(e02.runtime_marker), 'Profile-change browser acceptance marker is not present');
  const currentE02 = overlay.evidence_sets.filter(set =>
    ['employee-e02-personal-information-20261020', 'employee-e02-employment-information-20261020', 'employee-e02-skill-profile-20261020'].includes(set.id));
  assert.deepEqual(currentE02.map(set => set.story_ids[0]), ['E02-01', 'E02-08', 'E02-12']);
  for (const [index, marker] of [
    [0, 'E02-01_PERSONAL_INFORMATION_BROWSER_PASS'],
    [1, 'E02-08_EMPLOYMENT_INFORMATION_BROWSER_PASS'],
    [2, 'E02-12_SKILL_PROFILE_BROWSER_PASS'],
  ]) {
    const set = currentE02[index];
    assert.equal(set.classification, 'VERIFIED_IN_DISPOSABLE_AUTH_POSTGRES_BROWSER_JOURNEY');
    assert.ok(set.workflow_run.endsWith('/actions/runs/39371994771'));
    assert.equal(set.commit, '6ff29e898aef54c2779e44cfdd5e465c79e6c11c');
    assert.equal(set.hosted_cross_system_acceptance, 'NOT_VERIFIED');
    assert.ok(set.runtime_marker.includes(marker));
    const report = readFileSync(new URL(`../../${set.evidence_document}`, import.meta.url), 'utf8');
    assert.ok(report.includes(set.story_ids[0]), `E02 report missing ${set.story_ids[0]}`);
    const runtime = readFileSync(new URL(`../../${set.runtime_browser_test_path}`, import.meta.url), 'utf8');
    assert.ok(runtime.includes(marker), `E02 browser marker missing ${marker}`);
  }
  const hr01 = overlay.evidence_sets.find(set => set.id === 'employee-hr01-workforce-search-20261020');
  assert.deepEqual(hr01.story_ids, ['HR01-03']);
  assert.equal(hr01.classification, 'VERIFIED_IN_DISPOSABLE_AUTH_POSTGRES_BROWSER_JOURNEY');
  assert.equal(hr01.commit, '81eb677847fc19007cfb790dfc8cf7126c4c759d');
  assert.ok(hr01.workflow_run.endsWith('/actions/runs/39373694520'));
  assert.equal(hr01.hosted_cross_system_acceptance, 'NOT_VERIFIED');
  assert.equal(hr01.runtime_marker, 'HR01-03_WORKFORCE_SEARCH_FILTER_BROWSER_PASS');
  const hr01Report = readFileSync(new URL(`../../${hr01.evidence_document}`, import.meta.url), 'utf8');
  assert.ok(hr01Report.includes('HR01-03'));
  const hr01Runtime = readFileSync(new URL(`../../${hr01.runtime_browser_test_path}`, import.meta.url), 'utf8');
  assert.ok(hr01Runtime.includes(hr01.runtime_marker));
  const hr01Runner = readFileSync(new URL('../../tests/sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');
  assert.ok(hr01Runner.includes("record('HR01-03 HR workforce search and department, status, and team filters stay inside the authorized tenant'"));
  assert.equal(overlay.reconciliation.individual_verified_ids_recorded, 38);
  const phase03 = overlay.evidence_sets.find(set => set.id === 'phase03-saas-tenant-modules-20261019');
  assert.deepEqual(phase03.story_ids, ['SA01-01', 'SA01-02', 'SA01-03', 'SA01-04', 'SA12-01', 'SA12-02', 'SA12-03']);
  assert.equal(phase03.classification, 'VERIFIED_IN_DISPOSABLE_AUTH_POSTGRES_BROWSER_JOURNEY');
  assert.equal(phase03.hosted_cross_system_acceptance, 'NOT_VERIFIED');
  assert.ok(phase03.workflow_run.endsWith('/actions/runs/39203699646'));
  assert.ok(phase03.full_suite_workflow_run.endsWith('/actions/runs/39203699636'));
  assert.match(phase03.commit, /^214ccbcf8d33ca30cd09813107f89162a79003ed$/);
  const phase03Report = readFileSync(new URL(`../../${phase03.evidence_document}`, import.meta.url), 'utf8');
  for (const id of phase03.story_ids) assert.ok(phase03Report.includes(id), `Phase 03 evidence missing ${id}`);
  const openEvidence = overlay.open_story_evidence.flatMap(set => set.story_ids);
  assert.equal(new Set(openEvidence).size, openEvidence.length);
  assert.ok(openEvidence.every(id => sourceIds.has(id) && !evidenceIds.includes(id)), 'No open story is also counted as individually verified.');
  assert.equal(overlay.open_story_evidence.find(set => set.classification === 'BLOCKED_ON_UNAPPROVED_OR_ABSENT_CONTRACT').story_ids.length, 13);
  const partialSets = overlay.open_story_evidence.filter(set => set.classification === 'PARTIAL_ACCEPTANCE');
  assert.equal(partialSets.flatMap(set => set.story_ids).length, 5);
  const hr0106 = partialSets.find(set => set.id === 'hr01-sensitive-change-audit-partial-20261020');
  assert.deepEqual(hr0106.story_ids, ['HR01-06']);
  assert.equal(hr0106.commit, 'a920281911b3d61ea116dc951bca900aeb3b4958');
  assert.ok(hr0106.workflow_run.endsWith('/actions/runs/39375324961'));
  assert.equal(hr0106.runtime_marker, 'HR01-06_CONTACT_AUDIT_BROWSER_PASS');
  const hr0106Report = readFileSync(new URL(`../../${hr0106.evidence_document}`, import.meta.url), 'utf8');
  assert.ok(hr0106Report.includes('HR01-06'));
  assert.ok(hr0106Report.includes('PARTIAL'));
  assert.ok(readFileSync(new URL(`../../${hr0106.runtime_test_path}`, import.meta.url), 'utf8').includes("record('HR01-06 partial: authorized HR contact changes emit a redacted changed-field audit event'"));
  assert.ok(readFileSync(new URL(`../../${hr0106.runtime_browser_test_path}`, import.meta.url), 'utf8').includes(hr0106.runtime_marker));
});

test('historical aggregate is conserved without adding any individually evidenced IDs', () => {
  const legacy = overlay.legacy_aggregate_checkpoint;
  assert.equal(legacy.verified + legacy.partial + legacy.blocked + legacy.broken_within_tested_scope + legacy.not_yet_classified, 1047);
  assert.equal(legacy.verified, 82);
  assert.equal(legacy.verified_story_id_membership, 'NOT_RECORDED');
  assert.equal(overlay.reconciliation.legacy_verified_overlap, 'UNKNOWN');
  assert.equal(overlay.reconciliation.deduplicated_verified_total, null);
});

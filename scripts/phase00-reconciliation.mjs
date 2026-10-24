import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStoryReferenceIndex, collectTests } from './story-evidence-index.mjs';
import { indexModulePrimaryPhases } from './phase00-module-phases.mjs';

const mainRoot = fileURLToPath(new URL('..', import.meta.url));
const candidateRoot = resolve(mainRoot, '..', 'HRIS-Candidate-v2');
const expectedSourceHash = 'c0f8eb8ea4fa7a1cd17e957629642c957ae0c22d706f07d0b2c3f1a2a77ed520';

export function reconcilePhase00({ source, overlay, sourceHash, testSources = [] }) {
  if (sourceHash !== expectedSourceHash || sourceHash !== overlay.canonical_source.sha256) {
    throw new Error('Recovered canonical catalogue SHA-256 does not match the immutable source.');
  }
  if (source.stories.length !== 1047 || source.story_total !== 1047 || source.module_total !== 153) {
    throw new Error('Canonical source inventory count does not match the 1,047-story / 153-module programme.');
  }
  if (new Set(source.stories.map(story => story.story_id)).size !== source.stories.length) {
    throw new Error('Duplicate canonical story IDs detected.');
  }
  if (!source.stories.every(story => story.status === 'NOT TESTED' && story.verbatim_requirement && story.source_locator?.line)) {
    throw new Error('Original source status or source line/requirement was changed.');
  }
  if (overlay.legacy_aggregate_checkpoint.verified_story_id_membership !== 'NOT_RECORDED'
    || overlay.reconciliation.legacy_verified_overlap !== 'UNKNOWN'
    || overlay.reconciliation.deduplicated_verified_total !== null) {
    throw new Error('Legacy story-ID overlap must remain unresolved until evidence is recovered.');
  }
  const evidence = new Map();
  for (const set of overlay.evidence_sets) {
    if (set.classification !== 'VERIFIED_IN_DISPOSABLE_AUTH_POSTGRES_BROWSER_JOURNEY'
      || !set.workflow_run || !set.commit) throw new Error(`Incomplete evidence set: ${set.id}`);
    for (const id of set.story_ids) {
      if (evidence.has(id)) throw new Error(`Duplicate individually evidenced story: ${id}`);
      evidence.set(id, set);
    }
  }
  if (evidence.size !== overlay.reconciliation.individual_verified_ids_recorded) {
    throw new Error('Individual evidence count does not match the acceptance overlay.');
  }
  const openCases = new Map();
  for (const set of overlay.open_story_evidence || []) {
    for (const id of set.story_ids) {
      if (evidence.has(id) || openCases.has(id)) throw new Error(`Conflicting story evidence: ${id}`);
      openCases.set(id, set);
    }
  }
  const index = buildStoryReferenceIndex(source.stories, testSources);
  const primaryPhases = indexModulePrimaryPhases(source.modules);
  const entries = source.stories.map(story => {
    const referenced = index.stories.find(row => row.story_id === story.story_id);
    const evidenceSet = evidence.get(story.story_id);
    const openCase = openCases.get(story.story_id);
    return {
      story_id: story.story_id,
      module_id: story.module_id,
      module_name: story.module_name,
      role: story.role,
      verbatim_requirement: story.verbatim_requirement,
      source_line: story.source_locator.line,
      source_phase_assignment: story.phase,
      operational_primary_phase: primaryPhases.get(story.module_id),
      acceptance_evidence: evidenceSet ? {
        scope: 'DISPOSABLE_ONLY',
        set_id: evidenceSet.id,
        workflow_run: evidenceSet.workflow_run,
        commit: evidenceSet.commit,
      } : null,
      open_evidence: openCase ? {
        classification: openCase.classification,
        set_id: openCase.id,
      } : null,
      implementation_classification: evidenceSet ? 'IMPLEMENTED_TESTED_DISPOSABLE' : 'NOT_YET_DETERMINED',
      test_source_references: referenced.test_source_references,
    };
  });
  const indexIds = new Set(index.stories.map(story => story.story_id));
  if ([...evidence.keys(), ...openCases.keys()].some(id => !indexIds.has(id))) {
    throw new Error('Recorded story evidence refers to an ID absent from the canonical catalogue.');
  }
  return {
    meaning: 'Source-complete per-story reconciliation; test references and disposable acceptance must not be conflated with implementation or hosted release status.',
    canonical_source_sha256: sourceHash,
    story_total: entries.length,
    module_total: index.modules.length,
    individually_evidenced_in_disposable_journeys: evidence.size,
    individually_not_yet_evidenced: entries.length - evidence.size,
    explicitly_blocked_story_count: [...openCases.values()].filter(set => set.classification === 'BLOCKED_ON_UNAPPROVED_OR_ABSENT_CONTRACT').length,
    explicitly_partial_story_count: [...openCases.values()].filter(set => set.classification === 'PARTIAL_ACCEPTANCE').length,
    test_referenced_story_count: index.test_referenced_story_count,
    unassigned_source_phase_count: entries.filter(entry => entry.source_phase_assignment === null).length,
    operationally_mapped_module_count: primaryPhases.size,
    operationally_unmapped_story_count: entries.filter(entry => !entry.operational_primary_phase).length,
    legacy_verified_aggregate: overlay.legacy_aggregate_checkpoint.verified,
    deduplicated_verified_total: null,
    phase00_source_integrity: 'PASS',
    phase00_programme_gate: 'PASS_SOURCE_AND_SCOPE',
    phase00_legacy_aggregate_disposition: 'QUARANTINED_FOR_ID_BY_ID_REVALIDATION_IN_PHASE20',
    entries,
  };
}

function load() {
  const bytes = readFileSync(join(mainRoot, 'docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json'));
  return reconcilePhase00({
    source: JSON.parse(bytes.toString('utf8')),
    overlay: JSON.parse(readFileSync(join(mainRoot, 'docs/programme/USER_STORY_ACCEPTANCE_OVERLAY.json'), 'utf8')),
    sourceHash: createHash('sha256').update(bytes).digest('hex'),
    testSources: [...collectTests(mainRoot, 'Main'), ...collectTests(candidateRoot, 'Candidate')],
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = load();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`Phase 00 source: ${result.phase00_source_integrity}; canonical ${result.story_total} stories / ${result.module_total} modules.\n`);
    process.stdout.write(`Individually evidenced (disposable only): ${result.individually_evidenced_in_disposable_journeys}; awaiting individual evidence: ${result.individually_not_yet_evidenced}.\n`);
    process.stdout.write(`Explicitly mapped blockers: ${result.explicitly_blocked_story_count}; partial cases: ${result.explicitly_partial_story_count}.\n`);
    process.stdout.write(`Legacy aggregate of ${result.legacy_verified_aggregate} has unknown ID membership; union MUST NOT be computed.\n`);
    process.stdout.write(`Test-ID references: ${result.test_referenced_story_count}; source phase fields unassigned: ${result.unassigned_source_phase_count}.\n`);
    process.stdout.write(`Operational module→phase map: ${result.operationally_mapped_module_count}/${result.module_total}; stories without an operational phase: ${result.operationally_unmapped_story_count}.\n`);
    process.stdout.write(`Phase 00 source/scope gate: ${result.phase00_programme_gate}; legacy evidence: ${result.phase00_legacy_aggregate_disposition}.\n`);
    process.stdout.write('Use --json for all original requirements, module phases, open cases, and evidence links.\n');
  }
}

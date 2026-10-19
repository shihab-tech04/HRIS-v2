import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexModulePrimaryPhases } from './phase00-module-phases.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

export function phaseReadiness({ phase, source, overlay }) {
  const moduleMap = indexModulePrimaryPhases(source.modules);
  if (new Set(source.stories.map(story => story.story_id)).size !== source.stories.length) {
    throw new Error('Duplicate canonical story IDs in phase readiness input.');
  }
  const evidence = new Map(overlay.evidence_sets.flatMap(set => set.story_ids.map(id => [id, set])));
  const open = new Map(overlay.open_story_evidence.flatMap(set => set.story_ids.map(id => [id, set])));
  const rows = source.stories.filter(story => moduleMap.get(story.module_id) === phase).map(story => {
    const acceptedInDisposable = evidence.get(story.story_id);
    const gap = open.get(story.story_id);
    return {
      story_id: story.story_id,
      module_id: story.module_id,
      verbatim_requirement: story.verbatim_requirement,
      status: acceptedInDisposable ? 'DISPOSABLE_EVIDENCED' : gap?.classification || 'NOT_CLASSIFIED',
      workflow_run: acceptedInDisposable?.workflow_run || null,
      evidence_reference: acceptedInDisposable?.evidence_document || gap?.evidence_document || null,
      hosted_accepted: false,
    };
  });
  const counts = {
    total: rows.length,
    disposable_evidenced: rows.filter(row => row.status === 'DISPOSABLE_EVIDENCED').length,
    blocked: rows.filter(row => row.status === 'BLOCKED_ON_UNAPPROVED_OR_ABSENT_CONTRACT').length,
    partial: rows.filter(row => row.status === 'PARTIAL_ACCEPTANCE').length,
    not_classified: rows.filter(row => row.status === 'NOT_CLASSIFIED').length,
  };
  if (Object.values(counts).slice(1).reduce((a, b) => a + b, 0) !== counts.total) {
    throw new Error('Readiness classification loses or duplicates a canonical story.');
  }
  return {
    phase,
    scope: 'Planning and previously observed disposable evidence only; no story is currently certified for hosted cross-system release.',
    module_ids: [...new Set(rows.map(row => row.module_id))],
    counts,
    legacy_verified_union: null,
    stories: rows,
  };
}

export function readPhaseReadiness(phase) {
  const source = JSON.parse(readFileSync(join(root, 'docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json'), 'utf8'));
  const overlay = JSON.parse(readFileSync(join(root, 'docs/programme/USER_STORY_ACCEPTANCE_OVERLAY.json'), 'utf8'));
  return phaseReadiness({ phase, source, overlay });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const phase = process.argv.find(arg => /^\d\d$/.test(arg));
  if (!phase) throw new Error('Specify operational phase, for example: node scripts/phase-readiness.mjs 05');
  const result = readPhaseReadiness(phase);
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(`Phase ${phase}: ${result.module_ids.length} modules / ${result.counts.total} stories; disposable-evidenced ${result.counts.disposable_evidenced}, blocked ${result.counts.blocked}, partial ${result.counts.partial}, unclassified ${result.counts.not_classified}. Hosted accepted: 0 claimed.\n`);
}

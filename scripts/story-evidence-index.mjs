import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const mainRoot = fileURLToPath(new URL('..', import.meta.url));
const candidateRoot = resolve(mainRoot, '..', 'HRIS-Candidate-v2');
const idPattern = /\b[A-Z]{1,2}\d{2}-\d{2}\b/g;

export function buildStoryReferenceIndex(stories, sources) {
  const canonicalIds = new Set(stories.map(story => story.story_id));
  if (canonicalIds.size !== stories.length) throw new Error('Canonical story IDs are not unique.');

  const references = new Map();
  for (const { path, content } of sources) {
    const found = new Set(content.match(idPattern) || []);
    for (const id of found) {
      if (!canonicalIds.has(id)) continue;
      const paths = references.get(id) || new Set();
      paths.add(path);
      references.set(id, paths);
    }
  }

  const entries = stories.map(story => ({
    story_id: story.story_id,
    module_id: story.module_id,
    role: story.role,
    test_source_references: [...(references.get(story.story_id) || [])].sort(),
  }));
  const referenced = entries.filter(entry => entry.test_source_references.length > 0).length;
  const moduleTotals = new Map();
  for (const entry of entries) {
    const current = moduleTotals.get(entry.module_id) || { module_id: entry.module_id, total: 0, referenced: 0 };
    current.total++;
    if (entry.test_source_references.length) current.referenced++;
    moduleTotals.set(entry.module_id, current);
  }

  return {
    meaning: 'Exact story IDs mentioned in tracked test source; references are leads for manual acceptance, not proof of implementation, runtime success or completed stories.',
    story_count: entries.length,
    test_referenced_story_count: referenced,
    no_exact_test_reference_count: entries.length - referenced,
    modules: [...moduleTotals.values()].sort((a, b) => a.module_id.localeCompare(b.module_id)),
    stories: entries,
  };
}

function collectTests(root, label) {
  const testsRoot = join(root, 'tests');
  if (!existsSync(testsRoot)) return [];
  const result = [];
  const walk = dir => {
    for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const pathname = join(dir, item.name);
      if (item.isDirectory()) walk(pathname);
      else if (item.isFile() && /\.(mjs|js|ts|tsx)$/.test(item.name)
        && !['story-acceptance-overlay.test.mjs', 'story-evidence-index.test.mjs'].includes(item.name)) {
        result.push({ path: `${label}/${relative(root, pathname).replaceAll('\\', '/')}`, content: readFileSync(pathname, 'utf8') });
      }
    }
  };
  walk(testsRoot);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const canonical = JSON.parse(readFileSync(join(mainRoot, 'docs/programme/recovered-source/CANONICAL_USER_STORY_MATRIX.json'), 'utf8'));
  const sources = [...collectTests(mainRoot, 'Main'), ...collectTests(candidateRoot, 'Candidate')];
  const index = buildStoryReferenceIndex(canonical.stories, sources);
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(index, null, 2)}\n`);
  } else {
    const candidates = index.modules.filter(module => module.referenced > 0).length;
    process.stdout.write(`Canonical stories: ${index.story_count}; exact IDs in test source: ${index.test_referenced_story_count}; no exact test reference: ${index.no_exact_test_reference_count}; modules with references: ${candidates}/${index.modules.length}\n`);
    process.stdout.write(`Test files scanned: ${sources.length}; Candidate checkout present: ${existsSync(join(candidateRoot, 'tests'))}\n`);
    process.stdout.write(`${index.meaning}\n`);
  }
}

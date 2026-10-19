import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mainRoot = fileURLToPath(new URL('..', import.meta.url));
const candidateRoot = resolve(mainRoot, '..', 'HRIS-Candidate-v2');
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);

function walk(root) {
  const files = [];
  for (const dirent of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, dirent.name);
    if (dirent.isDirectory()) files.push(...walk(path));
    else if (dirent.isFile()) files.push(path);
  }
  return files.sort();
}

function sourceRef(root, file) {
  return relative(root, file).split('\\').join('/');
}

function sourceCalls(project, root) {
  const rpc = [];
  const dataTables = [];
  const storageBuckets = [];
  for (const file of walk(join(root, 'src')).filter(path => sourceExtensions.has(extname(path)))) {
    const source = readFileSync(file, 'utf8');
    // TS7's native compiler no longer exposes the parser API. Limit this
    // inventory to source-level method calls; dynamic targets are quarantined.
    const callPattern = /\.\s*(rpc|from)\s*\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`|([a-zA-Z_$][\w$]*))/g;
    for (const match of source.matchAll(callPattern)) {
      const method = match[1];
      const literal = match[2] ?? match[3] ?? match[4] ?? null;
      const line = source.slice(0, match.index).split('\n').length;
      const ref = { project, path: sourceRef(root, file), line };
      if (method === 'rpc') {
        rpc.push({ ...ref, name: literal, ...(literal === null ? { expression: match[5] } : {}) });
      } else if (/\.storage\s*$/.test(source.slice(0, match.index))) {
        storageBuckets.push({ ...ref, name: literal });
      } else {
        dataTables.push({ ...ref, name: literal });
      }
    }
  }
  return { rpc, dataTables, storageBuckets };
}

export function parseSqlFunctionDefinitions(sql, sourcePath) {
  const regex = /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:"?(public|private)"?\s*\.\s*)?"?([a-z_][a-z_0-9]*)"?\s*\(/gi;
  const results = [];
  for (const match of sql.matchAll(regex)) {
    results.push({ schema: match[1]?.toLowerCase() || 'public', name: match[2].toLowerCase(), path: sourcePath, line: sql.slice(0, match.index).split('\n').length });
  }
  return results;
}

export function compileIntegrationInventory({ mainCalls, candidateCalls, definitions, stagingDefinitions = [], dynamicTargets }) {
  const allCalls = [...mainCalls.rpc, ...candidateCalls.rpc];
  const defined = new Map();
  for (const definition of definitions) {
    if (definition.schema !== 'public') continue;
    const files = defined.get(definition.name) || [];
    files.push({ path: definition.path, line: definition.line });
    defined.set(definition.name, files);
  }
  const staged = new Map();
  for (const definition of stagingDefinitions) {
    if (definition.schema !== 'public') continue;
    const files = staged.get(definition.name) || [];
    files.push({ path: definition.path, line: definition.line });
    staged.set(definition.name, files);
  }
  const explicitTargets = dynamicTargets.map(target => ({ ...target, dynamic: true }));
  const knownCallsites = [...allCalls.filter(call => call.name !== null), ...explicitTargets];
  const needed = [...new Set(knownCallsites.map(call => call.name))].sort();
  const stagedOnly = needed.filter(name => !defined.has(name) && staged.has(name));
  const unresolved = needed.filter(name => !defined.has(name) && !staged.has(name));
  const dynamicCalls = allCalls.filter(call => call.name === null);
  const sourceDefinitions = [...defined.entries()].map(([name, files]) => ({ name, files }));
  return {
    scope: 'Read-only code and tracked SQL source inventory; not a statement about hosted deployment, signatures, grants, policy behavior or functional acceptance.',
    projects: ['Main', 'Candidate'],
    scanned_rpc_callsites: allCalls.length,
    literal_rpc_callsites: allCalls.length - dynamicCalls.length,
    dynamic_rpc_callsites: dynamicCalls,
    documented_dynamic_targets: explicitTargets,
    unique_rpc_targets: needed.length,
    rpc_targets_defined_in_tracked_public_sql: needed.length - unresolved.length - stagedOnly.length,
    rpc_targets_in_versioned_migrations: needed.length - unresolved.length - stagedOnly.length,
    rpc_targets_staging_only: stagedOnly,
    rpc_targets_without_tracked_public_definition: unresolved,
    rpc_targets: needed.map(name => ({
      name,
      sql_definitions: defined.get(name) || [],
      staging_definitions: staged.get(name) || [],
      callsites: knownCallsites.filter(call => call.name === name).map(call => ({ project: call.project, path: call.path, line: call.line, ...(call.dynamic ? { dynamically_dispatched: true } : {}) })),
      source_status: defined.has(name) ? 'VERSIONED_MIGRATION' : staged.has(name) ? 'STAGING_ONLY' : 'UNRESOLVED_IN_TRACKED_SQL',
    })),
    sql_public_function_names: sourceDefinitions.length,
    table_callsites: [...mainCalls.dataTables, ...candidateCalls.dataTables],
    storage_callsites: [...mainCalls.storageBuckets, ...candidateCalls.storageBuckets],
  };
}

export function inventoryPhase01({ main = mainRoot, candidate = candidateRoot } = {}) {
  const mainCalls = sourceCalls('Main', main);
  const candidateCalls = sourceCalls('Candidate', candidate);
  const definitions = walk(join(main, 'supabase', 'migrations'))
    .filter(file => file.endsWith('.sql'))
    .flatMap(file => parseSqlFunctionDefinitions(readFileSync(file, 'utf8'), sourceRef(main, file)));
  const stagingDefinitions = walk(join(main, 'supabase', 'staging'))
    .filter(file => file.endsWith('.sql'))
    .flatMap(file => parseSqlFunctionDefinitions(readFileSync(file, 'utf8'), sourceRef(main, file)));

  // These are the two currently observed dynamic dispatch sites. Keep these targets
  // explicit so a later change cannot silently remove an RPC from the coverage set.
  const dynamicTargets = [
    ...['hris_save_assigned_appraisal_review', 'hris_save_my_appraisal_self_comment'].map(name => ({ project: 'Main', path: 'src/live/MyPerformance.tsx', name })),
    ...['hris_release_project_task_member', 'hris_complete_project_task', 'hris_assign_project_task_member', 'hris_start_project_task'].map(name => ({ project: 'Main', path: 'src/live/ProjectTaskManager.tsx', name })),
  ];
  const inventory = compileIntegrationInventory({ mainCalls, candidateCalls, definitions, stagingDefinitions, dynamicTargets });
  const dynamicLocationKey = call => `${call.project}:${call.path}`;
  const expectedDynamicLocations = new Set(dynamicTargets.map(dynamicLocationKey));
  if (inventory.dynamic_rpc_callsites.length !== 2 || inventory.dynamic_rpc_callsites.some(call => !expectedDynamicLocations.has(dynamicLocationKey(call)))) {
    throw new Error('An unaccounted-for dynamic frontend RPC was found; resolve it before accepting the Phase 01 contract.');
  }
  for (const target of dynamicTargets) {
    const code = readFileSync(join(target.project === 'Main' ? main : candidate, target.path), 'utf8');
    if (!code.includes(`'${target.name}'`) && !code.includes(`"${target.name}"`)) {
      throw new Error(`Dynamic RPC target ${target.name} no longer occurs in its documented source file.`);
    }
  }
  return inventory;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inventoryPhase01();
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    process.stdout.write(`Phase 01 code inventory: Main + Candidate, ${result.scanned_rpc_callsites} RPC callsites (${result.literal_rpc_callsites} literal, ${result.dynamic_rpc_callsites.length} dynamic).\n`);
    process.stdout.write(`${result.unique_rpc_targets} unique RPC targets (${result.rpc_targets_in_versioned_migrations} in versioned migrations; ${result.rpc_targets_staging_only.length} staging only; ${result.rpc_targets_without_tracked_public_definition.length} unresolved in tracked SQL).\n`);
    process.stdout.write(`Public SQL names: ${result.sql_public_function_names}; direct table callsites: ${result.table_callsites.length}; storage callsites: ${result.storage_callsites.length}.\n`);
    if (result.rpc_targets_staging_only.length) process.stdout.write(`Staged-only platform RPC names: ${result.rpc_targets_staging_only.join(', ')}\n`);
    if (result.rpc_targets_without_tracked_public_definition.length) process.stdout.write(`Unresolved source RPC names: ${result.rpc_targets_without_tracked_public_definition.join(', ')}\n`);
    process.stdout.write('This does not assert hosted SQL parity; use --json for every callsite and source SQL definition.\n');
  }
}

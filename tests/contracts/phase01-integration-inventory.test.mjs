import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileIntegrationInventory, inventoryPhase01, parseSqlFunctionDefinitions } from '../../scripts/phase01-integration-inventory.mjs';

test('SQL function scanner captures versioned schema and case-insensitive declarations', () => {
  assert.deepEqual(parseSqlFunctionDefinitions(`
    CREATE FUNCTION public.example_1(p_id uuid) RETURNS text AS $$ SELECT '' $$ LANGUAGE sql;
    create or replace function private.example_2() RETURNS void AS $$ BEGIN END $$ LANGUAGE plpgsql;
  `, 'migration.sql').map(row => [row.schema, row.name]), [
    ['public', 'example_1'], ['private', 'example_2'],
  ]);
});

test('Phase 01 enumerates frontend RPCs, differentiates staged-only and unresolved sources', () => {
  const result = inventoryPhase01();
  assert.equal(result.projects.join(','), 'Main,Candidate');
  assert.equal(result.literal_rpc_callsites + result.dynamic_rpc_callsites.length, result.scanned_rpc_callsites);
  assert.equal(result.dynamic_rpc_callsites.length, 2);
  assert.equal(result.documented_dynamic_targets.length, 6);
  assert.equal(result.unique_rpc_targets, result.rpc_targets.length);
  assert.equal(result.unique_rpc_targets,
    result.rpc_targets_in_versioned_migrations + result.rpc_targets_staging_only.length + result.rpc_targets_without_tracked_public_definition.length);
  assert.equal(result.rpc_targets_in_versioned_migrations, result.rpc_targets_defined_in_tracked_public_sql);
  assert.deepEqual(result.rpc_targets_without_tracked_public_definition, []);
  assert.equal(result.rpc_targets_in_versioned_migrations, 120);
  assert.equal(result.rpc_targets.find(row => row.name === 'candidate_submit_requested_document')?.source_status, 'VERSIONED_MIGRATION');
  assert.equal(result.rpc_targets_staging_only.length, 9);
  assert.ok(result.rpc_targets_staging_only.every(name => name.startsWith('platform_hris_')));
  assert.ok(result.rpc_targets_staging_only.includes('platform_hris_list_tenant_modules'));
  assert.ok(result.rpc_targets_staging_only.includes('platform_hris_set_tenant_module'));
  assert.ok(result.rpc_targets.find(row => row.name === 'hris_activate_candidate_employee')?.sql_definitions.length);
  assert.ok(result.rpc_targets.find(row => row.name === 'candidate_apply_to_job')?.callsites.some(call => call.project === 'Candidate'));
  assert.ok(result.table_callsites.length > 0);
  assert.ok(result.storage_callsites.length > 0);
  assert.match(result.scope, /not a statement about hosted deployment/);
});

test('unversioned staged and absent RPC sources never masquerade as deployed definitions', () => {
  const result = compileIntegrationInventory({
    mainCalls: { rpc: [{ name: 'staged', project: 'Main', path: 'a.ts', line: 1 }], dataTables: [], storageBuckets: [] },
    candidateCalls: { rpc: [{ name: 'missing', project: 'Candidate', path: 'b.ts', line: 2 }], dataTables: [], storageBuckets: [] },
    definitions: [],
    stagingDefinitions: [{ schema: 'public', name: 'staged', path: 'stage.sql', line: 1 }],
    dynamicTargets: [],
  });
  assert.equal(result.rpc_targets_in_versioned_migrations, 0);
  assert.deepEqual(result.rpc_targets_staging_only, ['staged']);
  assert.deepEqual(result.rpc_targets_without_tracked_public_definition, ['missing']);
  assert.equal(result.rpc_targets[0].source_status, 'UNRESOLVED_IN_TRACKED_SQL');
  assert.equal(result.rpc_targets[1].source_status, 'STAGING_ONLY');
});

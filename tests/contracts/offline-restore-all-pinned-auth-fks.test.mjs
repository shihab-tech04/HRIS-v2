import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const restore=readFileSync(new URL('../../.github/workflows/hris-step1-offline-restore-proof.yml',import.meta.url),'utf8');
const exportWorkflow=readFileSync(new URL('../../.github/workflows/hris-step1-encrypted-db-export.yml',import.meta.url),'utf8');
const sql=readFileSync(new URL('../../.github/scripts/hris-legacy-auth-fk-counts.sql',import.meta.url),'utf8');
const match=restore.match(/<<'PINNED_AUTH_FKS'\n([\s\S]*?)\n\s*PINNED_AUTH_FKS/);
const definitions=(match?.[1]??'').split('\n').filter(x=>x.trim()).map(x=>x.trim().split('|'));
const sourceCounts=[...sql.matchAll(/SELECT '([a-z_]+)' AS table_name, '([a-z_]+)' AS column_name,/g)]
  .map(match=>[match[1],match[2]]);

test('preserve all 17 reviewed Auth FK definitions and source-count identity',()=>{
  assert.ok(match,'a concrete reviewed FK definition inventory exists');
  assert.equal(definitions.length,17);
  assert.equal(new Set(definitions.map(r=>r[2])).size,17);
  assert.equal(sourceCounts.length,17);
  assert.equal(new Set(sourceCounts.map(r=>r.join('.'))).size,17);
  assert.deepEqual(sourceCounts.map(r=>r.join('.')).sort(),definitions.map(r=>r.slice(0,2).join('.')).sort());
  for(const r of definitions){
    assert.equal(r.length,4);
    for(const field of r.slice(0,3)) assert.match(field,/^[a-z_]+$/);
    assert.ok(r[3].includes('FOREIGN KEY ('+r[1]+') REFERENCES auth.users(id)'));
  }
});

test('each archived snapshot carries a checksummed read-only reference inventory',()=>{
  assert.match(sql,/count\(\*\) FILTER \(WHERE src\./);
  assert.match(sql,/LEFT JOIN auth\.users u/);
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b/i);
  assert.match(exportWorkflow,/snapshot_counts > "\$scratch\/fk-counts-before.tsv"/);
  assert.match(exportWorkflow,/snapshot_counts > "\$scratch\/fk-counts-after.tsv"/);
  assert.match(exportWorkflow,/cmp -s "\$scratch\/fk-counts-before.tsv" "\$scratch\/fk-counts-after.tsv"/);
  assert.match(exportWorkflow,/sha256sum "\$\(basename "\$out"\)" fk-source-counts.tsv/);
  assert.match(restore,/test -s "\$src\/fk-source-counts.tsv"/);
  assert.match(restore,/sha256sum --check --status encrypted\.sha256/);
});

test('isolated FK exceptions use validated archive counts and still enforce future writes',()=>{
  assert.match(restore,/if set\(recorded\) != set\(pinned\):/);
  assert.match(restore,/if orphan > nonnull:/);
  assert.match(restore,/Source count and reviewed 17-FK inventory mismatch/);
  assert.match(restore,/if \[\[ "\$count" != 1 \]\]/);
  assert.match(restore,/expected_nonnull\|\$expected_orphan/);
  assert.match(restore,/ALTER TABLE public\.\$\{table\} ADD CONSTRAINT/);
  assert.match(restore,/NOT VALID/);
  assert.match(restore,/NOT con\.convalidated/);
  assert.match(restore,/admin_orphan_count/);
  assert.match(restore,/= 17/);
  assert.match(restore,/ISOLATED_RESTORE_WITH_DOCUMENTED_LEGACY_FK_EXCEPTION/);
  assert.match(restore,/--host 127\.0\.0\.1 --port 55422/);
  assert.doesNotMatch(restore,/--disable-triggers|session_replication_role\s*=\s*replica|HRIS_DB_PASSWORD|aws-\d+-ap-northeast-2/);
});

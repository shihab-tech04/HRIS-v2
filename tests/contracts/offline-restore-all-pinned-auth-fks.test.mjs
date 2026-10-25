import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source=readFileSync(new URL('../../.github/workflows/hris-step1-offline-restore-proof.yml',import.meta.url),'utf8');
const match=source.match(/<<'PINNED_AUTH_FKS'\n([\s\S]*?)\n\s*PINNED_AUTH_FKS/);
const rows=(match?.[1]??'').split('\n').filter(x=>x.trim()).map(x=>x.trim().split('|'));

test('pin exact 17 historical orphaned Auth FK definitions without fabricating identities',()=>{
  assert.ok(match,'a concrete pinned FK inventory exists');
  assert.equal(rows.length,17);
  assert.equal(new Set(rows.map(r=>r[2])).size,17);
  assert.equal(rows.reduce((s,r)=>s+Number(r[4]),0),79);
  for(const r of rows){
    assert.equal(r.length,6);
    assert.match(r[0],/^[a-z_]+$/);
    assert.match(r[1],/^[a-z_]+$/);
    assert.match(r[2],/^[a-z_]+$/);
    assert.ok(Number.isInteger(Number(r[3]))&&Number(r[3])>0);
    assert.ok(Number.isInteger(Number(r[4]))&&Number(r[4])>0&&Number(r[4])<=Number(r[3]));
    assert.ok(r[5].includes('FOREIGN KEY ('+r[1]+') REFERENCES auth.users(id)'));
  }
  assert.deepEqual(rows.find(r=>r[0]==='admin_audit_logs')?.slice(3,5),['59','58']);
  assert.deepEqual(rows.find(r=>r[0]==='confirmation_reviews')?.slice(3,5),['2','2']);
});

test('all isolated FK exceptions are inventory-matched and still enforce future writes',()=>{
  assert.match(source,/hris-pinned-auth-fks\.tsv/);
  assert.match(source,/if \[\[ "\$count" != 1 \]\]/);
  assert.match(source,/expected_nonnull\|\$expected_orphan/);
  assert.match(source,/ALTER TABLE public\.\\?\$\{table\} ADD CONSTRAINT/);
  assert.match(source,/NOT VALID/);
  assert.match(source,/NOT con\.convalidated/);
  assert.match(source,/= 58/);
  assert.match(source,/= 17/);
  assert.match(source,/ISOLATED_RESTORE_WITH_DOCUMENTED_LEGACY_FK_EXCEPTION/);
  assert.match(source,/--host 127\.0\.0\.1 --port 55422/);
  assert.doesNotMatch(source,/--disable-triggers|session_replication_role\s*=\s*replica|HRIS_DB_PASSWORD|aws-\d+-ap-northeast-2/);
});

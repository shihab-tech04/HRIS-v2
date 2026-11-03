import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { departmentSavePayload, teamSavePayload, mayWriteSelectedTenant } from '../../src/live/organizationStructureContract.mjs';

const editor = readFileSync(new URL('../../src/live/OrganizationStructureEditor.tsx', import.meta.url), 'utf8');
const teams = readFileSync(new URL('../../src/live/OrganizationTeams.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');

test('HR03-03 department create/update uses verified existing RPC fields and retains optional data', () => {
  const payload = departmentSavePayload({ name:'  Employee Relations  ', code:' hr-01 ',
    description:' Head Office ', locationId:'location-A', active:false });
  assert.deepEqual(payload, { name:'Employee Relations', code:'HR-01', description:'Head Office',
    location_id:'location-A', active:false });
  assert.ok(!Object.hasOwn(payload,'tenant_id'));
  assert.ok(!Object.hasOwn(payload,'costCenterCode'));
  assert.deepEqual(departmentSavePayload({name:'HR',code:'hr',description:'',locationId:'',active:true}),
    {name:'HR',code:'HR',description:null,location_id:null,active:true});
  assert.throws(() => departmentSavePayload({name:'',code:'X',description:'',locationId:'',active:true}),/required/);
});

test('HR03-05 team management uses the verified same-tenant department link', () => {
  assert.deepEqual(teamSavePayload({name:'  Payroll  ',code:' pay ',departmentId:'department-A',active:true}),
    {name:'Payroll',code:'PAY',department_id:'department-A',active:true});
  assert.throws(() => teamSavePayload({name:'T',code:'T',departmentId:'',active:true}),/required/);
});

test('ambiguous, absent, and view-only tenant permission fails closed before save', () => {
  assert.equal(mayWriteSelectedTenant(true,'tenant-A','tenant-A'),true);
  for (const [permission,resolved,selected] of [
    [false,'tenant-A','tenant-A'],[true,null,'tenant-A'],[true,'tenant-A','tenant-B'],
    [null,'tenant-A','tenant-A'],[true,'','tenant-A'],
  ]) assert.equal(mayWriteSelectedTenant(permission,resolved,selected),false);
});

test('HR03 editor rechecks server permission and resolved tenant before every persisted mutation', () => {
  assert.match(editor, /rpc\('has_tenant_permission'/);
  assert.match(editor, /p_permission_id: 'organization\.manage'/);
  assert.match(editor, /rpc\('synesis_tenant_id'\)/);
  assert.match(editor, /mayWriteSelectedTenant\(permission\.data, resolved\.data, tenantId\)/);
  assert.match(editor, /rpc\('admin_save_department', \{ p_id: draft\.id, p_payload: payload \}\)/);
  assert.match(editor, /rpc\('admin_save_team', \{ p_id: draft\.id, p_payload: payload \}\)/);
  assert.match(editor, /if \(!stillCurrent\(\)\) return;/);
  assert.match(editor, /readback\.data\?\.tenant_id !== tenantId/);
  assert.doesNotMatch(editor,/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(editor,/setTimeout|localStorage|sessionStorage|service_role/);
});

test('all selection queries use stable tenant-scoped pages and guard stale scope changes', () => {
  for(const table of ['departments','teams','org_locations']) {
    const segment=editor.slice(editor.indexOf("supabase.from('"+table+"')"));
    assert.ok(segment.startsWith("supabase.from('"+table+"')"));
    assert.match(segment.slice(0,290),/\.eq\('tenant_id', tenantId\)/);
    assert.match(segment.slice(0,340),/\.order\('name', \{ ascending: true \}\)\.order\('id', \{ ascending: true \}\)\.range\(from, to\)/);
  }
  assert.match(editor,/generation\.current === requestId && activeTenant\.current === tenantId/);
  assert.match(editor,/return \(\) => \{ current = false; generation\.current \+= 1; \}/);
  assert.match(teams,/<OrganizationStructureEditor tenantId=\{tenantId\} locale=\{locale\} onSaved=\{\(\) => setRetryKey/);
  assert.match(workspace,/<OrganizationTeams tenantId=\{tenantId\} locale=\{locale\}/);
});

test('EN/BN, deactivation acknowledgement and save-readback feedback are present', () => {
  assert.match(editor,/en: \{/);
  assert.match(editor,/bn: \{/);
  assert.match(editor,/department: 'বিভাগ'/);
  assert.match(editor,/team: 'দল'/);
  assert.match(editor,/draft\.id && draft\.originallyActive && !draft\.active && !confirmInactive/);
  assert.match(editor,/required checked=\{confirmInactive\}/);
  assert.match(editor,/code === '23505'/);
  assert.match(editor,/readbackFailed/);
  assert.doesNotMatch(editor,/style=\{/);
  assert.doesNotMatch(teams,/supabase\.rpc\s*\(/);
});

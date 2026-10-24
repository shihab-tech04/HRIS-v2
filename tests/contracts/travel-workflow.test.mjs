import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../src/live/LiveApp.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/LiveHrisWorkspace.tsx', import.meta.url), 'utf8');
const travel = readFileSync(new URL('../../src/live/TravelRequests.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261013203000_hris_travel_request_workflow.sql', import.meta.url), 'utf8');
const localRunner = readFileSync(new URL('../../tests/sql/isolated-auth/run-local.mjs', import.meta.url), 'utf8');

test('travel pages are tenant-permission and employee-link gated in the existing HRIS shell', () => {
  assert.match(app, /'travel\.view', 'travel\.manage'/);
  assert.match(app, /travel: grants\.get\('travel\.view'\) === true \|\| grants\.get\('travel\.manage'\) === true/);
  assert.match(app, /travelManage: grants\.get\('travel\.manage'\) === true/);
  assert.match(workspace, /if \(permissions\.travel\) items\.push\(\{ id: 'travel'/);
  assert.match(workspace, /if \(isEmployee\) items\.push\(\{ id: 'my-travel'/);
  assert.match(workspace, /page === 'travel' && permissions\.travel && <TravelRequests/);
  assert.match(workspace, /page === 'my-travel' && isEmployee && <MyTravelRequests/);
});

test('employee journey uses tenant-bound RPCs with editable drafts, guarded submission and recovery states', () => {
  for (const rpc of ['hris_get_my_travel_context', 'hris_save_my_travel_request', 'hris_submit_my_travel_request']) {
    assert.ok(travel.includes(`supabase.rpc('${rpc}'`), `missing travel RPC ${rpc}`);
  }
  assert.match(travel, /Returned for changes/);
  assert.match(travel, /Revise request/);
  assert.match(travel, /Request history/);
  assert.match(travel, /Save draft/);
  assert.match(travel, /Submit for review/);
  assert.match(migration, /Add a destination, valid travel dates, and a purpose before submitting/);
  assert.match(travel, /Escape/);
});

test('travel review is permission-limited in the client and enforced by tenant membership in SQL', () => {
  assert.match(travel, /if \(!target \|\| !canManage \|\| saving\) return/);
  assert.match(travel, /supabase\.rpc\('hris_get_tenant_travel_requests'/);
  assert.match(travel, /supabase\.rpc\('hris_resolve_travel_request'/);
  assert.match(migration, /public\.has_tenant_permission\(p_tenant_id,'travel\.view'\)/);
  assert.match(migration, /public\.has_tenant_permission\(p_tenant_id,'travel\.manage'\)/);
  assert.match(migration, /r\.tenant_id=p_tenant_id AND r\.status='submitted'/);
  assert.match(migration, /WHERE r\.id=p_id AND r\.tenant_id=p_tenant_id/);
  assert.match(migration, /Only draft or rejected travel requests can be submitted/);
  assert.match(migration, /status='submitted',submitted_at/);
  assert.match(migration, /'travel\.'\|\|p_decision/);
  assert.match(migration, /REVOKE ALL ON public\.travel_requests, public\.travel_status_history FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT SELECT ON public\.travel_requests, public\.travel_status_history TO authenticated/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_resolve_travel_request\(uuid,uuid,text,text\) FROM PUBLIC,anon/);
  assert.ok(localRunner.includes('hris_get_my_travel_context'));
  assert.ok(localRunner.includes('run-travel-browser.mjs'));
});

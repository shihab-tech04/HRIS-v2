import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20261015022305_hris_travel_decision_notifications.sql');
const inbox = read('../../supabase/migrations/20261014160002_hris_system_notifications_inbox.sql');
const travel = read('../../supabase/migrations/20261013203000_hris_travel_request_workflow.sql');
const component = read('../../src/live/ProjectNotifications.tsx');
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const locale = read('../../src/live/project-locale.ts');
const localRunner = read('../sql/isolated-auth/run-local.mjs');
const browser = read('../sql/isolated-auth/run-travel-browser.mjs');

test('travel decision notifications are transactionally generated with tenant-bound employee and history links', () => {
  assert.match(migration, /CREATE TABLE public\.travel_request_notifications/);
  assert.match(migration, /FOREIGN KEY \(tenant_id,travel_request_id\)[\s\S]+?REFERENCES public\.travel_requests\(tenant_id,id\)/);
  assert.match(migration, /FOREIGN KEY \(tenant_id,travel_status_history_id\)[\s\S]+?REFERENCES public\.travel_status_history\(tenant_id,id\)/);
  assert.match(migration, /FOREIGN KEY \(tenant_id,recipient_employee_id\)[\s\S]+?REFERENCES public\.employees\(tenant_id,id\)/);
  assert.match(migration, /UNIQUE \(tenant_id,recipient_employee_id,travel_status_history_id\)/);
  assert.match(migration, /ALTER TABLE public\.travel_request_notifications ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.travel_request_notifications FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /CREATE POLICY travel_request_notifications_owner_read[\s\S]+?hris_own_employee_for_tenant\(tenant_id\)=recipient_employee_id/);
  assert.match(migration, /CREATE TRIGGER travel_decision_notification_after_history[\s\S]+?AFTER INSERT ON public\.travel_status_history/);
  assert.match(migration, /NEW\.previous_status='submitted' AND NEW\.new_status IN \('approved','rejected'\)/);
  assert.match(migration, /ON CONFLICT \(tenant_id,recipient_employee_id,travel_status_history_id\) DO NOTHING/);
  assert.match(travel, /public\.has_tenant_permission\(p_tenant_id,'travel\.manage'\)/);
  assert.match(travel, /GRANT EXECUTE ON FUNCTION public\.hris_resolve_travel_request\(uuid,uuid,text,text\) TO authenticated,service_role/);
});

test('unified inbox merges travel decisions without changing project unread semantics or keyset order', () => {
  for (const fragment of [
    "'project_review','learning_completion','travel_decision'",
    "'travel_decision'::text AS source",
    "'travel_request_id',n.travel_request_id",
    "'travel_destination',n.travel_destination",
    "'travel_from_date',n.travel_from_date",
    "'travel_to_date',n.travel_to_date",
    "'unread_project_reviews',coalesce(v_unread_project_reviews,0)",
    'ORDER BY n.created_at DESC,n.source DESC,n.id DESC',
  ]) assert.ok(migration.includes(fragment), `missing inbox behavior: ${fragment}`);
  assert.match(inbox, /p_before_source IS NOT NULL AND p_before_source NOT IN \('project_review','learning_completion'\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hris_get_my_notifications\(uuid,integer,timestamptz,text,uuid\) FROM PUBLIC,anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.hris_get_my_notifications\(uuid,integer,timestamptz,text,uuid\) TO authenticated,service_role/);
});

test('notification center opens the matching employee travel request and expands its history', () => {
  const travelRequests = read('../../src/live/TravelRequests.tsx');
  const travelLocale = read('../../src/live/travel-request-locale.ts');
  assert.match(component, /source: 'travel_decision'/);
  assert.match(component, /Travel request approved/);
  assert.match(component, /Travel request rejected/);
  assert.match(component, /data-notification-source=\{item\.source\}/);
  assert.match(component, /onOpenTravel\(item\.travel_request_id\)/);
  assert.match(workspace, /const openTravelRequest = \(requestId: string\) => \{ setTravelFocusRequestId\(requestId\); navigate\('my-travel'\); \}/);
  assert.match(workspace, /focusRequestId=\{travelFocusRequestId\} onFocusHandled=\{clearTravelRequestFocus\}/);
  assert.match(travelRequests, /card\.scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/);
  assert.match(travelRequests, /card\.focus\(\{ preventScroll: true \}\)/);
  assert.match(travelRequests, /open=\{expandedHistoryRequestId === request\.id\}/);
  assert.match(browser, /details\[open\]/);
  assert.ok(travelLocale.includes("'The request linked to this notification is not in your travel history. Refresh your requests and try again.':"));
  for (const phrase of ['Travel update','Travel request approved','Travel request rejected',
    'Your travel request was approved.','Your travel request was rejected.','Open travel']) {
    assert.ok(locale.includes(`'${phrase}':`), `missing Bengali translation for ${phrase}`);
  }
});

test('isolated acceptance covers employee ownership, duplicate protection, tenant privacy, retry, EN/BN, and responsive navigation', () => {
  assert.ok(localRunner.includes('20261015022305_hris_travel_decision_notifications.sql'));
  assert.match(localRunner, /one-per-history, employee-owned, tenant-isolated/);
  assert.match(localRunner, /travelDecisionNotificationIntegrity\.mismatched_links === 0/);
  assert.match(localRunner, /directTravelDecisionRowsForeign\.data\.length === 0/);
  assert.match(browser, /hris_get_my_notifications/);
  assert.match(browser, /Expected one failed and one recovered inbox read/);
  assert.match(browser, /data-notification-kind="approved"/);
  assert.match(browser, /data-notification-kind="rejected"/);
  assert.match(browser, /ভ্রমণ অনুরোধ অনুমোদিত/);
  assert.match(browser, /ভ্রমণ অনুরোধ প্রত্যাখ্যাত/);
  assert.match(browser, /ভ্রমণ খুলুন/);
  assert.match(browser, /Travel decisions notification mobile/);
  assert.match(browser, /Travel decisions notification desktop/);
});

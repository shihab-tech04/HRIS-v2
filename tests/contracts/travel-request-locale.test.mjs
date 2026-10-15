import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const component = read('../../src/live/TravelRequests.tsx');
const locale = read('../../src/live/travel-request-locale.ts');
const workspace = read('../../src/live/LiveHrisWorkspace.tsx');
const navigation = read('../../src/live/project-locale.ts');
const browser = read('../sql/isolated-auth/run-travel-browser.mjs');

test('employee and reviewer travel pages receive the workspace locale', () => {
  assert.match(component, /export function MyTravelRequests\(\{ tenantId, locale, focusRequestId, onFocusHandled \}/);
  assert.match(component, /export function TravelRequests\(\{ tenantId, canManage, locale \}/);
  assert.match(workspace, /<TravelRequests tenantId=\{tenantId\} canManage=\{permissions\.travelManage\} locale=\{locale\}/);
  assert.match(workspace, /<MyTravelRequests tenantId=\{tenantId\} locale=\{locale\}/);
  assert.match(navigation, /'Travel requests': 'ভ্রমণ অনুরোধ'/);
  assert.match(navigation, /'My Travel': 'আমার ভ্রমণ'/);
});

test('travel journey labels and backend validation/recovery messages have Bengali mappings', () => {
  for (const phrase of [
    'Destination', 'Departure date', 'Return date', 'Purpose', 'Estimated cost', 'Currency',
    'Save draft', 'Submit for review', 'Returned for changes', 'Request history',
    'Return for changes', 'Confirm approval', 'Confirm return',
    'The return date must be the same as or after the departure date.',
    'Enter both an estimated cost and its currency, or leave both blank.',
    'Only draft or rejected travel requests can be submitted.',
    'Travel management permission for this organization is required.',
  ]) assert.match(locale, new RegExp(`'${phrase.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}'\\s*:`));
});

test('browser acceptance exercises real EN/BN travel work, responsive layouts, and failed-read retry', () => {
  assert.match(browser, /TRAVEL_ACCEPTANCE_ID/);
  assert.match(browser, /Switch language to Bengali/);
  assert.match(browser, /আমার ভ্রমণ অনুরোধ/);
  assert.match(browser, /ভ্রমণ অনুরোধ/);
  assert.match(browser, /Temporary test outage/);
  assert.match(browser, /history read, got \$\{personalContextReads\}/);
  assert.match(browser, /assertNoOverflow\(employeePage, 'Travel draft mobile'\)/);
  assert.match(browser, /assertNoOverflow\(managerPage, 'Travel manager queue mobile'\)/);
  assert.match(browser, /hris_resolve_travel_request/);
});

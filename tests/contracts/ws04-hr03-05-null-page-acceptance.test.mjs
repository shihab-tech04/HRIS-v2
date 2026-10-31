import test from 'node:test';
import assert from 'node:assert/strict';
import { readAllOrganizationPages } from '../../src/live/organizationTeamsPages.mjs';

/**
 * HR03-05 independent acceptance, separate from the WS07 implementation.
 *
 * PostgREST normally returns [] for a successful empty SELECT. A null data
 * value with no error is not a confirmed end-of-results signal: accepting it
 * after a full page silently undercounts the organization and corrupts CSV.
 * This independent QA regression must PASS after the minimal fail-closed correction.
 */
test('HR03-05: an ambiguous null first page never counts as an empty directory', async () => {
  await assert.rejects(
    readAllOrganizationPages(async () => ({ data: null, error: null }), () => true),
    /Invalid organization page response/,
  );
});

test('HR03-05: an ambiguous null later page rejects all partial directory results', async () => {
  const fetched = [];
  const result = readAllOrganizationPages(async (from, to) => {
    fetched.push([from, to]);
    return from === 0
      ? { data: Array.from({ length: 250 }, (_, i) => ({ id: i })), error: null }
      : { data: null, error: null };
  }, () => true);
  await assert.rejects(result, /Invalid organization page response/);
  assert.deepEqual(fetched, [[0, 249], [250, 499]]);
});

test('HR03-05: a real empty final page remains a successful completion', async () => {
  const items = Array.from({ length: 250 }, (_, id) => ({ id }));
  const actual = await readAllOrganizationPages(async (from, to) => ({
    data: items.slice(from, to + 1),
    error: null,
  }), () => true);
  assert.deepEqual(actual, items);
});

test('HR03-05: an explicit error on a null page remains the original error', async () => {
  const permissionError = new Error('tenant access revoked');
  await assert.rejects(
    readAllOrganizationPages(async () => ({ data: null, error: permissionError }), () => true),
    error => error === permissionError,
  );
});

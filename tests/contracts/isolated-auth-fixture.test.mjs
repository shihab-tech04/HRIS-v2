import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTrackedAuthUser,
  deleteTrackedAuthUser,
} from '../sql/isolated-auth/auth-user-fixture.mjs';

test('tracks the ID returned by a successful Auth fixture creation', async () => {
  const tracked = [];
  let lookups = 0;
  const user = await createTrackedAuthUser({
    email: 'fixture@hris.test',
    createUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    findUserId: async () => { lookups += 1; return null; },
    trackUserId: (id) => tracked.push(id),
  });

  assert.equal(user.id, 'user-1');
  assert.deepEqual(tracked, ['user-1']);
  assert.equal(lookups, 0);
});

test('recovers and tracks a row committed before a local Auth timeout', async () => {
  const tracked = [];
  let creates = 0;
  const user = await createTrackedAuthUser({
    email: 'fixture@hris.test',
    createUser: async () => { creates += 1; return { data: { user: null }, error: new Error('504') }; },
    findUserId: async () => 'committed-user',
    trackUserId: (id) => tracked.push(id),
  });

  assert.equal(user.id, 'committed-user');
  assert.deepEqual(tracked, ['committed-user']);
  assert.equal(creates, 1);
});

test('retries only after confirming the failed Auth attempt left no row', async () => {
  const tracked = [];
  const waits = [];
  let creates = 0;
  let lookups = 0;
  const user = await createTrackedAuthUser({
    email: 'fixture@hris.test',
    createUser: async () => {
      creates += 1;
      return creates === 1
        ? { data: { user: null }, error: new Error('504') }
        : { data: { user: { id: 'retry-user' } }, error: null };
    },
    findUserId: async () => { lookups += 1; return null; },
    trackUserId: (id) => tracked.push(id),
    wait: async (milliseconds) => waits.push(milliseconds),
  });

  assert.equal(user.id, 'retry-user');
  assert.deepEqual(tracked, ['retry-user']);
  assert.equal(creates, 2);
  assert.equal(lookups, 1);
  assert.deepEqual(waits, [1000]);
});

test('stops after bounded failures without tracking an unknown user', async () => {
  const tracked = [];
  let creates = 0;
  let lookups = 0;
  let waits = 0;

  await assert.rejects(createTrackedAuthUser({
    email: 'fixture@hris.test',
    createUser: async () => { creates += 1; return { data: { user: null }, error: new Error('504') }; },
    findUserId: async () => { lookups += 1; return null; },
    trackUserId: (id) => tracked.push(id),
    wait: async () => { waits += 1; },
  }), /504/);

  assert.equal(creates, 3);
  assert.equal(lookups, 3);
  assert.equal(waits, 2);
  assert.deepEqual(tracked, []);
});

test('accepts a committed delete after the local Auth response times out', async () => {
  let deletes = 0;
  let existenceChecks = 0;

  await deleteTrackedAuthUser({
    userId: 'fixture-user',
    deleteUser: async () => { deletes += 1; return { error: new Error('504') }; },
    userStillExists: async () => { existenceChecks += 1; return false; },
  });

  assert.equal(deletes, 1);
  assert.equal(existenceChecks, 1);
});

test('retries Auth teardown only while the exact synthetic row remains', async () => {
  let deletes = 0;
  let checks = 0;
  const waits = [];

  await deleteTrackedAuthUser({
    userId: 'fixture-user',
    deleteUser: async () => {
      deletes += 1;
      return deletes === 1 ? { error: new Error('504') } : { error: null };
    },
    userStillExists: async () => { checks += 1; return true; },
    wait: async (milliseconds) => waits.push(milliseconds),
  });

  assert.equal(deletes, 2);
  assert.equal(checks, 1);
  assert.deepEqual(waits, [1000]);
});

test('bounds repeated Auth teardown failures', async () => {
  let deletes = 0;
  let checks = 0;
  let waits = 0;

  await assert.rejects(deleteTrackedAuthUser({
    userId: 'fixture-user',
    deleteUser: async () => { deletes += 1; return { error: new Error('504') }; },
    userStillExists: async () => { checks += 1; return true; },
    wait: async () => { waits += 1; },
  }), /504/);

  assert.equal(deletes, 3);
  assert.equal(checks, 3);
  assert.equal(waits, 2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { tenantAttendanceDate } from '../../src/live/attendanceDate.mjs';

test('uses the tenant calendar day when UTC has not crossed midnight there', () => {
  const now = new Date('2026-10-15T20:00:00.000Z');
  assert.equal(tenantAttendanceDate(now, 'UTC'), '2026-10-15');
  assert.equal(tenantAttendanceDate(now, 'Asia/Dhaka'), '2026-10-16');
});

test('falls back to UTC when the tenant timezone is missing or invalid', () => {
  const now = new Date('2026-10-15T20:00:00.000Z');
  assert.equal(tenantAttendanceDate(now, null), '2026-10-15');
  assert.equal(tenantAttendanceDate(now, 'Not/A-Timezone'), '2026-10-15');
});

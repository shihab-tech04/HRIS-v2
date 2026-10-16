import test from 'node:test';
import assert from 'node:assert/strict';
import { tenantAttendanceDate, tenantAttendanceTime } from '../../src/live/attendanceDate.mjs';

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


test('formats attendance timestamps in the tenant timezone and handles missing punches', () => {
  assert.equal(tenantAttendanceTime('2026-10-16T03:00:00.000Z', 'Asia/Dhaka'), '09:00');
  assert.equal(tenantAttendanceTime(null, 'Asia/Dhaka'), null);
  assert.equal(tenantAttendanceTime('not-a-timestamp', 'Asia/Dhaka'), null);
});

test('falls back to UTC for an invalid tenant timezone', () => {
  assert.equal(tenantAttendanceTime('2026-10-16T03:00:00.000Z', 'Not/A-Timezone'), '03:00');
});

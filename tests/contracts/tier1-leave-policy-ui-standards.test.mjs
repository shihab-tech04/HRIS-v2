import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Tier 1 HR08: preserve the existing leave policy workflows while keeping
// labels, table headings and actions readable in the approved design system.
const policy = readFileSync(new URL('../../src/live/LeaveTypePolicyManager.tsx', import.meta.url), 'utf8');

test('HR08 leave policy uses 14px-or-greater standard UI type and the approved brand blue', () => {
  assert.match(policy, /const labelClass = 'block min-w-0 text-sm font-medium text-slate-600'/);
  assert.doesNotMatch(policy, /\btext-xs\b/, 'policy UI must not shrink required content to 12px');
  assert.doesNotMatch(policy, /#08558B/i, 'do not use an unapproved near-blue for policy actions');
  assert.match(policy, /bg-\[#085587\]/);
  assert.match(policy, /accent-\[#085587\]/);
});

test('HR08 form retains actual tenant-scoped policy operations, history-safe behavior and responsive table', () => {
  assert.match(policy, /supabase\.rpc\('hris_save_leave_type'/);
  assert.match(policy, /p_expected: editing \? expected\(editing\) : null/);
  assert.match(policy, /Existing employee balance records are preserved\./);
  assert.match(policy, /overflow-x-auto rounded-lg border border-slate-200/);
  assert.match(policy, /min-w-\[900px\]/);
  assert.match(policy, /onClick=\{\(\) => void setActive\(item\)\}/);
});

test('HR08 policy activation requires a matching server response before reporting success', () => {
  assert.match(policy, /const updated = result\.data && typeof result\.data === 'object'/);
  assert.match(policy, /updated\.id !== item\.id \|\| updated\.active === item\.active/);
  assert.match(policy, /throw new Error\(tx\('The leave policy response could not be verified\./);
  assert.match(policy, /setMessage\(item\.active \? tx\('Leave type deactivated\.'/);
});

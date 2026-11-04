import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const dictionary = readFileSync(new URL('../../src/live/project-locale.ts', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../src/live/PlatformTenantWorkspace.tsx', import.meta.url), 'utf8');
const recovered = [
  "Tenant module configuration updated. Historical records were retained.",
  "Try again",
  "Creating…",
  "Time zone",
  "Save details",
  "Edit details",
  "Revoking…",
  "Optional modules",
  "Disabling a module stops new operations and edits for this tenant. Historical records remain available to authorized readers.",
  "Loading modules…",
  "Enabled",
  "Disabled · historical records preserved",
  "Disable",
  "Enable",
  "All write actions call tenant-provisioning RPCs that verify the active platform Super Admin session and write an audit record. No service-role credential is used in the browser.",
  "Enable optional module?",
  "Disable optional module?",
  "New module operations will be available again, subject to normal access permissions.",
  "New operations, edits and deletions will be blocked. Existing records remain readable to authorized users.",
  "Confirm change",
  "Expense claims"
];

test('21 approved Platform Tenant Bengali labels survive branch consolidation', () => {
  assert.equal(recovered.length, 21);
  for (const label of recovered) {
    assert.ok(workspace.includes("tx('" + label + "')") || workspace.includes("expenses: '" + label + "'"), 'Label no longer used: ' + label);
    const row = dictionary.split('\n').find(line => line.startsWith("  '" + label + "': "));
    assert.ok(row, 'Missing Bengali translation: ' + label);
    assert.match(row, /[\u0980-\u09FF]/, 'English fallback for: ' + label);
  }
  assert.match(workspace, /import \{ projectText, type Locale \} from '\.\/project-locale'/);
  assert.doesNotMatch(workspace, /from ['"]\.\/platform-tenant-locale['"]/);
});

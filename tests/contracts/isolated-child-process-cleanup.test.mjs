import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { stopChildProcess } from '../sql/isolated-auth/stop-child-process.mjs';

async function startChild(source) {
  const child = spawn(process.execPath, ['-e', source], { stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve);
    child.once('error', reject);
  });
  return child;
}

test('disposable browser server exits on graceful termination', async () => {
  const child = await startChild("process.on('SIGTERM', () => process.exit(0)); process.stdout.write('ready'); setInterval(() => {}, 1000);");
  assert.equal(await stopChildProcess(child, { gracefulTimeoutMs: 1_000, forcedTimeoutMs: 500 }), 'terminated');
  assert.notEqual(child.exitCode, null);
});

test('disposable browser server is force-stopped when it ignores termination', async () => {
  const child = await startChild("process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000);");
  assert.equal(await stopChildProcess(child, { gracefulTimeoutMs: 100, forcedTimeoutMs: 1_000 }), 'killed');
  assert.equal(child.signalCode, 'SIGKILL');
});

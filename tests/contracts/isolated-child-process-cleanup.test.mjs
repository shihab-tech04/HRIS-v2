import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { stopChildProcess } from '../sql/isolated-auth/stop-child-process.mjs';

// The ChatGPT workspace sandbox forbids nested process spawning (EPERM), even
// when the normal CI runner can spawn and terminate local browser processes.
// Do not leave the suite hanging on a 'ready' event the sandbox cannot emit.
const childProbe = spawnSync(process.execPath, ['-e', "process.stdout.write('HRIS_CHILD_READY')"], {
  encoding: 'utf8', timeout: 2_000,
});
const restrictedSubprocessSandbox = childProbe.error?.code === 'EPERM';
const sandboxGuard = restrictedSubprocessSandbox
  ? { skip: 'Nested subprocess spawning denied with EPERM; CI must run the actual termination tests.' }
  : {};

async function startChild(source) {
  const child = spawn(process.execPath, ['-e', source], { stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Test subprocess never emitted its ready signal.'));
    }, 5_000);
    const ready = () => { clearTimeout(timeout); resolve(); };
    const failed = cause => { clearTimeout(timeout); reject(cause); };
    child.stdout.once('data', ready);
    child.once('error', failed);
    child.once('exit', () => failed(new Error('Test subprocess exited before its ready signal.')));
  });
  return child;
}

test('disposable browser server exits on graceful termination', sandboxGuard, async () => {
  const child = await startChild("process.on('SIGTERM', () => process.exit(0)); process.stdout.write('ready'); setInterval(() => {}, 1000);");
  assert.equal(await stopChildProcess(child, { gracefulTimeoutMs: 1_000, forcedTimeoutMs: 500 }), 'terminated');
  assert.notEqual(child.exitCode, null);
});

test('disposable browser server is force-stopped when it ignores termination', sandboxGuard, async () => {
  const child = await startChild("process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000);");
  assert.equal(await stopChildProcess(child, { gracefulTimeoutMs: 100, forcedTimeoutMs: 1_000 }), 'killed');
  assert.equal(child.signalCode, 'SIGKILL');
});

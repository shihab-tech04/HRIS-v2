function exited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForExit(child, timeoutMs) {
  if (exited(child)) return Promise.resolve(true);
  return new Promise(resolve => {
    let settled = false;
    const finish = didExit => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.off('exit', onExit);
      resolve(didExit);
    };
    const onExit = () => finish(true);
    const timeout = setTimeout(() => finish(false), timeoutMs);
    child.once('exit', onExit);
    if (exited(child)) finish(true);
  });
}

export async function stopChildProcess(child, { gracefulTimeoutMs = 5_000, forcedTimeoutMs = 1_000 } = {}) {
  if (exited(child)) return 'already-exited';

  const gracefulExit = waitForExit(child, gracefulTimeoutMs);
  child.kill('SIGTERM');
  if (await gracefulExit) return 'terminated';
  if (exited(child)) return 'terminated';

  const forcedExit = waitForExit(child, forcedTimeoutMs);
  child.kill('SIGKILL');
  if (await forcedExit) return 'killed';
  if (exited(child)) return 'killed';
  throw new Error('Child process did not exit after SIGKILL.');
}

/**
 * Create one synthetic Auth user while preserving cleanup ownership when the
 * local Auth endpoint times out after receiving the request.
 */
export async function createTrackedAuthUser({
  email,
  createUser,
  findUserId,
  trackUserId,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maxAttempts = 3,
}) {
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await createUser();
      if (!result.error && result.data?.user?.id) {
        trackUserId(result.data.user.id);
        return result.data.user;
      }
      lastError = result.error || new Error('Auth returned no user for the synthetic fixture.');
    } catch (error) {
      lastError = error;
    }

    // The harness requires an empty Auth service before starting. A matching
    // row after a failed request therefore belongs to this fixture attempt.
    const persistedUserId = await findUserId(email);
    if (persistedUserId) {
      trackUserId(persistedUserId);
      return { id: persistedUserId, email, recoveredAfterTimeout: true };
    }

    if (attempt + 1 < maxAttempts) await wait(1000 * (attempt + 1));
  }

  throw lastError || new Error('Unable to create the synthetic Auth fixture.');
}

/** Retry only transient Auth gateway/server errors; a real session is still required. */
export async function signInTrackedAuthUser({
  signIn,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maxAttempts = 3,
}) {
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await signIn();
      if (!result.error && result.data?.session && result.data?.user) return result.data;
      lastError = result.error || new Error('Auth returned no session for the synthetic fixture.');
    } catch (error) {
      lastError = error;
    }

    const status = Number(lastError?.status);
    if (![502, 503, 504].includes(status) || attempt + 1 >= maxAttempts) break;
    await wait(1000 * (attempt + 1));
  }

  throw lastError || new Error('Unable to sign in the synthetic Auth fixture.');
}

/** Retry bounded Auth teardown when a timeout leaves the delete outcome unclear. */
export async function deleteTrackedAuthUser({
  userId,
  deleteUser,
  userStillExists,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maxAttempts = 3,
}) {
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await deleteUser();
      if (!result.error) return;
      lastError = result.error;
    } catch (error) {
      lastError = error;
    }

    // Treat an absent row as a committed delete even if GoTrue's response timed out.
    if (!await userStillExists(userId)) return;
    if (attempt + 1 < maxAttempts) await wait(1000 * (attempt + 1));
  }

  throw lastError || new Error('Unable to delete the synthetic Auth fixture.');
}

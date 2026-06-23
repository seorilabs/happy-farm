// Shared diagnostic logging gate. Release bundles set `__DEV__ = false` (Metro),
// so these warnings compile away to no-ops in production and keep the store
// builds' consoles quiet, while still surfacing audio/asset failures during
// development. `typeof` guards platforms that don't define `__DEV__` (e.g. some
// Granite/web runtimes) — there it is treated as production and stays silent.
const isDevBuild = typeof __DEV__ !== 'undefined' && __DEV__ === true;

/**
 * Logs a warning only in development builds. Use for non-fatal, diagnostic-only
 * failures (asset load/playback errors) that should never reach a user's
 * production console.
 */
export function logDevWarning(message: string, ...args: unknown[]): void {
  if (!isDevBuild) {
    return;
  }
  console.warn(message, ...args);
}

// Decides during self-reload whether a new build of the plugin is there and completely written.
// Pure function without Obsidian, so it can be tested with Vitest. Used by src/development.ts.

/**
 * `loaded`: state of the plugin files at load time; `candidate`: last differing state seen; `now`: current state.
 * Reload only once a differing state is the same twice in a row (file completely written).
 */
export function nextStep(loaded: string, candidate: string, now: string): { reload: boolean; candidate: string } {
  if (!loaded || now === loaded) return { reload: false, candidate: "" };
  if (now !== candidate) return { reload: false, candidate: now };
  return { reload: true, candidate: now };
}

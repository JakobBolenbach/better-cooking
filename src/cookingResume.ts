// Where cooking mode stopped, per recipe and per device: closing it (X, Esc, another page) and starting it again for
// the same recipe within RESUME_MS continues at that step. The list lives in Obsidian's local storage (like the
// timers), never in data.json or in the note. Pure functions plus a small store; storage and clock are passed in.

/** Key in Obsidian's local storage: per device, not synchronised, not part of data.json. */
export const RESUME_KEY = "better-cooking-cooking-resume";

/** A remembered step is offered again for this long (ms) after the last step change. */
export const RESUME_MS = 12 * 60 * 60 * 1000;
/** An entry from the future (a clock that was set back) by more than this (ms) is dropped. */
export const RESUME_SKEW_MS = 60 * 1000;
/** At most this many recipes are remembered; the oldest are dropped. */
export const RESUME_MAX = 20;

export interface ResumeEntry {
  /** Note path of the recipe. */
  path: string;
  /** Index of the step that was shown (at least 1: step 0 is the default and not stored). */
  step: number;
  /** When the step was shown last (ms since epoch). */
  at: number;
}

/** Newest first, within the window, at most RESUME_MAX, one entry per path. */
export function prune(list: ResumeEntry[], now: number): ResumeEntry[] {
  const seen = new Set<string>();
  return [...list]
    .sort((a, b) => b.at - a.at)
    .filter((e) => {
      if (now - e.at > RESUME_MS || seen.has(e.path)) return false;
      seen.add(e.path);
      return true;
    })
    .slice(0, RESUME_MAX);
}

/** Reads the stored value; anything that is not a well-formed entry is dropped (the data may be broken or foreign). */
export function restoreResume(raw: unknown, now: number): ResumeEntry[] {
  if (!Array.isArray(raw)) return [];
  const list: ResumeEntry[] = [];
  for (const e of raw) {
    if (typeof e !== "object" || e === null) continue;
    const { path, step, at } = e as Record<string, unknown>;
    if (typeof path !== "string" || !path) continue;
    if (typeof step !== "number" || !Number.isInteger(step) || step < 1) continue;
    if (typeof at !== "number" || !Number.isFinite(at) || at > now + RESUME_SKEW_MS) continue;
    list.push({ path, step, at });
  }
  return prune(list, now);
}

/** The list after the cooking mode of `path` is at `step`; step 0 and the end (`step >= stepCount`) forget the recipe. */
export function remember(
  list: ResumeEntry[],
  path: string,
  step: number,
  stepCount: number,
  now: number,
): ResumeEntry[] {
  const rest = list.filter((e) => e.path !== path);
  if (step < 1 || step >= stepCount) return prune(rest, now);
  return prune([{ path, step, at: now }, ...rest], now);
}

/**
 * The step to start at: the remembered one while it is recent. If the recipe has fewer steps than then, it was
 * changed and the position means nothing any more, so it starts at the first step (no clamping).
 */
export function startStep(list: ResumeEntry[], path: string, now: number, stepCount: number): number {
  const e = list.find((x) => x.path === path);
  if (!e || now - e.at > RESUME_MS || e.step >= stepCount) return 0;
  return e.step;
}

export interface ResumeDeps {
  now(): number;
  load(): unknown;
  save(list: ResumeEntry[] | null): void;
}

/** What the UI needs: where to start, and a note of every step change. */
export interface ResumeApi {
  startStep: (path: string, stepCount: number) => number;
  /** The cooking mode of `path` shows `step` (of `stepCount`). */
  note: (path: string, step: number, stepCount: number) => void;
}

export function createResume(deps: ResumeDeps): ResumeApi {
  const read = () => restoreResume(deps.load(), deps.now());
  return {
    startStep: (path, stepCount) => startStep(read(), path, deps.now(), stepCount),
    note: (path, step, stepCount) => {
      const now = deps.now();
      const next = remember(read(), path, step, stepCount, now);
      deps.save(next.length ? next : null);
    },
  };
}

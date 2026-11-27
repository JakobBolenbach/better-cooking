// Model of the cooking timers: plain data and pure functions, no clock (the caller passes `now`, ms since 1970).
// The service that keeps them is src/timerService.ts; tests/timers.test.ts.

export interface Timer {
  id: string;
  /** Title of the step the timer was started from. */
  label: string;
  /** Path of the recipe note (for opening the recipe from a notification). */
  recipePath: string;
  /** Title of the recipe as shown when the timer was started (the note name if missing). */
  recipeTitle?: string;
  /** Wall clock time at which it ends (ms). Meaningless while paused. */
  endAt: number;
  /** Remaining time (ms) while paused. */
  pausedLeft?: number;
  /** When it was reported as over (ms); set until the user stops it. */
  rang?: number;
}

export const MINUTE = 60_000;

export const isPaused = (t: Timer) => t.pausedLeft !== undefined;
export const isRinging = (t: Timer) => t.rang !== undefined;
/** Counting down: neither paused nor over. */
export const isRunning = (t: Timer) => !isPaused(t) && !isRinging(t);

export function startTimer(
  list: Timer[],
  t: { id: string; label: string; recipePath: string; recipeTitle?: string },
  seconds: number,
  now: number,
): Timer[] {
  const ms = Math.max(1, Math.round(seconds)) * 1000;
  return [...list, { ...t, endAt: now + ms }];
}

const change = (list: Timer[], id: string, f: (t: Timer) => Timer): Timer[] =>
  list.map((t) => (t.id === id ? f(t) : t));

export function pauseTimer(list: Timer[], id: string, now: number): Timer[] {
  return change(list, id, (t) => (isRunning(t) ? { ...t, pausedLeft: remaining(t, now) } : t));
}

export function resumeTimer(list: Timer[], id: string, now: number): Timer[] {
  return change(list, id, (t) => {
    if (t.pausedLeft === undefined) return t;
    const { pausedLeft, ...rest } = t;
    return { ...rest, endAt: now + pausedLeft };
  });
}

/** One more minute: a paused timer gets it on its rest, a running one on its end (counted from now at the earliest), one that is over starts again with one minute. */
export function addMinute(list: Timer[], id: string, now: number): Timer[] {
  return change(list, id, (t) => {
    if (isRinging(t)) {
      const { rang: _rang, ...rest } = t;
      return { ...rest, endAt: now + MINUTE };
    }
    if (t.pausedLeft !== undefined) return { ...t, pausedLeft: t.pausedLeft + MINUTE };
    return { ...t, endAt: Math.max(t.endAt, now) + MINUTE };
  });
}

export const cancelTimer = (list: Timer[], id: string): Timer[] => list.filter((t) => t.id !== id);

/** The timers that are over and not reported yet. */
export const due = (list: Timer[], now: number): Timer[] => list.filter((t) => isRunning(t) && t.endAt <= now);

/** Mark timers as reported at `now`. */
export function markRang(list: Timer[], ids: string[], now: number): Timer[] {
  return list.map((t) => (ids.includes(t.id) ? { ...t, rang: now } : t));
}

/** Remaining time in ms (never below 0); 0 for one that is over. */
export function remaining(t: Timer, now: number): number {
  if (isRinging(t)) return 0;
  return Math.max(0, t.pausedLeft ?? t.endAt - now);
}

/** Timers over first (the one over longest first), then running by remaining time, then paused by remaining time. */
export function sortTimers(list: Timer[], now: number): Timer[] {
  const group = (t: Timer) => (isRinging(t) ? 0 : isPaused(t) ? 2 : 1);
  return [...list].sort((a, b) => {
    if (group(a) !== group(b)) return group(a) - group(b);
    if (isRinging(a) && isRinging(b)) return (a.rang ?? 0) - (b.rang ?? 0);
    return remaining(a, now) - remaining(b, now);
  });
}

/** A timer that ended longer ago than this (found at start, after standby) only shows a notice, no gong. */
export const QUIET_AFTER = 15 * MINUTE;

/** Hours and minutes of a time span, rounded to minutes. */
export function splitAgo(ms: number): { h: number; min: number } {
  const total = Math.max(0, Math.round(ms / MINUTE));
  return { h: Math.floor(total / 60), min: total % 60 };
}

/** Should a timer keep the screen on: on a phone while one runs or the gong plays (the desktop only keeps it on in cooking mode). */
export const screenWanted = (list: Timer[], mobile: boolean, gongPlaying: boolean): boolean =>
  mobile && (gongPlaying || list.some(isRunning));

const FORGET_AFTER = 12 * 60 * MINUTE;

/** Read timers from storage: anything else than well-formed entries is dropped, and so is one that has been over for 12 hours. */
export function restoreTimers(raw: unknown, now: number): Timer[] {
  if (!Array.isArray(raw)) return [];
  const out: Timer[] = [];
  for (const e of raw as unknown[]) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.label !== "string" || typeof o.recipePath !== "string") continue;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
    const endAt = num(o.endAt);
    if (endAt === undefined) continue;
    const t: Timer = { id: o.id, label: o.label, recipePath: o.recipePath, endAt };
    if (typeof o.recipeTitle === "string") t.recipeTitle = o.recipeTitle;
    const left = num(o.pausedLeft);
    if (left !== undefined) t.pausedLeft = Math.max(0, left);
    const rang = num(o.rang);
    if (rang !== undefined) t.rang = rang;
    if (t.pausedLeft === undefined && (t.rang ?? t.endAt) < now - FORGET_AFTER) continue;
    out.push(t);
  }
  return out;
}

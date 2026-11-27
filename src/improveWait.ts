// A proposal without a note is not at once a recipe of its own (#156, ADR 0007). Feedback on one device rebinds the
// note to a new job ID (`import: offen`); until that device has pushed, another device pulls the proposal but no note
// carries its job ID. "Save as a new recipe" would then make a duplicate. Pure rules, tested in tests/improveWait.test.ts.
import { keyOf } from "./source";

/**
 * How long a proposal without a note may wait for the device that rebinds the note to sync it. 24 hours: a phone that
 * has no connection or is not opened for a day is the usual cause, the first look at the proposal on this device is
 * the clock (not the file time of the proposal, which says when the processor wrote it, possibly long before this
 * device pulled it, and not the file time that a pull sets as it likes). A longer wait only delays a card whose recipe
 * is really gone; a shorter one risks the duplicate.
 */
export const SYNC_WAIT_MS = 24 * 60 * 60 * 1000;

/** The first recipe note with the same source (the key of the duplicate check, src/source.ts `keyOf`) as the proposal. */
export function sameSourceNote<R extends { source?: string }>(
  source: string | undefined,
  notes: readonly R[],
): R | undefined {
  const key = keyOf(source);
  return key ? notes.find((n) => keyOf(n.source) === key) : undefined;
}

/**
 * Is a proposal without a note still waiting for another device ("waiting"), or really an orphan ("orphan")? It
 * waits while a note with the same source exists (the note is the recipe this proposal belongs to, the rebinding has
 * not arrived) or while the proposal is younger than `SYNC_WAIT_MS` on this device.
 */
export function orphanWait(i: { now: number; firstSeen: number; sameSource: boolean }): "waiting" | "orphan" {
  return i.sameSource || i.now - i.firstSeen < SYNC_WAIT_MS ? "waiting" : "orphan";
}

/** When to look again at a waiting proposal: when the waiting time ends, but at least every 10 minutes (a note may arrive). */
export const recheckIn = (now: number, firstSeen: number): number =>
  Math.min(Math.max(firstSeen + SYNC_WAIT_MS - now, 0) + 1000, 10 * 60_000);

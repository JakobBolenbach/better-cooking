// The card of a proposal that no note carries the job ID of (#156, ADR 0007): waiting for another device to sync, or a
// real orphan. Reads the notes of the recipe folder for a note with the same source; the decision itself is pure
// (src/improveWait.ts). Used by src/improveService.ts.
import type BetterCookingPlugin from "./main";
import type { Orphan } from "./improve";
import { orphanWait, recheckIn, sameSourceNote } from "./improveWait";
import { recipeStubs } from "./recipeStubs";
import { noteName } from "./parse";

/** The card and, for a waiting one, in how many ms to look at the proposal again. */
export function cardWithoutNote(
  p: BetterCookingPlugin,
  o: { path: string; job: string; title: string; source?: string; firstSeen: number },
): { card: Orphan; recheck?: number } {
  const now = Date.now();
  const same = sameSourceNote(o.source, recipeStubs(p));
  const wait = orphanWait({ now, firstSeen: o.firstSeen, sameSource: !!same });
  const base = { path: o.path, job: o.job, title: o.title };
  if (wait === "orphan") return { card: { ...base, kind: "orphan" } };
  const note = same && { path: same.path, title: noteName(same.path) };
  return { card: { ...base, kind: "waiting", ...(note ? { note } : {}) }, recheck: recheckIn(now, o.firstSeen) };
}

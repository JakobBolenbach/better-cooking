// The order of the groups when a step does not decide between ingredients of one name (issue #162): steps usually go
// through the groups one after the other (dough, then glaze), so a name that is in several groups and that the step
// gives no cue for belongs to the group that the nearest steps use unambiguously. Pure functions, tested in
// tests/stepGuessing.test.ts. The words of one step are matched in cooking.ts and stepFilter.ts.
import { stepHits } from "./cooking";
import { nameKey, type Hit } from "./stepFilter";
import type { IngredientGroup } from "./types";

interface Found {
  hits: Hit[];
  confirmed: Set<Hit>;
}

/** The groups per name key of the hits, for names that are in more than one group. */
function ambiguous(found: Found, groups: IngredientGroup[]): Map<string, Set<number>> {
  const byKey = new Map<string, Set<number>>();
  for (const h of found.hits) {
    const key = nameKey(groups[h.group].ingredients[h.index]);
    byKey.set(key, (byKey.get(key) ?? new Set()).add(h.group));
  }
  for (const [k, gs] of byKey)
    if (
      gs.size < 2 ||
      found.hits.some((h) => found.confirmed.has(h) && nameKey(groups[h.group].ingredients[h.index]) === k)
    )
      byKey.delete(k);
  return byKey;
}

/**
 * The ingredients of every step of a recipe, guessed from the words of each step. A name in several groups that the
 * step leaves open goes to the group of the nearest step that uses one of those groups unambiguously (the one before
 * first, if two are equally near); if no step does, all groups stay.
 */
export function guessedIngredients(
  steps: readonly { title?: string; text: string }[],
  groups: IngredientGroup[],
): Hit[][] {
  const found = steps.map((s) => stepHits(`${s.title ?? ""} ${s.text}`, groups));
  const open = found.map((f) => ambiguous(f, groups));
  // Groups a step uses with names that are in no other group among its hits.
  const active = found.map(
    (f, i) =>
      new Set(f.hits.filter((h) => !open[i].has(nameKey(groups[h.group].ingredients[h.index]))).map((h) => h.group)),
  );
  return found.map((f, i) => {
    if (!open[i].size) return f.hits;
    const drop = new Set<Hit>();
    for (const [key, candidates] of open[i]) {
      const chosen = nearest(active, i, candidates);
      if (!chosen.size) continue;
      f.hits
        .filter((h) => nameKey(groups[h.group].ingredients[h.index]) === key && !chosen.has(h.group))
        .forEach((h) => drop.add(h));
    }
    return f.hits.filter((h) => !drop.has(h));
  });
}

/** The candidate groups that the nearest step with one of them uses (the step before first if two are equally near); none if no step does. */
export function nearest(active: Set<number>[], i: number, candidates: Set<number>): Set<number> {
  for (let d = 1; d < active.length; d++)
    for (const j of [i - d, i + d]) {
      const used = [...(active[j] ?? [])].filter((g) => candidates.has(g));
      if (used.length) return new Set(used);
    }
  return new Set();
}

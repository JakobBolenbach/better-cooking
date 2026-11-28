// The order of the groups when a name is in several groups and the step does not decide (issue #162): steps usually go
// through the groups one after the other (dough, then glaze), so such a name belongs to the group that the nearest
// steps use unambiguously. Pure functions, tested in tests/stepIngredientsLine.test.ts.

/** The candidate groups that the nearest step with one of them uses (the step before first if two are equally near); none if no step does. */
export function nearest(active: Set<number>[], i: number, candidates: Set<number>): Set<number> {
  for (let d = 1; d < active.length; d++)
    for (const j of [i - d, i + d]) {
      const used = [...(active[j] ?? [])].filter((g) => candidates.has(g));
      if (used.length) return new Set(used);
    }
  return new Set();
}

import { beforeEach, describe, expect, it } from "vitest";
import { parseRecipe } from "../src/parse";
import { setLanguage } from "../src/i18n";
import { categoriesOf, inList, jobsFor, languagesOf, listEntries, listName, originalsOf } from "../src/ui/lists";
import type { RecipeView } from "../src/types";

function recipe(name: string, front: string, modified = 1): RecipeView {
  const r = parseRecipe(`Recipes/${name}.md`, `---\ntyp: rezept\n${front}\n---\n# ${name}\n`, modified);
  return { ...r, imageSrcs: [] };
}

const a = recipe("Apple", "status: bewaehrt\nkategorie: Kuchen\nbewertung: 3\nerstellt: 2026-01-01");
const b = recipe("Berry", "status: ausprobieren\nkategorie: Kuchen\nerstellt: 2026-02-01\nzuletzt_gemacht: 2026-03-01");
const c = recipe("Curry", "status: verworfen\nkategorie: Suppe\nerstellt: 2026-03-01");
const d = recipe("Dal", "status: ausprobieren\nkategorie: Suppe\nerstellt: 2026-04-01");
const all = [a, b, c, d];

beforeEach(() => setLanguage("en"));

describe("lists", () => {
  it("counts per list and discarded recipes", () => {
    const { lists, discarded } = listEntries(all);
    expect(Object.fromEntries(lists.map((l) => [l.id, l.count]))).toEqual({
      alle: 3,
      bewaehrt: 1,
      ausprobieren: 2,
      zuletzt: 1,
    });
    expect(discarded).toBe(1);
  });

  it("categories without discarded recipes, sorted", () => {
    expect(categoriesOf(all)).toEqual([
      ["Kuchen", 2],
      ["Suppe", 1],
    ]);
  });

  it("filters and sorts the lists", () => {
    const names = (l: Parameters<typeof inList>[2]) => inList(all, all, l).map((r) => r.title);
    expect(names("alle")).toEqual(["Dal", "Berry", "Apple"]);
    expect(names("ausprobieren")).toEqual(["Dal", "Berry"]);
    expect(names("bewaehrt")).toEqual(["Apple"]);
    expect(names("zuletzt")).toEqual(["Berry"]);
    expect(names("verworfen")).toEqual(["Curry"]);
    expect(names("kat:Kuchen")).toEqual(["Berry", "Apple"]);
  });

  it("shows import cards only in All and To try, never during a search", () => {
    const jobs = [1, 2];
    expect(jobsFor("alle", "", jobs)).toEqual(jobs);
    expect(jobsFor("ausprobieren", " ", jobs)).toEqual(jobs);
    expect(jobsFor("alle", "lentil", jobs)).toEqual([]);
    expect(jobsFor("ausprobieren", "x", jobs)).toEqual([]);
    expect(jobsFor("bewaehrt", "", jobs)).toEqual([]);
    expect(jobsFor("kat:Suppe", "", jobs)).toEqual([]);
  });

  it("names the list", () => {
    const { lists } = listEntries(all);
    expect(listName("kat:Suppe", lists)).toBe("Suppe");
    expect(listName("verworfen", lists)).toBe("Discarded");
    expect(listName("ausprobieren", lists)).toBe("To try");
  });

  it("lists a translation only under Proven and breaks ties by change time", () => {
    const original = recipe("Bread", "status: bewaehrt\nbewertung: 4\nerstellt: 2026-05-01");
    const translation = recipe("Brot", 'status: bewaehrt\nbewertung: 4\nuebersetzung_von: "[[Bread]]"', 5);
    const visible = [original, translation];
    const originals = visible.filter((r) => !r.translationOf);
    expect(originals).toHaveLength(1);
    expect(inList(originals, visible, "bewaehrt").map((r) => r.title)).toEqual(["Bread", "Brot"]);
    expect(inList(originals, visible, "alle").map((r) => r.title)).toEqual(["Bread"]);
    expect(listEntries(originals).lists.find((l) => l.id === "bewaehrt")?.count).toBe(1);
    const older = recipe("Older", "status: ausprobieren\nerstellt: 2026-06-01", 1);
    const newer = recipe("Newer", "status: ausprobieren\nerstellt: 2026-06-01", 9);
    expect(inList([older, newer], [older, newer], "ausprobieren").map((r) => r.title)).toEqual(["Newer", "Older"]);
  });

  it("falls back to the app name for an unknown list", () => {
    expect(listName("zuletzt", [])).toBe("Recipes");
  });
});

describe("originalsOf (#119)", () => {
  it("lists a translation whose original is gone as a recipe of its own", () => {
    const original = recipe("Bread", "status: bewaehrt");
    const translation = recipe("Brot", 'status: bewaehrt\nuebersetzung_von: "[[Bread]]"', 5);
    expect(originalsOf([original, translation]).map((r) => r.title)).toEqual(["Bread"]);
    expect(originalsOf([translation]).map((r) => r.title)).toEqual(["Brot"]);
    expect(languagesOf([translation], translation)).toBeUndefined();
  });
});

// The way of reading reaches the note through the services (ADR 0008): "Fetch again" and an applied improvement.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("./stubs/obsidianFake"));
vi.mock("../src/notice", () => import("./stubs/obsidianFake"));
const page = vi.hoisted(() => ({ html: "" }));
vi.mock("../src/localImport", async (orig) => ({
  ...(await orig<typeof import("../src/localImport")>()),
  loadPage: vi.fn(async () => ({ html: page.html })),
}));

import { parseRecipe } from "../src/parse";
import { setLanguage } from "../src/i18n";
import { Refetcher } from "../src/refetchService";
import { recipeNote } from "../src/recipeNote";
import { DEFAULT_FORMAT } from "../src/noteFormat";
import { NOTE, PROPOSAL, first, firstVersion, proposalText, setup } from "./improveFake";

const SOURCE = "https://example.org/r";
const ld = {
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Linsensuppe",
  recipeIngredient: ["250 g Linsen", "1 Zwiebel", "1 l Brühe"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Alles kochen." }],
};

beforeEach(() => {
  setLanguage("de");
  vi.stubGlobal("window", { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() });
  page.html = `<html><script type="application/ld+json">${JSON.stringify(ld)}</script></html>`;
});

describe("the way of reading in written notes", () => {
  it("Fetch again sets the way of the new reading: page", async () => {
    const note = recipeNote(first, { today: "2026-11-01", format: DEFAULT_FORMAT, source: SOURCE, via: "rules" });
    const s = setup({ [NOTE]: note }, []);
    const refetcher = new Refetcher(s.plugin as never);
    const preview = await refetcher.preview(NOTE);
    expect(preview.ok).toBe(true);
    const done = await refetcher.apply(NOTE, []);
    expect(done.ok).toBe(true);
    expect(parseRecipe("x", s.text(NOTE)).importVia).toBe("page");
    expect(s.text(NOTE)).toContain("1 l Brühe");
  });

  it("an applied improvement sets processor", async () => {
    const note = firstVersion().replace("typ: rezept", "typ: rezept\nimport_weg: rules");
    const s = setup({ [NOTE]: note, [PROPOSAL]: proposalText() });
    await s.service.handle(PROPOSAL);
    expect(parseRecipe("x", s.text(NOTE)).importVia).toBe("processor");
    expect(parseRecipe("x", s.text(NOTE)).title).toBe("Rote Linsensuppe");
  });
});

// importSocial and the first version (#133): which result becomes a first version with a job, which is saved as it is
// (no job), and what stays as before. loadPage, the page parser and the AI are replaced; saveRecipe records what it is given.
import { beforeEach, describe, expect, it, vi } from "vitest";

const saved: { o: { job?: string }; r: { title: string } }[] = [];
const state = { text: "", links: [] as string[], website: "saved" as "saved" | "none" };
vi.mock("obsidian", () => ({ normalizePath: (p: string) => p, requestUrl: vi.fn() }));
vi.mock("../src/localImport", async (orig) => ({
  ...(await orig<typeof import("../src/localImport")>()),
  saveRecipe: vi.fn(async (_a: unknown, _f: unknown, r: { title: string }, o: { job?: string }) => {
    saved.push({ o, r });
    return { status: "gespeichert", path: "R/x.md", title: r.title, state: "teilweise" };
  }),
  importLocally: vi.fn(async () =>
    state.website === "saved"
      ? { status: "gespeichert", path: "R/Site.md", title: "Site", state: "fertig" }
      : { status: "keinSchema", html: "" },
  ),
  loadPage: vi.fn(async () => ({ html: "<html></html>" })),
}));
vi.mock("../src/socialPage", () => ({ parseSocialPage: () => ({ text: state.text, links: state.links }) }));
const ai = vi.hoisted((): { result: unknown } => ({ result: undefined }));
vi.mock("../src/aiImport", () => ({ recipeWithAi: vi.fn(async () => ai.result) }));

import { importSocial, type SocialContext } from "../src/socialImport";
import { detectSource } from "../src/source";
import { setLanguage } from "../src/i18n";

const e = detectSource("https://www.instagram.com/p/ABC123/");
const COMPLETE = "Reis\nZutaten:\n200 g Reis\nZubereitung:\n1. Reis 12 Minuten kochen.";
const ONLY_INGREDIENTS = "Reis\nZutaten:\n200 g Reis\n1 Prise Salz";
const ctx = (o: Partial<SocialContext> = {}): SocialContext => ({
  app: {} as never,
  folder: "R",
  format: { lang: "de", fields: {} } as never,
  extraProperties: [],
  recipes: [],
  followLinks: true,
  fallback: true,
  ...o,
});
const withJob = (run: SocialContext["run"], o: Partial<SocialContext> = {}) =>
  ctx({ run, job: "rz-abc-0001", reserve: vi.fn(async () => undefined), ...o });

beforeEach(() => {
  setLanguage("de");
  saved.length = 0;
  Object.assign(state, { text: COMPLETE, links: [], website: "saved" });
  ai.result = undefined;
});

describe("the rules' result", () => {
  it("run always: a complete caption becomes a first version, with the job reserved before it is written", async () => {
    const c = withJob("always");
    const r = await importSocial(c, e);
    expect(r).toMatchObject({ ok: true, how: "rules", firstVersion: true });
    expect(saved[0].o.job).toBe("rz-abc-0001");
    expect(c.reserve).toHaveBeenCalledWith("rz-abc-0001");
  });
  it("run always: a partial one too", async () => {
    state.text = ONLY_INGREDIENTS;
    expect(await importSocial(withJob("always"), e)).toMatchObject({ ok: true, firstVersion: true });
  });
  it("run partial (Automatic): a partial one is a first version, a complete one is saved as before, without a job", async () => {
    state.text = ONLY_INGREDIENTS;
    expect(await importSocial(withJob("partial"), e)).toMatchObject({ ok: true, firstVersion: true });
    expect(saved[0].o.job).toBe("rz-abc-0001");
    state.text = COMPLETE;
    const c = withJob("partial");
    const r = await importSocial(c, e);
    expect(r).toMatchObject({ ok: true, how: "rules" });
    expect(r).not.toHaveProperty("firstVersion");
    expect(saved[1].o.job).toBeUndefined();
    expect(c.reserve).not.toHaveBeenCalled();
  });
  it("without a first version (setting off): a partial one goes to the processor, a complete one is saved", async () => {
    state.text = ONLY_INGREDIENTS;
    expect(await importSocial(ctx(), e)).toMatchObject({ ok: false, why: "noRecipe" });
    expect(saved).toHaveLength(0);
    state.text = COMPLETE;
    expect(await importSocial(ctx(), e)).toMatchObject({ ok: true });
    expect(saved[0].o.job).toBeUndefined();
  });
  it("without a processor: saved as before, no job, whatever the context says", async () => {
    state.text = ONLY_INGREDIENTS;
    const r = await importSocial(ctx({ fallback: false }), e);
    expect(r).toMatchObject({ ok: true, how: "rules" });
    expect(saved[0].o.job).toBeUndefined();
  });
  it("nothing usable: a failure, no note, no reservation", async () => {
    state.text = "Heute war ein schöner Tag #sonne";
    const c = withJob("always");
    expect(await importSocial(c, e)).toMatchObject({ ok: false });
    expect(saved).toHaveLength(0);
    expect(c.reserve).not.toHaveBeenCalled();
  });
});

describe("the own AI's result", () => {
  const recipe = (ingredients: string[], steps: string[]) => ({
    recipe: { title: "Reis", ingredients, steps: steps.map((text) => ({ text })), images: [] },
  });
  const aiCtx = (run: SocialContext["run"], o = {}) => withJob(run, { ai: { settings: {} as never, key: null }, ...o });
  it("a first version when the processor was chosen, or when Automatic got an incomplete result", async () => {
    ai.result = recipe(["200 g Reis"], ["Kochen."]);
    expect(await importSocial(aiCtx("always"), e)).toMatchObject({ ok: true, how: "ai", firstVersion: true });
    ai.result = recipe(["200 g Reis"], []);
    expect(await importSocial(aiCtx("partial"), e)).toMatchObject({ ok: true, how: "ai", firstVersion: true });
  });
  it("a complete result with Automatic is saved without a job (cost)", async () => {
    ai.result = recipe(["200 g Reis"], ["Kochen."]);
    const r = await importSocial(aiCtx("partial"), e);
    expect(r).toMatchObject({ ok: true, how: "ai" });
    expect(r).not.toHaveProperty("firstVersion");
    expect(saved[0].o.job).toBeUndefined();
  });
  it("a partial result is saved as before when the first version is off", async () => {
    ai.result = recipe(["200 g Reis"], []);
    const r = await importSocial(aiCtx(undefined), e);
    expect(r).toMatchObject({ ok: true, how: "ai" });
    expect(saved[0].o.job).toBeUndefined();
  });
  it("a failure of the AI is a failure and writes nothing", async () => {
    ai.result = { error: "Der Schlüssel wurde abgelehnt.", technical: true };
    const c = aiCtx("always");
    expect(await importSocial(c, e)).toMatchObject({ ok: false, why: "technical" });
    expect(saved).toHaveLength(0);
    expect(c.reserve).not.toHaveBeenCalled();
  });
});

describe("a recipe website in the post", () => {
  it("is saved as a normal recipe without a first version and without a job", async () => {
    state.text = "Rezept bei uns im Link";
    state.links = ["https://rezepte.example/reis"];
    const c = withJob("always");
    const r = await importSocial(c, e);
    expect(r).toMatchObject({ ok: true, how: "website" });
    expect(r).not.toHaveProperty("firstVersion");
    expect(c.reserve).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
  });
  it("a website without recipe data falls through to the caption's text", async () => {
    state.text = ONLY_INGREDIENTS;
    state.links = ["https://rezepte.example/reis"];
    state.website = "none";
    expect(await importSocial(withJob("always"), e)).toMatchObject({ ok: true, how: "rules", firstVersion: true });
  });
});

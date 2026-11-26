import { beforeEach, describe, expect, it } from "vitest";
import { setLanguage } from "../src/i18n";
import { detectSource, keyOf } from "../src/source";
import {
  jobState,
  jobError,
  SLOW_MIN,
  jobText,
  fireRequest,
  githubRequest,
  newJobId,
  checkJobs,
  chooseProcessor,
  evaluateResponse,
  WAIT_MIN,
} from "../src/processor";
import { nextStep } from "../src/reload";
import type { Job } from "../src/types";

describe("processor", () => {
  // Messages are checked in German; tests/i18n.test.ts covers English.
  beforeEach(() => setLanguage("de"));
  it("chooses the processor", () => {
    expect(chooseProcessor("auto", true, true)).toBe("claude");
    expect(chooseProcessor("auto", false, true)).toBe("github");
    expect(chooseProcessor("auto", false, false)).toBeNull();
    expect(chooseProcessor("claude", false, true)).toBeNull();
    expect(chooseProcessor("github", true, true)).toBe("github");
  });
  it("baut Anfragen", () => {
    const e = detectSource("https://www.instagram.com/reel/BcExample01/?bqrl=x");
    const a = { id: "rz-1", input: e.url! };
    const t: unknown = JSON.parse(jobText(a, e));
    expect(t).toEqual({
      rezept_auftrag: "rz-1",
      art: "instagram",
      quelle: "https://www.instagram.com/reel/BcExample01/",
      schluessel: "instagram:BcExample01",
      text: null,
    });
    const f = fireRequest("trig_0123456789abc", " tok ", "x");
    expect(f.url).toBe("https://api.anthropic.com/v1/claude_code/routines/trig_0123456789abc/fire");
    expect(f.headers.Authorization).toBe("Bearer tok");
    const g = githubRequest("owner/vault", "gh", a, e);
    expect(g.url).toBe("https://api.github.com/repos/owner/vault/actions/workflows/rezept-import.yml/dispatches");
    expect(JSON.parse(g.body)).toEqual({
      ref: "main",
      inputs: { auftrag: "rz-1", quelle: "https://www.instagram.com/reel/BcExample01/", text: "" },
    });
    const txt = detectSource("500 g Mehl\n300 ml Wasser");
    expect(
      (
        JSON.parse(githubRequest("a/b", "gh", { id: "rz-2", input: "500 g Mehl\n300 ml Wasser" }, txt).body) as {
          inputs: { text: string };
        }
      ).inputs.text,
    ).toBe("500 g Mehl\n300 ml Wasser");
    expect(newJobId(0, 0)).toBe("rz-0-0000");
  });
  it("evaluates responses", () => {
    expect(evaluateResponse("claude", 200, { claude_code_session_url: "https://claude.ai/code/x" })).toEqual({
      ok: true,
      session: "https://claude.ai/code/x",
    });
    expect(evaluateResponse("github", 204, null)).toEqual({ ok: true, session: undefined });
    expect(evaluateResponse("github", 403, { message: "Resource not accessible" })).toEqual({
      ok: false,
      message: "GitHub-Token darf keine Actions starten (Recht „Actions: Read and write“) (Resource not accessible)",
    });
    expect(evaluateResponse("claude", 401, {}).ok).toBe(false);
  });
  it("closes jobs by ID or source, otherwise times out", () => {
    const now = 10_000_000;
    const a: Job[] = [
      { id: "rz-a", input: "x", kind: "text", since: now - 1000, processor: "claude" },
      {
        id: "rz-b",
        input: "https://www.instagram.com/reel/AB/",
        kind: "instagram",
        key: "instagram:AB",
        since: now - 1000,
        processor: "github",
      },
      {
        id: "rz-c",
        input: "https://x.de/r",
        kind: "webseite",
        key: "x.de/r",
        since: now - (WAIT_MIN + 1) * 60_000,
        processor: "github",
      },
    ];
    const recipes = [
      { path: "a.md", job: "rz-a", modified: now },
      { path: "b.md", source: "https://instagram.com/p/AB", modified: now },
    ];
    const r = checkJobs(a, recipes, keyOf, now);
    expect(r.done.map((f) => f.recipe.path)).toEqual(["a.md", "b.md"]);
    expect(r.pending).toHaveLength(1);
    expect(r.pending[0].errorKey).toBe("noRecipeArrived");
    expect(r.pending[0].error).toBeUndefined();
    expect(jobError(r.pending[0])).toMatch(/kein Rezept|No recipe/);
  });
  it("reloads only once the state is stable", () => {
    expect(nextStep("a", "", "b")).toEqual({ reload: false, candidate: "b" });
    expect(nextStep("a", "b", "b")).toEqual({ reload: true, candidate: "b" });
  });
});

describe("jobState", () => {
  it("running, taking longer, error", () => {
    const now = 10_000_000;
    expect(jobState({ since: now - 60_000 }, now)).toBe("laeuft");
    expect(jobState({ since: now - (SLOW_MIN + 1) * 60_000 }, now)).toBe("langsam");
    expect(jobState({ since: now, error: "x" }, now)).toBe("fehler");
  });
});

describe("jobError", () => {
  it("translates a known error by its key into the current language", () => {
    setLanguage("de");
    expect(jobError({ errorKey: "noRecipeArrived" })).toBe(
      "Nach 20 Minuten kein Rezept angekommen. Warum, steht im Lauf; sonst Sync prüfen.",
    );
    setLanguage("en");
    expect(jobError({ errorKey: "noRecipeArrived" })).toBe(
      "No recipe arrived after 20 minutes. The run shows why; otherwise check the sync.",
    );
  });
  it("keeps free messages and counts an error key as a failure", () => {
    expect(jobError({ error: "Workflow failed (422)" })).toBe("Workflow failed (422)");
    expect(jobError({})).toBeUndefined();
    expect(jobState({ since: 1, errorKey: "noRecipeArrived" }, 2)).toBe("fehler");
  });
});

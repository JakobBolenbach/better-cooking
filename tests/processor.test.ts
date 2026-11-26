import { beforeEach, describe, expect, it } from "vitest";
import { setLanguage } from "../src/i18n";
import { detectSource, keyOf } from "../src/source";
import {
  jobState,
  SLOW_MIN,
  jobText,
  fireRequest,
  githubRequest,
  newJobId,
  checkJobs,
  chooseProcessor,
  noProcessorMessage,
  evaluateResponse,
  WAIT_MIN,
} from "../src/processor";
import { readPageLocally } from "../src/extraProperties";
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
  it('"none" never picks a processor, whatever is set up (#47)', () => {
    expect(chooseProcessor("none", true, true, true)).toBeNull();
    // so websites are read locally even if the setting prefers the processor, and text goes to the offline rules
    expect(readPageLocally(false, !!chooseProcessor("none", true, true, true))).toBe(true);
    expect(readPageLocally(false, !!chooseProcessor("auto", true, true, true))).toBe(false);
  });
  it("names the chosen processor that is not set up (#47)", () => {
    const m = noProcessorMessage("ai", { claude: true, github: false, ai: false });
    expect(m).toContain("Eigene KI ist gewählt, aber nicht eingerichtet");
    expect(m).toContain("Claude ist eingerichtet");
    expect(m).not.toContain("GitHub");
    expect(noProcessorMessage("claude", { claude: false, github: false, ai: true })).toBe(
      "Claude ist gewählt, aber nicht eingerichtet (Token oder Schlüssel fehlt).",
    );
    expect(noProcessorMessage("github", { claude: true, github: false, ai: false })).toContain(
      "Claude ist eingerichtet",
    );
    expect(noProcessorMessage("none", { claude: true, github: true, ai: true })).toContain("„Keiner (ohne KI)“");
    expect(noProcessorMessage("auto", { claude: false, github: false, ai: false })).toContain("Noch kein Verarbeiter");
    setLanguage("en");
    expect(noProcessorMessage("ai", { claude: true, github: false, ai: false })).toBe(
      "Own AI is chosen but not set up (token or key missing). Claude is set up and can be chosen instead under Settings → Better Cooking → Processor.",
    );
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
    expect(r.pending[0].error).toMatch(/kein Rezept/);
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

import { beforeEach, describe, expect, it } from "vitest";
import { setLanguage } from "../src/i18n";
import { detectSource, keyOf } from "../src/source";
import {
  retryGuard,
  jobState,
  jobError,
  SLOW_MIN,
  jobText,
  fireRequest,
  githubRequest,
  newJobId,
  checkJobs,
  settleJobs,
  FOREIGN_KEEP_MS,
  chooseProcessor,
  processorStatus,
  noRecipeDataMessage,
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
  it("derives short and long hints from one place (#47)", () => {
    const none = { claude: false, github: false, ai: false };
    const claude = { ...none, claude: true };
    const a = processorStatus("ai", claude);
    expect(a.short).toBe("Eigene KI nicht eingerichtet");
    // social media first: the own AI cannot read it, then what is missing, then the alternative
    expect(a.long.startsWith("Deine eigene KI kann keine Social-Media")).toBe(true);
    expect(a.long).toContain("Eigene KI ist gewählt, aber nicht vollständig eingerichtet. Claude ist eingerichtet");
    expect(a.notReady).toContain("nicht vollständig eingerichtet");
    expect(processorStatus("ai", { ...none, ai: true }).short).toBe("nicht für Social Media");
    expect(processorStatus("claude", { ...none, ai: true })).toMatchObject({ short: "Claude nicht eingerichtet" });
    expect(processorStatus("claude", none).long).toBe("Claude ist gewählt, aber nicht vollständig eingerichtet.");
    const n = processorStatus("none", { claude: true, github: true, ai: true });
    expect(n.short).toBe("ohne KI");
    expect(n.long).toContain("„Keiner (Import ohne KI)“");
    expect(n.notReady).toBeUndefined();
    expect(processorStatus("auto", none).short).toBe("kein Verarbeiter eingerichtet");
    expect(processorStatus("auto", none).long).toContain("Noch kein Verarbeiter");
    expect(processorStatus("auto", { ...none, ai: true }).long).toContain("Deine eigene KI");
  });
  it("names several other processors that are set up (#47)", () => {
    const l = processorStatus("ai", { claude: true, github: true, ai: false }).long;
    expect(l).toContain("Claude und GitHub-Action sind eingerichtet und lassen sich stattdessen");
    expect(processorStatus("github", { claude: true, github: false, ai: false }).long).toContain(
      "Claude ist eingerichtet und lässt sich",
    );
    setLanguage("en");
    expect(processorStatus("ai", { claude: true, github: false, ai: false }).long).toBe(
      "Your own AI cannot read social media posts. That needs Claude or the GitHub Action. Own AI is chosen but not fully set up. Claude is set up and can be chosen instead under Settings → Better Cooking → Processor.",
    );
  });
  it("explains missing recipe data (#47)", () => {
    const none = { claude: false, github: false, ai: false };
    expect(noRecipeDataMessage("none", none)).toContain("Ohne KI");
    expect(noRecipeDataMessage("auto", none)).toContain("Dafür braucht es einen Verarbeiter");
    expect(noRecipeDataMessage("ai", { ...none, claude: true })).toContain("nicht vollständig eingerichtet");
    expect(noRecipeDataMessage("ai", { ...none, ai: true })).toContain("Dafür braucht es");
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
  describe("settleJobs", () => {
    const now = 100_000_000;
    const job = (id: string, device?: string, since = now - 60_000): Job => ({
      id,
      input: "x",
      kind: "webseite",
      since,
      processor: "claude",
      device,
    });
    const settle = (jobs: Job[], device: string | null, at = now) => {
      const recipes = jobs.map((j) => ({ path: `${j.id}.md`, job: j.id, modified: at }));
      return settleJobs(jobs, checkJobs(jobs, recipes, keyOf, at), device, at);
    };
    it("the starter closes and announces", () => {
      const r = settle([job("a", "pc")], "pc");
      expect(r.pending).toEqual([]);
      expect(r.announce.map((x) => x.job.id)).toEqual(["a"]);
    });
    it("another device leaves a finished job of someone else alone", () => {
      const r = settle([job("a", "pc"), job("b", "phone")], "phone");
      expect(r.pending.map((j) => j.id)).toEqual(["a"]);
      expect(r.announce.map((x) => x.job.id)).toEqual(["b"]);
    });
    it("a job without device and a device without ID: close and announce", () => {
      expect(settle([job("a")], "pc").announce).toHaveLength(1);
      expect(settle([job("a", "pc")], null).announce).toHaveLength(1);
      expect(settle([job("a", "pc")], null).pending).toEqual([]);
    });
    it("a foreign job past its limit and a day is removed silently by any device", () => {
      const old = now - 20 * 60_000 - FOREIGN_KEEP_MS - 1;
      const r = settle([job("a", "pc", old)], "phone");
      expect(r.pending).toEqual([]);
      expect(r.announce).toEqual([]);
    });
    it("non-starter reconciles first, the starter still announces afterwards", () => {
      const jobs = [job("a", "pc")];
      const phone = settle(jobs, "phone");
      expect(phone.announce).toEqual([]);
      const pc = settle(phone.pending, "pc");
      expect(pc.announce.map((x) => x.job.id)).toEqual(["a"]);
      expect(pc.pending).toEqual([]);
    });
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

describe("retryGuard", () => {
  const now = 1_000_000_000;
  it("a failed job at once, a running one after 2 minutes and then with a question", () => {
    expect(retryGuard({ since: now - 10_000, error: "x" }, now)).toBe("free");
    expect(retryGuard({ since: now - 10_000, errorKey: "noRecipeArrived" }, now)).toBe("free");
    expect(retryGuard({ since: now - 119_000 }, now)).toBe("wait");
    expect(retryGuard({ since: now - 120_000 }, now)).toBe("confirm");
    expect(retryGuard({ since: now - 20 * 60_000 }, now)).toBe("confirm");
  });
});

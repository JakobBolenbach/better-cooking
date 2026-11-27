// The review path of improvement proposals (ADR 0007): what the dialog shows and does, who may apply, and when.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("./stubs/obsidianFake"));
vi.mock("../src/notice", () => import("./stubs/obsidianFake"));

import { notices } from "./stubs/obsidianFake";
import { parseRecipe } from "../src/parse";
import { recipeNote } from "../src/recipeNote";
import { setLanguage } from "../src/i18n";
import { DEFAULT_FORMAT } from "../src/noteFormat";
import { COVER, NOTE, PROPOSAL, TIMELINE, backups, first, firstVersion, job, proposalText, setup } from "./improveFake";

const MIN = 60_000;

beforeEach(() => {
  notices.length = 0;
  setLanguage("de");
  vi.stubGlobal("window", { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const view = (text: string) => ({ ...parseRecipe(NOTE, text), imageSrcs: [] });
/** A proposal with exactly the parts of the first version: only the import state differs. */
const sameParts = () =>
  recipeNote(first, { today: "2026-11-28", format: DEFAULT_FORMAT })
    .replace(/import: \w+/, "import: fertig")
    .replace("typ: rezept", "typ: rezept\nauftrag: rz-m1-0001");

describe("a proposal that changes nothing but the import state", () => {
  it("is shown as one change, 'import state', on another device, and applying it writes the state", async () => {
    const before = firstVersion();
    const s = setup({ [NOTE]: before, [PROPOSAL]: sameParts() }, [job({ device: "d2" })]);
    await s.service.handle(PROPOSAL);
    const pre = await s.service.preview(NOTE);
    expect(pre).toMatchObject({ ok: true, via: "proposal", changes: [{ part: "state" }] });
    const done = await s.service.apply(NOTE, []);
    expect(done.ok).toBe(true);
    expect(parseRecipe("x", s.text(NOTE)).importState).toBe("fertig");
    expect(s.store.has(PROPOSAL)).toBe(false);
  });

  it("is applied at once on the starting device", async () => {
    const s = setup({ [NOTE]: firstVersion(), [PROPOSAL]: sameParts() });
    await s.service.handle(PROPOSAL);
    expect(parseRecipe("x", s.text(NOTE)).importState).toBe("fertig");
    expect(s.plugin.settings.jobs).toEqual([]);
  });

  it("lists a missing timeline graphic as a change of its own", async () => {
    const s = setup({ [NOTE]: firstVersion(), [PROPOSAL]: sameParts(), [TIMELINE]: "<svg/>" }, [job({ device: "d2" })]);
    await s.service.handle(PROPOSAL);
    const pre = await s.service.preview(NOTE);
    expect(pre.ok && pre.changes.map((c) => c.part).sort()).toEqual(["state", "timeline"]);
  });
});

describe("Discard in the review dialog", () => {
  it("deletes the proposal with its images, closes the job and leaves the note alone", async () => {
    const before = firstVersion();
    const s = setup({ [NOTE]: before, [PROPOSAL]: proposalText(), [COVER]: "i", [TIMELINE]: "<svg/>" }, [
      job({ device: "d2" }),
    ]);
    await s.service.handle(PROPOSAL);
    expect(await s.service.discard(NOTE)).toMatchObject({ ok: true });
    expect(s.text(NOTE)).toBe(before);
    expect([...s.store.keys()]).toEqual([NOTE]);
    expect(s.plugin.settings.jobs).toEqual([]);
    expect(backups(s)).toEqual([]);
    expect(s.service.mark([view(before)])[0].improvement).toBeUndefined();
    expect(await s.service.discard(NOTE)).toMatchObject({ ok: false });
  });
});

describe("a note without a fingerprint it can read", () => {
  const withoutHash = () => firstVersion().replace(/^import_hash:.*\n/m, "");
  it.each([
    ["none", withoutHash],
    ["one of another version", () => firstVersion().replace(/^import_hash:.*$/m, 'import_hash: "v9;title:abc"')],
    ["a broken one", () => firstVersion().replace(/^import_hash:.*$/m, 'import_hash: "kaputt"')],
  ])("always asks first, even on the starting device (%s)", async (_name, text) => {
    const before = text();
    const s = setup({ [NOTE]: before, [PROPOSAL]: proposalText() });
    await s.service.handle(PROPOSAL);
    expect(s.text(NOTE)).toBe(before);
    expect(s.store.has(PROPOSAL)).toBe(true);
    expect(s.service.mark([view(before)])[0].improvement).toBe("ready");
  });

  it("shows the changes and writes only after the user applies", async () => {
    const s = setup({ [NOTE]: withoutHash(), [PROPOSAL]: proposalText() });
    await s.service.handle(PROPOSAL);
    expect((await s.service.apply(NOTE, [])).ok).toBe(true);
    expect(parseRecipe("x", s.text(NOTE)).title).toBe("Rote Linsensuppe");
  });
});

describe("the job after a dialog apply", () => {
  it("is closed on every device, whoever started it", async () => {
    const other = job({ id: "rz-m1-0009" });
    const s = setup({ [NOTE]: firstVersion(), [PROPOSAL]: proposalText() }, [job({ device: "d2" }), other]);
    await s.service.handle(PROPOSAL);
    expect(s.plugin.settings.jobs).toHaveLength(2);
    await s.service.apply(NOTE, []);
    expect(s.plugin.settings.jobs).toEqual([other]);
  });

  it("is closed when there was nothing to write", async () => {
    const same = firstVersion().replace("import: offen", "import: fertig");
    const s = setup({ [NOTE]: same, [PROPOSAL]: sameParts() }, [job({ device: "d2" })]);
    await s.service.handle(PROPOSAL);
    await s.service.handle(PROPOSAL);
    const r = await s.service.apply(NOTE, []);
    expect(r.ok).toBe(true);
    expect(s.plugin.settings.jobs).toEqual([]);
    expect(s.store.has(PROPOSAL)).toBe(false);
  });
});

describe("another device gives the starting device time", () => {
  it("shows only a hint for ten minutes, then the banner", async () => {
    const before = firstVersion();
    const s = setup({ [NOTE]: before, [PROPOSAL]: proposalText() }, [job({ device: "d2" })]);
    await s.service.handle(PROPOSAL);
    expect(s.service.mark([view(before)])[0].improvement).toBe("waiting");
    vi.setSystemTime(Date.now() + 9 * MIN);
    expect(s.service.mark([view(before)])[0].improvement).toBe("waiting");
    vi.setSystemTime(Date.now() + 2 * MIN);
    expect(s.service.mark([view(before)])[0].improvement).toBe("ready");
  });

  it("shows the banner at once when the job is no longer known, failed or dropped", async () => {
    for (const jobs of [[], [job({ device: "d2", errorKey: "noImprovementArrived" as const })]]) {
      const before = firstVersion();
      const s = setup({ [NOTE]: before, [PROPOSAL]: proposalText() }, jobs);
      await s.service.handle(PROPOSAL);
      expect(s.service.mark([view(before)])[0].improvement).toBe("ready");
    }
  });

  it("does not wait on the device that started the job: the banner is for it when it must ask", async () => {
    const before = firstVersion().replace("- 1 Zwiebel", "- 2 Zwiebeln");
    const s = setup({ [NOTE]: before, [PROPOSAL]: proposalText() });
    await s.service.handle(PROPOSAL);
    expect(s.service.mark([view(before)])[0].improvement).toBe("ready");
  });
});

describe("a job that is not an improvement job", () => {
  it("never applies on its own: the user is asked", async () => {
    const before = firstVersion();
    const s = setup({ [NOTE]: before, [PROPOSAL]: proposalText() }, [job({ improve: undefined })]);
    await s.service.handle(PROPOSAL);
    expect(s.text(NOTE)).toBe(before);
    expect(s.service.mark([view(before)])[0].improvement).toBe("ready");
  });
});

describe("the dialog shows the proposal's texts", () => {
  it("gives the new text of every changed part, as plain text", async () => {
    const s = setup(
      {
        [NOTE]: firstVersion().replace("- 1 Zwiebel", "- 2 Zwiebeln"),
        [PROPOSAL]: proposalText().replace("1 l Brühe", "1 l Brühe <% tp.x %>"),
      },
      [job({ device: "d2" })],
    );
    await s.service.handle(PROPOSAL);
    const pre = await s.service.preview(NOTE);
    if (!pre.ok) throw new Error("preview");
    expect(pre.details?.ingredients).toContain("250 g rote Linsen");
    expect(pre.details?.steps).toContain("Zwiebel glasig dünsten.");
    expect(pre.details?.title).toBe("Rote Linsensuppe");
    // Defused like what would be written; the state has no text.
    expect(pre.details?.ingredients).not.toContain("<%");
    expect(pre.details).not.toHaveProperty("state");
  });
});

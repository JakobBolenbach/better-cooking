// A proposal that waits for another device (#156): the timers (stop, events), the end state, and the target scenario:
// the job is unknown here and its note (`offen` with the job ID) arrives after the proposal waited on a card.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("./stubs/obsidianFake"));
vi.mock("../src/notice", () => import("./stubs/obsidianFake"));

import { notices } from "./stubs/obsidianFake";
import { parseRecipe } from "../src/parse";
import { setLanguage } from "../src/i18n";
import { DEFAULTS } from "../src/settings";
import { applyExternal } from "../src/settingsMerge";
import { NOTE, PROPOSAL, firstVersion, job, proposalText, setup } from "./improveFake";

const MIN = 60_000;
/** Timers as the service sets them: callback, delay, cleared or not; `run` fires all that are still set. */
let timers: { fn: () => void; ms: number; live: boolean }[] = [];
const cleared = vi.fn();
const run = async () => {
  const now = timers.filter((t) => t.live);
  for (const t of now) {
    t.live = false;
    t.fn();
  }
  await vi.waitFor(() => undefined);
  await new Promise((r) => setImmediate(r));
};

beforeEach(() => {
  notices.length = 0;
  timers = [];
  cleared.mockClear();
  setLanguage("de");
  vi.stubGlobal("window", {
    setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms, live: true }) - 1,
    clearTimeout: (id: number) => {
      cleared(id);
      if (timers[id]) timers[id].live = false;
    },
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const later = (min: number) => vi.setSystemTime(Date.now() + min * MIN);
const withSource = () => proposalText().replace(/^quelle:.*$/m, "quelle: https://example.org/r");
const sameSource = () =>
  firstVersion().replace("auftrag: rz-m1-0001", "auftrag: rz-alt-0000").replace("offen", "fertig");
const view = (text: string) => ({ ...parseRecipe(NOTE, text), imageSrcs: [] });

describe("the timers of the service", () => {
  it("a waiting card looks at the proposal again at least every ten minutes, an unexpected one sets no timer", async () => {
    const s = setup({ [PROPOSAL]: withSource(), [NOTE]: sameSource() }, []);
    await s.service.handle(PROPOSAL);
    later(3);
    timers = [];
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toMatchObject([{ kind: "waiting" }]);
    expect(timers.filter((t) => t.live).map((t) => t.ms)).toEqual([10 * MIN]);
    later(24 * 60);
    timers = [];
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toMatchObject([{ kind: "unexpected" }]);
    expect(timers.filter((t) => t.live)).toEqual([]);
  });

  it("a note event looks at the unexpected card again: path and delay, and the note with the job ID ends the card", async () => {
    const s = setup({ [PROPOSAL]: withSource(), [NOTE]: sameSource() }, []);
    s.service.start();
    await s.service.handle(PROPOSAL);
    later(25 * 60);
    await s.service.handle(PROPOSAL);
    timers = [];
    s.store.set(NOTE, firstVersion());
    s.fire("mc:changed", s.file(NOTE));
    const set = timers.filter((t) => t.live);
    expect(set.map((t) => t.ms)).toEqual([3000]);
    await run();
    // The timer dealt with this very proposal: the card is gone, the note is its target.
    expect(s.service.orphanList()).toEqual([]);
    expect(s.service.mark([view(firstVersion())])[0].improvement).toBe("waiting");
  });

  it("stop() clears every timer and nothing is scheduled or dealt with afterwards", async () => {
    const s = setup({ [PROPOSAL]: withSource() }, []);
    s.service.start();
    s.fire("create", { path: PROPOSAL });
    await s.service.handle(PROPOSAL);
    later(3);
    await s.service.handle(PROPOSAL);
    const live = timers.filter((t) => t.live).length;
    expect(live).toBeGreaterThan(0);
    s.service.stop();
    expect(timers.filter((t) => t.live)).toEqual([]);
    expect(cleared).toHaveBeenCalled();
    s.fire("create", { path: PROPOSAL });
    s.fire("mc:changed", s.file(PROPOSAL));
    expect(timers.filter((t) => t.live)).toEqual([]);
    // A callback that fires after stop() does nothing.
    const before = s.service.orphanList().length;
    s.store.delete(PROPOSAL);
    for (const t of timers) t.fn();
    await new Promise((r) => setImmediate(r));
    expect(s.service.orphanList()).toHaveLength(before);
  });
});

describe("stop() during a proposal's handling", () => {
  it("writes nothing after the service was stopped while it read", async () => {
    const s = setup({ [PROPOSAL]: proposalText(), [NOTE]: firstVersion() });
    const read = s.plugin.app.vault.read;
    let reads = 0;
    // The first read is the proposal's; the service is stopped while the plan reads the note.
    s.plugin.app.vault.read = async (f) => {
      if (++reads === 2) s.service.stop();
      return read(f);
    };
    await s.service.handle(PROPOSAL);
    expect(s.text(NOTE)).toBe(firstVersion());
    expect(s.store.has(PROPOSAL)).toBe(true);
  });
});

describe("the note arrives after the proposal waited on a card, and the job is unknown here", () => {
  const onCard = async (s: ReturnType<typeof setup>) => {
    await s.service.handle(PROPOSAL);
    later(25 * 60);
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toMatchObject([{ kind: "orphan" }]);
  };

  it("is treated like another device's job: only a hint for ten minutes from the note's arrival, then the review", async () => {
    const s = setup({ [PROPOSAL]: proposalText() }, []);
    await onCard(s);
    s.store.set(NOTE, firstVersion());
    await s.service.handle(PROPOSAL);
    expect(s.service.mark([view(firstVersion())])[0].improvement).toBe("waiting");
    expect(s.plugin.settings.jobs).toEqual([]);
    later(9);
    await s.service.handle(PROPOSAL);
    expect(s.service.mark([view(firstVersion())])[0].improvement).toBe("waiting");
    later(2);
    await s.service.handle(PROPOSAL);
    expect(s.service.mark([view(firstVersion())])[0].improvement).toBe("ready");
    expect(s.plugin.settings.jobs).toMatchObject([{ id: "rz-m1-0001", review: { proposal: PROPOSAL, target: NOTE } }]);
  });

  it("the job of the starting device arrives by merge3 (data.json): it is applied on that device, not shown", async () => {
    const s = setup({ [PROPOSAL]: proposalText() }, []);
    await onCard(s);
    s.store.set(NOTE, firstVersion());
    await s.service.handle(PROPOSAL);
    expect(s.service.mark([view(firstVersion())])[0].improvement).toBe("waiting");
    const raw = { ...DEFAULTS, jobs: [job({ device: "d1" })] };
    const merged = applyExternal({ ...DEFAULTS }, { ...DEFAULTS, jobs: s.plugin.settings.jobs }, raw);
    s.plugin.settings.jobs = merged!.settings.jobs;
    s.service.jobsChanged();
    expect(timers.some((t) => t.live)).toBe(true);
    await s.service.handle(PROPOSAL);
    expect(parseRecipe("x", s.text(NOTE)).title).toBe("Rote Linsensuppe");
    expect(s.store.has(PROPOSAL)).toBe(false);
    expect(s.plugin.settings.jobs).toEqual([]);
  });

  it("the job of another device arrives by merge3: its device still has ten minutes from the note's arrival", async () => {
    const s = setup({ [PROPOSAL]: proposalText() }, []);
    await onCard(s);
    s.store.set(NOTE, firstVersion());
    await s.service.handle(PROPOSAL);
    const raw = { ...DEFAULTS, jobs: [job({ device: "d2" })] };
    const merged = applyExternal({ ...DEFAULTS }, { ...DEFAULTS, jobs: [] }, raw);
    s.plugin.settings.jobs = merged!.settings.jobs;
    s.service.jobsChanged();
    await s.service.handle(PROPOSAL);
    expect(s.service.mark([view(firstVersion())])[0].improvement).toBe("waiting");
    expect(s.text(NOTE)).toBe(firstVersion());
    later(11);
    await s.service.handle(PROPOSAL);
    expect(s.service.mark([view(firstVersion())])[0].improvement).toBe("ready");
  });
});

describe("the note arrives during the grace period and the job is unknown here (#156)", () => {
  it("waits ten minutes from its arrival, also after a restart", async () => {
    const s = setup({ [PROPOSAL]: proposalText() }, []);
    await s.service.handle(PROPOSAL);
    later(1);
    s.store.set(NOTE, firstVersion());
    await s.service.handle(PROPOSAL);
    expect(s.service.mark([view(firstVersion())])[0].improvement).toBe("waiting");
    later(9);
    const restarted = s.another();
    await restarted.handle(PROPOSAL);
    expect(restarted.mark([view(firstVersion())])[0].improvement).toBe("waiting");
    later(2);
    await restarted.handle(PROPOSAL);
    expect(restarted.mark([view(firstVersion())])[0].improvement).toBe("ready");
  });
});

describe("an unexpected card", () => {
  it("looks again when the note it links to is deleted, and is an orphan then", async () => {
    const s = setup({ [PROPOSAL]: withSource(), [NOTE]: sameSource() }, []);
    s.service.start();
    await s.service.handle(PROPOSAL);
    later(25 * 60);
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toMatchObject([{ kind: "unexpected" }]);
    timers = [];
    s.store.delete(NOTE);
    s.fire("delete", { path: NOTE });
    expect(timers.filter((t) => t.live).map((t) => t.ms)).toEqual([3000]);
    await run();
    expect(s.service.orphanList()).toMatchObject([{ kind: "orphan" }]);
  });

  it("offers no copy: saving as a new recipe is refused, discarding works and removes the proposal", async () => {
    const s = setup({ [PROPOSAL]: withSource(), [NOTE]: sameSource() }, []);
    await s.service.handle(PROPOSAL);
    later(25 * 60);
    await s.service.handle(PROPOSAL);
    expect(await s.service.orphan(PROPOSAL, "save")).toMatchObject({ ok: false });
    expect(s.store.has(PROPOSAL)).toBe(true);
    expect(await s.service.orphan(PROPOSAL, "discard")).toMatchObject({ ok: true });
    expect(s.store.has(PROPOSAL)).toBe(false);
  });
});

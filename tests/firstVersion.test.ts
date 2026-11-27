// The first version of a social media import (#133, ADR 0007): the note that is written at once, the job that follows
// with the same ID, and what happens when the job request fails.
import { beforeEach, describe, expect, it, vi } from "vitest";

const notices = vi.hoisted(() => ({ texts: [] as string[], actions: [] as { run: () => void }[] }));
vi.mock("../src/notice", () => ({
  noticeWithAction: (_t: string, a?: { run: () => void }) => void (a && notices.actions.push(a)),
}));
vi.mock("obsidian", () => ({
  normalizePath: (p: string) => p,
  requestUrl: vi.fn(),
  Notice: class {
    constructor(text: string) {
      notices.texts.push(text);
    }
    messageEl = { createSpan: () => ({}), createEl: () => ({ addEventListener: () => undefined }) };
    hide() {}
  },
}));

import { saveRecipe } from "../src/localImport";
import { editedParts, storedHashes } from "../src/fingerprint";
import { importSocial } from "../src/socialImport";
import type { Job } from "../src/types";
import { importSocialPost } from "../src/socialStart";
import { DEFAULT_FORMAT, makeNoteFormat } from "../src/noteFormat";
import { parseRecipe, readFrontmatter } from "../src/parse";
import { socialRoute } from "../src/socialFlow";
import { setLanguage } from "../src/i18n";
import { detectSource } from "../src/source";
import type { SchemaRecipe } from "../src/schemaorg";

vi.mock("../src/socialImport", () => ({ importSocial: vi.fn() }));

const partial: SchemaRecipe = { title: "Biskuit", ingredients: ["4 Eier"], steps: [], images: [] };
const ID = "rz-abc-0001";

function vault() {
  const created: [string, string][] = [];
  return {
    created,
    app: {
      vault: {
        getFolderByPath: () => ({ children: [] }),
        getRoot: () => ({ children: [] }),
        getAbstractFileByPath: () => null,
        create: async (path: string, text: string) => void created.push([path, text]),
      },
    },
  };
}

describe("the first version note", () => {
  beforeEach(() => setLanguage("de"));
  it("says offen, carries the job ID and the fingerprint, and has the post as its source", async () => {
    const v = vault();
    await saveRecipe(v.app as never, "R", partial, { source: "https://www.instagram.com/p/ABC123/", job: ID });
    const [path, text] = v.created[0];
    expect(text).toContain("import: offen");
    expect(text).toContain(`auftrag: ${ID}`);
    expect(text).toContain("import_hash:");
    const r = parseRecipe(path, text);
    expect(r).toMatchObject({ importState: "offen", job: ID, source: "https://www.instagram.com/p/ABC123/" });
    expect(r.importError).toBeFalsy();
    expect(editedParts(text, DEFAULT_FORMAT.fields, storedHashes(r))).toEqual([]);
  });
  it("uses the English words in an English note", async () => {
    const v = vault();
    const format = makeNoteFormat("en").format;
    await saveRecipe(v.app as never, "R", partial, { job: ID, format });
    expect(v.created[0][1]).toContain("import: open");
    expect(v.created[0][1]).toContain(`job: ${ID}`);
  });
  it("is a normal note without a job", async () => {
    const v = vault();
    await saveRecipe(v.app as never, "R", partial, {});
    expect(v.created[0][1]).toContain("import: teilweise");
    expect(v.created[0][1]).not.toContain("auftrag");
  });
});

/** A fake plugin: the note of the first version in memory, the job list of data.json, and a job request that works or does not. */
function plugin(sent: { ok: boolean; message?: string }) {
  const note = { text: "" };
  const file = { path: "R/Biskuit.md", stat: { mtime: 1 } };
  const p = {
    app: {
      vault: {
        getFileByPath: (path: string) => (path === "R/Biskuit.md" ? file : null),
        getMarkdownFiles: () => (note.text ? [file] : []),
        cachedRead: async () => note.text,
        process: async (_f: unknown, fn: (t: string) => string) => void (note.text = fn(note.text)),
      },
      loadLocalStorage: () => "dev-1",
      metadataCache: {
        getFileCache: () => (note.text ? { frontmatter: readFrontmatter(note.text).fm } : null),
      },
    },
    lists: { isListNote: () => false },
    noteFormat: () => DEFAULT_FORMAT,
    settings: { folder: "R", readWebsitesLocally: true, jobs: [] as Job[] },
    extraProperties: () => [],
    ai: () => ({}),
    secret: () => null,
    rememberCover: vi.fn(),
    save: vi.fn(async (fresh: { jobs?: Job[] }) => void Object.assign(p.settings, fresh)),
    sendJob: vi.fn(async (_e: unknown, _i: string, _pr: string, _l: unknown, improve?: { id?: string }) => {
      if (sent.ok && improve?.id)
        p.settings.jobs = p.settings.jobs.map((j) => (j.id === improve.id ? { ...j, starting: undefined } : j));
      return sent;
    }),
  };
  return { p, note };
}

const info = (fallback: "claude" | "github" | null, chosen?: true) =>
  ({
    active: fallback,
    route: () => ({ via: "local", ai: false, fallback, ...(chosen ? { chosen } : {}), run: "always" }),
  }) as never;

const e = detectSource("https://www.instagram.com/p/ABC123/");
const format = DEFAULT_FORMAT;

/** What importSocial does with a first version: reserve the job, write the note, answer. */
const firstVersion = async (c: { job?: string; reserve?: (id: string) => Promise<void> }, note: { text: string }) => {
  await c.reserve?.(c.job ?? "");
  const v = vault();
  await saveRecipe(v.app as never, "R", partial, { source: e.url, job: c.job });
  note.text = v.created[0][1];
  return {
    ok: true as const,
    how: "rules" as const,
    saved: { status: "gespeichert" as const, path: "R/Biskuit.md", title: "Biskuit", state: "teilweise" as const },
    firstVersion: true as const,
  };
};

describe("the first version with its job", () => {
  beforeEach(() => {
    setLanguage("de");
    vi.mocked(importSocial).mockReset();
    notices.texts.length = 0;
    notices.actions.length = 0;
  });

  it("reserves the job before the note exists, then sends it with the ID of the note", async () => {
    const { p, note } = plugin({ ok: true });
    let seen: { jobs: string[]; note: string } | undefined;
    vi.mocked(importSocial).mockImplementation(async (c) => {
      await c.reserve?.(c.job ?? "");
      seen = { jobs: p.settings.jobs.map((j) => j.id), note: note.text };
      return firstVersion({ job: c.job }, note);
    });
    const r = await importSocialPost(p as never, e, info("claude"), format, []);
    const id = p.settings.jobs[0].id;
    expect(seen).toEqual({ jobs: [id], note: "" });
    expect(p.sendJob).toHaveBeenCalledWith(e, e.url, "claude", undefined, { id });
    expect(note.text).toContain(`auftrag: ${id}`);
    expect(p.settings.jobs[0]).toMatchObject({ improve: true, processor: "claude", input: e.url });
    expect(r).toEqual({
      done: {
        ok: true,
        message: "Erste Fassung von „Biskuit“ gespeichert. Claude verbessert sie in ein paar Minuten.",
      },
    });
  });

  it("removes the reservation and closes the note as teilweise (what is missing plus the reason) if the request fails", async () => {
    const { p, note } = plugin({ ok: false, message: "Keine Verbindung." });
    vi.mocked(importSocial).mockImplementation((c) => firstVersion(c, note));
    const r = await importSocialPost(p as never, e, info("github"), format, []);
    expect(p.settings.jobs).toEqual([]);
    expect(note.text).toContain("import: teilweise");
    expect(note.text).toContain("Die Verbesserung wurde nicht gestartet: Keine Verbindung.");
    expect(note.text).toContain("Schritte");
    expect(note.text).toContain("auftrag:");
    expect((r as { done: { message: string } }).done.message).toContain("Keine Verbindung.");
  });

  it("does not touch a note that changed its job ID or state meanwhile", async () => {
    const { p, note } = plugin({ ok: false, message: "x" });
    vi.mocked(importSocial).mockImplementation(async (c) => {
      const r = await firstVersion(c, note);
      note.text = note.text.replace(/auftrag: \S+/, "auftrag: rz-other-0001");
      return r;
    });
    await importSocialPost(p as never, e, info("claude"), format, []);
    expect(note.text).toContain("import: offen");
  });

  it("sends no job and gives the ordinary message when no processor is set up", async () => {
    const { p } = plugin({ ok: true });
    vi.mocked(importSocial).mockResolvedValue({
      ok: true,
      how: "rules",
      saved: { status: "gespeichert", path: "R/Biskuit.md", title: "Biskuit", state: "teilweise" },
    });
    const r = await importSocialPost(p as never, e, info(null), format, []);
    expect(vi.mocked(importSocial).mock.calls[0][0].job).toBeUndefined();
    expect(p.sendJob).not.toHaveBeenCalled();
    expect(r).toMatchObject({ done: { ok: true } });
  });

  it("hands over to the processor without a first version when nothing could be read", async () => {
    const { p } = plugin({ ok: true });
    vi.mocked(importSocial).mockResolvedValue({ ok: false, message: "m", detail: "no recipe", why: "noRecipe" });
    expect(await importSocialPost(p as never, e, info("claude"), format, [])).toEqual({
      processor: "claude",
      failure: "no recipe",
    });
    expect(p.sendJob).not.toHaveBeenCalled();
    expect(p.settings.jobs).toEqual([]);
  });

  it("hands a network error to a chosen processor, and shows it with Automatic", async () => {
    const { p } = plugin({ ok: true });
    vi.mocked(importSocial).mockResolvedValue({ ok: false, message: "m", detail: "offline", why: "technical" });
    expect(await importSocialPost(p as never, e, info("claude", true), format, [])).toEqual({
      processor: "claude",
      failure: "offline",
    });
    expect(await importSocialPost(p as never, e, info("claude"), format, [])).toMatchObject({ done: { ok: false } });
  });

  it("answers a failed start as a warning (not green) and offers the retry in a notice", async () => {
    const { p, note } = plugin({ ok: false, message: "Keine Verbindung." });
    vi.mocked(importSocial).mockImplementation((c) => firstVersion(c, note));
    const r = await importSocialPost(p as never, e, info("claude"), format, []);
    expect(r).toMatchObject({ done: { ok: true, warning: true } });
    expect(notices.actions).toHaveLength(1);
  });

  it("an exception after the reservation removes it and closes the note that was written", async () => {
    const { p, note } = plugin({ ok: true });
    vi.mocked(importSocial).mockImplementation(async (c) => {
      await firstVersion(c, note);
      throw new Error("disk full");
    });
    await expect(importSocialPost(p as never, e, info("claude"), format, [])).rejects.toThrow("disk full");
    expect(p.settings.jobs).toEqual([]);
    expect(note.text).toContain("import: teilweise");
    expect(note.text).toContain("disk full");
  });

  it("an exception before the note was written only removes the reservation", async () => {
    const { p, note } = plugin({ ok: true });
    vi.mocked(importSocial).mockImplementation(async (c) => {
      await c.reserve?.(c.job ?? "");
      throw new Error("no folder");
    });
    await expect(importSocialPost(p as never, e, info("claude"), format, [])).rejects.toThrow("no folder");
    expect(p.settings.jobs).toEqual([]);
    expect(note.text).toBe("");
  });
});

describe("Retry after a failed start", () => {
  beforeEach(() => {
    setLanguage("de");
    vi.mocked(importSocial).mockReset();
    notices.texts.length = 0;
    notices.actions.length = 0;
  });
  const failFirst = async () => {
    const t = plugin({ ok: false, message: "offline" });
    vi.mocked(importSocial).mockImplementation((c) => firstVersion(c, t.note));
    await importSocialPost(t.p as never, e, info("claude"), format, []);
    return t;
  };

  it("starts a new run with a new job ID that the note carries, and says 'offen' again", async () => {
    const { p, note } = await failFirst();
    const oldId = /auftrag: (\S+)/.exec(note.text)?.[1];
    p.sendJob.mockImplementation(async () => ({ ok: true }));
    notices.actions[0].run();
    await vi.waitFor(() => expect(p.sendJob).toHaveBeenCalledTimes(2));
    const newId = /auftrag: (\S+)/.exec(note.text)?.[1];
    expect(newId).not.toBe(oldId);
    expect(p.sendJob.mock.calls[1][4]).toEqual({ id: newId });
    expect(note.text).toContain("import: offen");
    expect(p.settings.jobs.map((j) => j.id)).toEqual([newId]);
  });

  it("sends nothing if the note was changed meanwhile, and says so", async () => {
    const { p, note } = await failFirst();
    note.text = note.text.replace(/auftrag: \S+/, "auftrag: rz-other-0001");
    notices.actions[0].run();
    await vi.waitFor(() => expect(notices.texts.some((t) => t.includes("nichts neu gestartet"))).toBe(true));
    expect(p.sendJob).toHaveBeenCalledTimes(1);
    expect(p.settings.jobs).toEqual([]);
  });

  it("says so when the retry itself throws", async () => {
    const { p } = await failFirst();
    p.save.mockRejectedValue(new Error("boom"));
    notices.actions[0].run();
    await vi.waitFor(() => expect(notices.texts).toContain("Neuer Versuch gescheitert."));
  });
});

describe("the setting 'instant first version' off", () => {
  const off = (chosen: "claude" | "auto", ready = { claude: true, github: false, ai: false }) =>
    ({
      active: "claude",
      route: (k: Parameters<typeof socialRoute>[0]) => socialRoute(k, chosen, ready, false),
    }) as never;
  beforeEach(() => vi.mocked(importSocial).mockReset());

  it("hands a chosen processor the link without any reading by the plugin", async () => {
    const { p } = plugin({ ok: true });
    expect(await importSocialPost(p as never, e, off("claude"), format, [])).toEqual({ processor: "claude" });
    expect(importSocial).not.toHaveBeenCalled();
  });
  it("hands Facebook to the chosen processor, and with Automatic and none set up asks to paste the text", async () => {
    const { p } = plugin({ ok: true });
    const fb = detectSource("https://www.facebook.com/reel/123456789");
    expect(await importSocialPost(p as never, fb, off("claude"), format, [])).toEqual({ processor: "claude" });
    const none = off("auto", { claude: false, github: false, ai: false });
    expect(await importSocialPost(p as never, fb, none, format, [])).toMatchObject({ done: { ok: false } });
  });
  it("reads the post with Automatic but starts no first version and no job", async () => {
    const { p } = plugin({ ok: true });
    vi.mocked(importSocial).mockResolvedValue({
      ok: true,
      how: "rules",
      saved: { status: "gespeichert", path: "R/Biskuit.md", title: "Biskuit", state: "fertig" },
    });
    await importSocialPost(p as never, e, off("auto"), format, []);
    const ctx = vi.mocked(importSocial).mock.calls[0][0];
    expect(ctx).toMatchObject({ fallback: true, job: undefined });
    expect(ctx.run).toBeUndefined();
    expect(p.sendJob).not.toHaveBeenCalled();
  });
});

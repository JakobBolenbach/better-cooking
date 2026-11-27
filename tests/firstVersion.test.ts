// The first version of a social media import (#133, ADR 0007): the note that is written at once, the job that follows
// with the same ID, and what happens when the job request fails.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({ normalizePath: (p: string) => p, requestUrl: vi.fn() }));

import { saveRecipe } from "../src/localImport";
import { editedParts, storedHashes } from "../src/fingerprint";
import { importSocial } from "../src/socialImport";
import { importSocialPost } from "../src/socialStart";
import { DEFAULT_FORMAT, makeNoteFormat } from "../src/noteFormat";
import { parseRecipe } from "../src/parse";
import { setLanguage } from "../src/i18n";
import { detectSource } from "../src/source";
import type { SchemaRecipe } from "../src/schemaorg";
import type { SocialResult } from "../src/socialImport";

vi.mock("../src/socialImport", () => ({ importSocial: vi.fn() }));

const partial: SchemaRecipe = { title: "Biskuit", ingredients: ["4 Eier"], steps: [], images: [] };
const ID = "rz-abc-0001";

function vault() {
  const created: [string, string][] = [];
  return {
    created,
    app: {
      vault: {
        getFolderByPath: () => ({}),
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

/** A fake plugin: the note of the first version in memory, and a job request that works or does not. */
function plugin(sent: { ok: boolean; message?: string }) {
  const note = { text: "" };
  const file = {};
  const p = {
    app: {
      vault: {
        getFileByPath: (path: string) => (path === "R/Biskuit.md" ? file : null),
        cachedRead: async () => note.text,
        process: async (_f: unknown, fn: (t: string) => string) => void (note.text = fn(note.text)),
      },
    },
    settings: { folder: "R", readWebsitesLocally: true },
    extraProperties: () => [],
    ai: () => ({}),
    secret: () => null,
    rememberCover: vi.fn(),
    improve: { starting: new Set<string>() },
    sendJob: vi.fn(async () => {
      expect([...p.improve.starting]).toHaveLength(1);
      return sent;
    }),
  };
  return { p, note };
}

const info = (fallback: "claude" | "github" | null, chosen?: true) =>
  ({
    active: fallback,
    route: () => ({ via: "local", ai: false, fallback, ...(chosen ? { chosen } : {}) }),
  }) as never;

const e = detectSource("https://www.instagram.com/p/ABC123/");
const format = DEFAULT_FORMAT;

const firstVersion = async (ctx: { job?: string }): Promise<SocialResult> => {
  const v = vault();
  await saveRecipe(v.app as never, "R", partial, { source: e.url, job: ctx.job });
  return {
    ok: true,
    how: "rules",
    saved: { status: "gespeichert", path: "R/Biskuit.md", title: "Biskuit", state: "teilweise" },
    firstVersion: true,
  };
};

describe("the first version with its job", () => {
  beforeEach(() => {
    setLanguage("de");
    vi.mocked(importSocial).mockReset();
  });

  it("starts the improvement job with the ID of the note and says so", async () => {
    const { p } = plugin({ ok: true });
    let jobId = "";
    vi.mocked(importSocial).mockImplementation(async (c) => {
      jobId = c.job ?? "";
      return firstVersion(c);
    });
    const r = await importSocialPost(p as never, e, info("claude"), format, []);
    expect(jobId).toMatch(/^rz-/);
    expect(p.sendJob).toHaveBeenCalledWith(e, e.url, "claude", undefined, { id: jobId });
    expect(r).toEqual({
      done: {
        ok: true,
        message: "Erste Fassung von „Biskuit“ gespeichert. Claude verbessert sie in ein paar Minuten.",
      },
    });
    expect(p.improve.starting.size).toBe(0);
  });

  it("closes the note as teilweise with the reason if the job request fails", async () => {
    const { p, note } = plugin({ ok: false, message: "Keine Verbindung." });
    vi.mocked(importSocial).mockImplementation(async (c) => {
      const v = vault();
      await saveRecipe(v.app as never, "R", partial, { source: e.url, job: c.job });
      note.text = v.created[0][1];
      return firstVersion(c);
    });
    const r = await importSocialPost(p as never, e, info("github"), format, []);
    expect(note.text).toContain("import: teilweise");
    expect(note.text).toContain("Die Verbesserung wurde nicht gestartet: Keine Verbindung.");
    expect(r).toMatchObject({ done: { ok: true } });
    expect((r as { done: { message: string } }).done.message).toContain("Keine Verbindung.");
  });

  it("does not touch a note that changed its job ID or state meanwhile", async () => {
    const { p, note } = plugin({ ok: false, message: "x" });
    vi.mocked(importSocial).mockImplementation(async (c) => {
      const v = vault();
      await saveRecipe(v.app as never, "R", partial, { source: e.url, job: "rz-other-0001" });
      note.text = v.created[0][1];
      return firstVersion(c);
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
    vi.mocked(importSocial).mockResolvedValue({
      ok: false,
      message: "m",
      detail: "no recipe",
      why: "noRecipe",
    });
    expect(await importSocialPost(p as never, e, info("claude"), format, [])).toEqual({
      processor: "claude",
      failure: "no recipe",
    });
    expect(p.sendJob).not.toHaveBeenCalled();
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
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const notices: string[] = [];
vi.mock("obsidian", () => {
  class TFile {
    stat = { mtime: 1 };
    constructor(public path: string) {}
  }
  class Notice {
    constructor(text: string) {
      notices.push(text);
    }
  }
  return { TFile, Notice };
});

import { TFile } from "obsidian";
import { removeFailedJob, removeFailureNote, trashFailureNote } from "../src/failureService";
import { setLanguage } from "../src/i18n";
import { DEFAULT_FORMAT } from "../src/noteFormat";
import type { Job } from "../src/types";

const FAIL = "---\nimport: fehler\nimport_fehler: kein Rezept\nauftrag: rz-1\n---\n# Import gescheitert\n";
const RECIPE = "---\nimport: fehler\nauftrag: rz-1\n---\n# Brot\n\n## Zutaten\n\n- 500 g Mehl\n";

/** A plugin with just the vault the service touches. `broken` paths fail when read. */
function fake(files: Record<string, string>, jobs: Job[], broken: string[] = []) {
  const trashed: string[] = [];
  const tfiles = new Map(Object.keys(files).map((p) => [p, new (TFile as unknown as new (p: string) => TFile)(p)]));
  const plugin = {
    settings: { folder: "Rezepte", jobs },
    save: async (s: { jobs: Job[] }) => void (plugin.settings.jobs = s.jobs),
    lists: { isListNote: () => false },
    noteFormat: () => DEFAULT_FORMAT,
    app: {
      vault: {
        getAbstractFileByPath: (p: string) => tfiles.get(p) ?? null,
        read: async (f: { path: string }) => {
          if (broken.includes(f.path)) throw new Error("disk");
          return files[f.path];
        },
        getMarkdownFiles: () => [...tfiles.values()],
      },
      metadataCache: {
        getFileCache: (f: { path: string }) => {
          const m =
            /import: (\w+)\nimport_fehler.*\nauftrag: (\S+)/.exec(files[f.path]) ??
            /import: (\w+)\nauftrag: (\S+)/.exec(files[f.path]);
          return m ? { frontmatter: { import: m[1], auftrag: m[2] } } : {};
        },
      },
      fileManager: { trashFile: async (f: { path: string }) => void trashed.push(f.path) },
    },
  };
  return { plugin: plugin as never, trashed, settings: plugin.settings };
}

const job = (o: Partial<Job> = {}): Job => ({
  id: "rz-1",
  input: "x",
  kind: "text",
  since: 1,
  processor: "claude",
  failedNote: "Rezepte/Import gescheitert rz-1.md",
  ...o,
});

describe("failureService", () => {
  beforeEach(() => {
    setLanguage("de");
    notices.length = 0;
  });

  it("trashes a failure note for its job and nothing else", async () => {
    const f = fake({ "Rezepte/a.md": FAIL, "Rezepte/b.md": RECIPE, "Rezepte/c.md": FAIL, "Other/d.md": FAIL }, []);
    expect(await trashFailureNote(f.plugin, "Rezepte/a.md", "rz-1")).toBe("trashed");
    expect(await trashFailureNote(f.plugin, "Rezepte/b.md", "rz-1")).toBe("kept");
    expect(await trashFailureNote(f.plugin, "Rezepte/c.md", "rz-other")).toBe("kept");
    expect(await trashFailureNote(f.plugin, "Other/d.md", "rz-1")).toBe("kept");
    expect(await trashFailureNote(f.plugin, "Rezepte/none.md", "rz-1")).toBe("gone");
    expect(f.trashed).toEqual(["Rezepte/a.md"]);
  });

  it("an unreadable note is an error, not a deletion", async () => {
    const f = fake({ "Rezepte/a.md": FAIL }, [], ["Rezepte/a.md"]);
    expect(await trashFailureNote(f.plugin, "Rezepte/a.md", "rz-1")).toBe("error");
    expect(f.trashed).toEqual([]);
  });

  it("Remove: a note that is no failure note stays, a notice says so, and the job is dropped", async () => {
    const f = fake({ "Rezepte/Import gescheitert rz-1.md": RECIPE }, [job()]);
    await removeFailedJob(f.plugin, "rz-1");
    expect(f.trashed).toEqual([]);
    expect(f.settings.jobs).toEqual([]);
    expect(notices).toHaveLength(1);
  });

  it("Remove: a note that could not be read keeps the job", async () => {
    const path = "Rezepte/Import gescheitert rz-1.md";
    const f = fake({ [path]: FAIL }, [job()], [path]);
    await removeFailedJob(f.plugin, "rz-1");
    expect(f.settings.jobs).toHaveLength(1);
    expect(notices).toHaveLength(1);
  });

  it("Remove: deletes the notes of the whole chain, also one found by job ID, then drops the job", async () => {
    const files = {
      "Rezepte/Import gescheitert rz-2.md": FAIL.replace("rz-1", "rz-2"),
      "Rezepte/Import gescheitert rz-1.md": FAIL,
      "Rezepte/renamed.md": FAIL.replace("rz-1", "rz-0"),
    };
    const f = fake(files, [
      job({
        id: "rz-2",
        failedNote: "Rezepte/Import gescheitert rz-2.md",
        retryOf: [{ job: "rz-1", note: "Rezepte/Import gescheitert rz-1.md" }, { job: "rz-0" }],
      }),
    ]);
    await removeFailedJob(f.plugin, "rz-2");
    expect(f.trashed.sort()).toEqual([
      "Rezepte/Import gescheitert rz-1.md",
      "Rezepte/Import gescheitert rz-2.md",
      "Rezepte/renamed.md",
    ]);
    expect(f.settings.jobs).toEqual([]);
  });

  it("Remove without an open job checks the job ID of the note", async () => {
    const f = fake({ "Rezepte/a.md": FAIL }, []);
    await removeFailureNote(f.plugin, "Rezepte/a.md", "rz-9");
    expect(f.trashed).toEqual([]);
    await removeFailureNote(f.plugin, "Rezepte/a.md", "rz-1");
    expect(f.trashed).toEqual(["Rezepte/a.md"]);
  });
});

// What the improvement service listens to (ADR 0007): proposal files in `Verbesserungen/`, and notes of the recipe
// folder. Events are filtered: only proposals, and notes of the recipe folder that appear, are renamed or change their
// `auftrag` or `import` (compared with what was last seen), reach the service; one scan once the layout is ready. Before
// that every file would "arrive". Depends on Obsidian.
import type { TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import { inFolder } from "./folder";
import { isProposalPath } from "./improve";
import { fileAt } from "./improveApply";
import { stubOf } from "./recipeStubs";

/** What the service does with an event. */
export interface Watched {
  schedule: (path: string) => void;
  forget: (path: string) => void;
  notesChanged: (kind: "added" | "changed") => void;
  dropJob: (id: string) => Promise<void>;
}

export function watchVault(p: BetterCookingPlugin, w: Watched) {
  const { app } = p;
  const folder = () => p.settings.folder;
  let ready = false;
  /** `auftrag` and `import` of the notes as last seen. */
  const signatures = new Map<string, string>();
  const proposal = (path: string) => ready && isProposalPath(path, folder());
  const note = (path: string) => ready && inFolder(path, folder()) && !isProposalPath(path, folder());
  const signature = (f: TFile) => {
    const s = stubOf(p, f);
    return `${s.job ?? ""}|${s.importState ?? ""}`;
  };
  const scan = () => {
    for (const f of app.vault.getMarkdownFiles()) if (isProposalPath(f.path, folder())) w.schedule(f.path);
  };
  /** A note was renamed: the review of its job follows it. */
  const renamed = async (from: string, to: string) => {
    const jobs = p.settings.jobs;
    if (jobs.some((j) => j.review?.target === from))
      await p.save({
        jobs: jobs.map((j) => (j.review?.target === from ? { ...j, review: { ...j.review, target: to } } : j)),
      });
  };

  p.registerEvent(
    app.vault.on("create", (f) => {
      if (proposal(f.path)) w.schedule(f.path);
      else if (note(f.path)) w.notesChanged("added");
    }),
  );
  p.registerEvent(app.vault.on("modify", (f) => proposal(f.path) && w.schedule(f.path)));
  p.registerEvent(
    app.vault.on("delete", (f) => {
      // A deleted note may be the one a card links to: cards look again.
      if (note(f.path)) w.notesChanged("added");
      if (!isProposalPath(f.path, folder())) return;
      w.forget(f.path);
      // Deleted elsewhere (applied or discarded on another device): the job that waited for it is done.
      const waited = p.settings.jobs.find((j) => j.review?.proposal === f.path);
      if (waited) void w.dropJob(waited.id);
    }),
  );
  p.registerEvent(
    app.vault.on("rename", (f, old) => {
      if (isProposalPath(old, folder())) w.forget(old);
      if (proposal(f.path)) w.schedule(f.path);
      else if (note(f.path) || note(old)) {
        void renamed(old, f.path);
        w.notesChanged("added");
      }
    }),
  );
  p.registerEvent(
    app.metadataCache.on("changed", (f) => {
      if (!note(f.path)) return;
      const sig = signature(f);
      if (signatures.get(f.path) === sig) return;
      signatures.set(f.path, sig);
      w.notesChanged("changed");
    }),
  );
  app.workspace.onLayoutReady(() => {
    ready = true;
    // A review whose proposal file is gone (applied or discarded elsewhere while this device was off) is done.
    for (const j of p.settings.jobs) if (j.review && !fileAt(p, j.review.proposal)) void w.dropJob(j.id);
    scan();
    // The metadata cache may not know every note yet: look once more when it has resolved.
    const ref = app.metadataCache.on("resolved", () => {
      app.metadataCache.offref(ref);
      scan();
    });
    p.registerEvent(ref);
  });
}

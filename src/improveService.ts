// Improvement proposals inside Obsidian (ADR 0007, rules: src/improve.ts). Watches `<recipe folder>/Verbesserungen/`,
// and for every proposal decides: apply it (the device that started the job, nothing edited by hand changes), ask
// ("Review" banner on the recipe page), show it as "recipe not found", or drop it. A failed improvement leaves the
// first version and only writes the reason. The merge itself is src/improveApply.ts (writeMerged, ADR 0006).
import { Notice, TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import { isRecipeFile } from "./folder";
import {
  improveDecision,
  isProposalPath,
  type Orphan,
  markImproveFailed,
  readProposal,
  schemaFromRecipe,
  targetOf,
  type Proposal,
} from "./improve";
import {
  applyFailed,
  imagesOf,
  mergeProposal,
  planProposal,
  saveProposalAsRecipe,
  trashProposal,
  undoMerge,
} from "./improveApply";
import { failureReason } from "./importFailure";
import { importStateFrom, readField } from "./noteFormat";
import { deviceId } from "./importSyncService";
import { noticeWithAction } from "./notice";
import type { Change, Preview } from "./refetch";
import type { Part } from "./fingerprint";
import { tr } from "./i18n";
import { refetchApi } from "./refetchApi";
import type { ImproveHost } from "./ui/improveBanner";
import type { RecipeView } from "./types";

/** A proposal may reach the vault before its images do (a pull writes files one after the other). */
const IMAGES_WAIT_MS = 60_000;
const SETTLE_MS = 1500;
const RETRY_MS = 5000;
const MAX_CONFLICTS = 3;

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export class ImproveService {
  /** Proposals seen, by path: what `checkJobs` needs to close an improvement job. */
  private seen = new Map<string, { job: string; first: number; recipe: RecipeView }>();
  /** Proposals that wait for a look, by job ID: the path of the proposal file. */
  private review = new Map<string, string>();
  private orphans = new Map<string, Orphan>();
  private timers = new Map<string, number>();
  private busy = new Set<string>();
  private conflicts = new Map<string, number>();
  private ready = false;

  constructor(private plugin: BetterCookingPlugin) {}

  private get app() {
    return this.plugin.app;
  }

  /** Events of the vault and one scan once the layout is ready (before that every file would "arrive"). */
  start() {
    const p = this.plugin;
    const mine = (f: { path: string }) => this.ready && isProposalPath(f.path, p.settings.folder);
    p.registerEvent(this.app.vault.on("create", (f) => mine(f) && this.schedule(f.path)));
    p.registerEvent(this.app.vault.on("modify", (f) => mine(f) && this.schedule(f.path)));
    p.registerEvent(
      this.app.vault.on("delete", (f) => isProposalPath(f.path, p.settings.folder) && this.forget(f.path)),
    );
    p.registerEvent(
      this.app.vault.on("rename", (f, old) => {
        if (isProposalPath(old, p.settings.folder)) this.forget(old);
        if (mine(f)) this.schedule(f.path);
      }),
    );
    this.app.workspace.onLayoutReady(() => {
      this.ready = true;
      this.scan();
      // The metadata cache may not know every note yet: look once more when it has resolved.
      const ref = this.app.metadataCache.on("resolved", () => {
        this.app.metadataCache.offref(ref);
        this.scan();
      });
      p.registerEvent(ref);
    });
  }

  private scan() {
    for (const f of this.app.vault.getMarkdownFiles())
      if (isProposalPath(f.path, this.plugin.settings.folder)) this.schedule(f.path);
  }

  private schedule(path: string, ms = SETTLE_MS) {
    window.clearTimeout(this.timers.get(path));
    this.timers.set(
      path,
      window.setTimeout(() => {
        this.timers.delete(path);
        void this.process(path);
      }, ms),
    );
  }

  private forget(path: string) {
    window.clearTimeout(this.timers.get(path));
    this.timers.delete(path);
    const job = this.seen.get(path)?.job;
    this.seen.delete(path);
    this.orphans.delete(path);
    if (job && this.review.get(job) === path) this.review.delete(job);
    this.changed();
  }

  private changed() {
    this.plugin.settingsViews.refresh(["improve"]);
  }

  /** The proposals seen so far as recipes with their job ID, for `checkJobs` (they close improvement jobs, no one else). */
  proposals(): RecipeView[] {
    return [...this.seen.values()].map((s) => s.recipe);
  }

  /** The recipes with a proposal that waits for a look get the banner on their page. */
  mark(recipes: RecipeView[]): RecipeView[] {
    if (!this.review.size) return recipes;
    return recipes.map((r) => (r.job && this.review.has(r.job) ? { ...r, improvement: true as const } : r));
  }

  /** Proposals without a recipe, for the import area. */
  orphanList(): Orphan[] {
    return [...this.orphans.values()];
  }

  // ------------------------------------------------------------------ One proposal

  /** Notes of the recipe folder with their job ID (frontmatter only, from the metadata cache). */
  private notes(): { path: string; job?: string; importState?: string; file: TFile }[] {
    const { settings, lists } = this.plugin;
    const fields = this.plugin.noteFormat().fields;
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => !lists.isListNote(f.path) && isRecipeFile(f.path, settings.folder))
      .map((file) => {
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
        return {
          path: file.path,
          job: str(readField(fm, fields, "job")),
          importState: importStateFrom(readField(fm, fields, "importState")),
          file,
        };
      });
  }

  private file(path: string): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(path);
    return f instanceof TFile ? f : null;
  }

  private async dropJob(id: string) {
    const jobs = this.plugin.settings.jobs;
    if (jobs.some((j) => j.id === id)) await this.plugin.save({ jobs: jobs.filter((j) => j.id !== id) });
  }

  private async process(path: string) {
    if (this.busy.has(path)) return this.schedule(path);
    this.busy.add(path);
    try {
      await this.handle(path);
    } catch (e) {
      console.error("Better Cooking: could not deal with an improvement", path, e);
    } finally {
      this.busy.delete(path);
    }
  }

  /** Deals with one proposal file (events, the scan, and tests). */
  async handle(path: string) {
    const file = this.file(path);
    if (!file) return this.forget(path);
    const p = this.plugin;
    const read = readProposal(await this.app.vault.read(file), p.noteFormat().fields, path);
    const first = this.seen.get(path)?.first ?? Date.now();
    this.seen.set(path, {
      job: read.job,
      first,
      recipe: { ...read.recipe, job: read.job, importState: read.state, images: [], imageSrcs: [] },
    });
    const job = p.settings.jobs.find((j) => j.id === read.job);
    const thisDevice = deviceId(this.app);
    const mine = !!thisDevice && !!job?.device && job.device === thisDevice;
    const target = targetOf(read.job, this.notes());
    if (job?.dropped || (!target && read.state === "fehler")) {
      // The note was deleted on purpose (or a failed improvement has nothing to report to): nothing to show.
      if (job?.dropped || mine) {
        await trashProposal(p, file, read.job);
        await this.dropJob(read.job);
      }
      return this.forget(path);
    }
    if (read.state === "fehler") return this.failed(file, read, target!.file, mine);
    if (!target) {
      this.orphans.set(path, { path, job: read.job, title: schemaFromRecipe(read.recipe).title });
      return this.changed();
    }
    this.orphans.delete(path);
    const { plan } = await planProposal(p, file, target.file);
    const decision = improveDecision({
      job,
      thisDevice,
      target,
      editedChanged: plan.changes.some((c) => c.part !== "image" && plan.edited.includes(c.part)),
      findings: read.findings,
    });
    if (decision === "apply" && this.waitingForImages(path, read, first)) return;
    if (decision === "apply") return this.autoApply(file, target.file, read);
    this.review.set(read.job, path);
    if (mine) await this.dropJob(read.job);
    this.changed();
  }

  /** The proposal names an image that is not in the vault yet: look again soon, for a minute. */
  private waitingForImages(path: string, read: Proposal, first: number): boolean {
    if (Date.now() - first > IMAGES_WAIT_MS) return false;
    const { cover, timeline } = imagesOf(this.plugin, read.job);
    if ((read.recipe.image && !cover) || (read.recipe.timeline && !timeline)) {
      this.schedule(path, RETRY_MS);
      return true;
    }
    return false;
  }

  private async autoApply(file: TFile, target: TFile, read: Proposal) {
    const r = await mergeProposal(this.plugin, file, target, []);
    if (r.kind === "conflict") {
      const n = (this.conflicts.get(file.path) ?? 0) + 1;
      this.conflicts.set(file.path, n);
      if (n < MAX_CONFLICTS) return this.schedule(file.path, SETTLE_MS * 2);
      // The note keeps changing: leave the decision to the user.
      this.review.set(read.job, file.path);
      await this.dropJob(read.job);
      return this.changed();
    }
    if (r.kind === "allKept") {
      this.review.set(read.job, file.path);
      await this.dropJob(read.job);
      return this.changed();
    }
    await this.dropJob(read.job);
    this.forget(file.path);
    if (r.kind === "written") {
      const text = tr("improved", { title: r.title });
      noticeWithAction(text, { label: tr("undo"), run: () => void this.undo(target, r) }, 10_000);
    }
  }

  private async undo(target: TFile, r: { before: string; after: string }) {
    try {
      new Notice(tr((await undoMerge(this.plugin, target, r)) ? "improvedUndone" : "improvedUndoStale"));
    } catch (e) {
      new Notice(applyFailed(e));
    }
  }

  /**
   * The improvement failed: the first version stays. Only the device that started the job writes the reason into the
   * note (compare-and-set on the job ID and "offen") and tells the user; the proposal is deleted. Others do nothing.
   */
  private async failed(file: TFile, read: Proposal, target: TFile, mine: boolean) {
    if (!mine) return;
    const why = failureReason({ importError: read.error }) ?? tr("improveFailedNoReason");
    const format = this.plugin.noteFormat();
    let written = false;
    await this.app.vault.process(target, (cur) => {
      const next = markImproveFailed(cur, read.job, why, format);
      written = next !== null && next !== cur;
      return next ?? cur;
    });
    await trashProposal(this.plugin, file, read.job);
    await this.dropJob(read.job);
    this.forget(file.path);
    if (written) new Notice(tr("improveFailedNotice", { why }), 8000);
  }

  // ------------------------------------------------------------------ What the recipe page and the import area use

  private proposalOf(targetPath: string): { proposal: TFile; target: TFile } | undefined {
    const target = this.file(targetPath);
    const fields = this.plugin.noteFormat().fields;
    const job = target && str(readField(this.app.metadataCache.getFileCache(target)?.frontmatter ?? {}, fields, "job"));
    const proposal = job ? this.file(this.review.get(job) ?? "") : null;
    return target && proposal ? { proposal, target } : undefined;
  }

  /** What the review dialog shows: the changes the proposal would make, hand edits marked. Writes nothing. */
  async preview(targetPath: string): Promise<Preview> {
    const at = this.proposalOf(targetPath);
    if (!at) return { ok: false, message: tr("improveGone") };
    const { plan, coverNew } = await planProposal(this.plugin, at.proposal, at.target);
    const changes: Change[] = [...plan.changes];
    if (coverNew && !changes.some((c) => c.part === "image")) changes.push({ part: "image" });
    return { ok: true, changes, via: "proposal", edited: plan.edited };
  }

  cancel(_path: string) {
    // Nothing runs in the background of a preview.
  }

  /** Applying from the review dialog: parts edited by hand are replaced only if listed in `replace`. */
  async apply(targetPath: string, replace: Part[]): Promise<{ ok: boolean; message?: string; stale?: boolean }> {
    const at = this.proposalOf(targetPath);
    if (!at) return { ok: false, message: tr("improveGone") };
    try {
      const r = await mergeProposal(this.plugin, at.proposal, at.target, replace);
      if (r.kind === "gone") return { ok: false, message: tr("improveGone") };
      if (r.kind === "conflict") return { ok: false, message: tr("improveChangedMeanwhile"), stale: true };
      if (r.kind === "allKept") return { ok: false, message: tr("refetchAllKept") };
      this.forget(at.proposal.path);
      return {
        ok: true,
        message: r.kind === "written" ? tr("refetched", { title: r.title, backup: r.backup }) : tr("refetchNothing"),
      };
    } catch (e) {
      return { ok: false, message: applyFailed(e) };
    }
  }

  /** What the App gets: the review dialog's calls, the proposals without a recipe, and what to do with them. */
  host(notify: (message: string) => void): ImproveHost {
    return {
      api: refetchApi(this, notify),
      orphans: this.orphanList(),
      onOrphan: async (path, what) => {
        const r = await this.orphan(path, what);
        if (r.message) notify(r.message);
      },
    };
  }

  /** "Save as a new recipe" or "Discard" on a proposal without a recipe. */
  async orphan(path: string, what: "save" | "discard"): Promise<{ ok: boolean; message?: string }> {
    const file = this.file(path);
    const o = this.orphans.get(path);
    if (!file || !o) return { ok: false, message: tr("improveGone") };
    try {
      const message =
        what === "save"
          ? tr("improveOrphanSaved", { title: await saveProposalAsRecipe(this.plugin, file) })
          : (await trashProposal(this.plugin, file, o.job), tr("improveOrphanDiscarded"));
      await this.dropJob(o.job);
      this.forget(path);
      return { ok: true, message };
    } catch (e) {
      return { ok: false, message: applyFailed(e) };
    }
  }
}

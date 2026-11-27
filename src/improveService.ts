// Improvement proposals inside Obsidian (ADR 0007, rules: src/improve.ts). Watches `<recipe folder>/Verbesserungen/`,
// and for every proposal decides: apply it (the device that started the job, nothing edited by hand changes), ask
// ("Review" banner on the recipe page), show it as "recipe not found", or drop it. A failed improvement leaves the
// first version and only writes the reason. The merge itself is src/improveApply.ts (writeMerged, ADR 0006).
// A proposal is only acted on if its file name is a job ID and its `auftrag` is the same; its note is found only for a
// job known as an improvement job or for a note that says "offen". Anything unclear waits (a grace period for notes
// that sync later) and ends as a card in the import area, never as a change.
import { Notice, TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import {
  improveDecision,
  isProposalPath,
  markRecipes,
  markImproveFailed,
  readProposal,
  schemaFromRecipe,
  startedHere,
  type Orphan,
  type Proposal,
} from "./improve";
import { applyFailed, fileAt, imagesOf, mergeProposal, planProposal, trashProposal, undoMerge } from "./improveApply";
import { failureReason } from "./importFailure";
import { deviceId } from "./importSyncService";
import { noticeWithAction } from "./notice";
import { jobFailed } from "./processor";
import { cleanupImages, findTarget, markTimedOut } from "./improveTarget";
import { improveHost } from "./improveHost";
import { applyReview, discardReview, orphanAction, previewProposal, type ReviewHost } from "./improveReview";
import type { Part } from "./fingerprint";
import { tr } from "./i18n";
import type { ImproveHost } from "./ui/improveBanner";
import type { Job, RecipeView } from "./types";

/** A proposal may reach the vault before its images do (a pull writes files one after the other). */
const IMAGES_WAIT_MS = 60_000;
/** A note may reach the vault after its proposal (another device syncs later): no final answer before this. */
const GRACE_MS = 2 * 60_000;
/** The device that started the job needs time to apply a proposal; another device shows it as ready only after this. */
const FOREIGN_WAIT_MS = 10 * 60_000;
const SETTLE_MS = 1500;
const RETRY_MS = 5000;
const LATER_MS = 30_000;
const MAX_CONFLICTS = 3;

interface Seen {
  job: string;
  first: number;
  valid: boolean;
  recipe: RecipeView;
}

export class ImproveService {
  /** Proposals seen, by path: what `checkJobs` needs to close an improvement job. */
  private seen = new Map<string, Seen>();
  /** Proposals that wait for a look, by job ID: the path of the proposal file. */
  private review = new Map<string, string>();
  private orphans = new Map<string, Orphan>();
  /** Proposals without a final answer (no note yet, or an orphan): looked at again when notes change. */
  private unresolved = new Set<string>();
  private timers = new Map<string, number>();
  private busy = new Set<string>();
  private conflicts = new Map<string, number>();
  private ready = false;

  constructor(private plugin: BetterCookingPlugin) {}

  private get app() {
    return this.plugin.app;
  }

  private get folder() {
    return this.plugin.settings.folder;
  }

  /** Events of the vault and one scan once the layout is ready (before that every file would "arrive"). */
  start() {
    const p = this.plugin;
    const mine = (f: { path: string }) => this.ready && isProposalPath(f.path, this.folder);
    p.registerEvent(this.app.vault.on("create", (f) => (mine(f) ? this.schedule(f.path) : this.notesChanged())));
    p.registerEvent(this.app.vault.on("modify", (f) => mine(f) && this.schedule(f.path)));
    p.registerEvent(this.app.vault.on("delete", (f) => isProposalPath(f.path, this.folder) && this.forget(f.path)));
    p.registerEvent(
      this.app.vault.on("rename", (f, old) => {
        if (isProposalPath(old, this.folder)) this.forget(old);
        if (mine(f)) this.schedule(f.path);
        else this.notesChanged();
      }),
    );
    p.registerEvent(this.app.metadataCache.on("changed", () => this.notesChanged()));
    this.app.workspace.onLayoutReady(() => {
      this.ready = true;
      this.scan();
      // The metadata cache may not know every note yet: look once more when it has resolved.
      const ref = this.app.metadataCache.on("resolved", () => {
        this.app.metadataCache.offref(ref);
        this.scan();
      });
      p.registerEvent(ref);
      window.setTimeout(() => void this.cleanup(), 10_000);
    });
  }

  private scan() {
    for (const f of this.app.vault.getMarkdownFiles()) if (isProposalPath(f.path, this.folder)) this.schedule(f.path);
  }

  /** A note appeared, changed or was renamed: proposals that found no note yet look again. */
  private notesChanged() {
    if (!this.ready) return;
    for (const path of this.unresolved) if (!this.timers.has(path)) this.schedule(path, SETTLE_MS * 2);
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
    this.unresolved.delete(path);
    this.conflicts.delete(path);
    if (job && this.review.get(job) === path) this.review.delete(job);
    this.changed();
  }

  private changed() {
    this.plugin.settingsViews.refresh(["improve"]);
  }

  /** The valid proposals seen so far as recipes with their job ID, for `checkJobs` (they close improvement jobs). */
  proposals(): RecipeView[] {
    return [...this.seen.values()].filter((s) => s.valid).map((s) => s.recipe);
  }

  /** Is the proposal of this job held back for the device that started the job (and still within its time)? */
  private waiting(jobId: string): boolean {
    const path = this.review.get(jobId);
    const first = path ? this.seen.get(path)?.first : undefined;
    const job = this.plugin.settings.jobs.find((j) => j.id === jobId);
    if (first === undefined || !job?.improve || job.dropped || jobFailed(job)) return false;
    return !startedHere(job, deviceId(this.app)) && Date.now() - first < FOREIGN_WAIT_MS;
  }

  /**
   * What the page shows for a recipe: a banner when a proposal waits for a look ("waiting" on another device while the
   * starting one still has time), and a first version that says "offen" without an open job as "teilweise": no one
   * is improving it any more.
   */
  mark(recipes: RecipeView[]): RecipeView[] {
    const open = new Set(
      this.plugin.settings.jobs.filter((j) => j.improve && !j.dropped && !jobFailed(j)).map((j) => j.id),
    );
    return markRecipes(recipes, {
      review: (job) => this.review.has(job),
      waiting: (job) => this.waiting(job),
      open,
      reason: tr("improveStale"),
    });
  }

  /** The timeout of an improvement job (src/improveTarget.ts). */
  markTimedOut(jobs: readonly Job[]) {
    return markTimedOut(this.plugin, jobs);
  }

  /** Leftover images of finished proposals (src/improveTarget.ts). */
  cleanup() {
    return cleanupImages(this.plugin);
  }

  /** Proposals without a recipe or invalid ones, for the import area. */
  orphanList(): Orphan[] {
    return [...this.orphans.values()];
  }

  private async dropJob(id: string) {
    const jobs = this.plugin.settings.jobs;
    if (jobs.some((j) => j.id === id)) await this.plugin.save({ jobs: jobs.filter((j) => j.id !== id) });
  }

  // ------------------------------------------------------------------ One proposal

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
    const file = fileAt(this.plugin, path);
    if (!file) return this.forget(path);
    const p = this.plugin;
    const read = readProposal(await this.app.vault.read(file), p.noteFormat().fields, path);
    const first = this.seen.get(path)?.first ?? Date.now();
    const title = schemaFromRecipe(read.recipe).title;
    this.seen.set(path, {
      job: read.job,
      first,
      valid: read.valid,
      recipe: { ...read.recipe, job: read.job, importState: read.state, images: [], imageSrcs: [] },
    });
    if (!read.valid) {
      // Nothing is acted on and nothing is looked up: the file waits as a card until the user discards it.
      this.orphans.set(path, { path, job: read.job, title, kind: "invalid" });
      return this.changed();
    }
    const job = p.settings.jobs.find((j) => j.id === read.job);
    const thisDevice = deviceId(this.app);
    const mine = startedHere(job, thisDevice);
    if (job?.dropped) {
      // The note was deleted on purpose.
      await trashProposal(p, file, read.job);
      await this.dropJob(read.job);
      return this.forget(path);
    }
    const target = await findTarget(p, read.job, job?.improve === true);
    if (!target) return this.noTarget(file, read, title, first, mine);
    this.orphans.delete(path);
    if (read.state === "fehler") return this.failed(file, read, target.file, mine, title);
    this.unresolved.delete(path);
    const plan = await planProposal(p, file, target.file);
    if (!plan) return;
    const decision = improveDecision({
      job,
      thisDevice,
      target,
      editedChanged: plan.editedChanged,
      findings: read.findings,
    });
    if (decision === "apply" && this.waitingForImages(path, read, first)) return;
    if (decision === "apply") return this.autoApply(file, target.file, read);
    this.review.set(read.job, path);
    if (mine) await this.dropJob(read.job);
    // Another device that started the job gets time to apply it; look again before the banner shows.
    if (this.waiting(read.job)) this.schedule(path, LATER_MS);
    this.changed();
  }

  /** No note: wait (it may sync later), then show the card; a failed proposal of an own job has nothing to report to. */
  private async noTarget(file: TFile, read: Proposal, title: string, first: number, mine: boolean) {
    this.unresolved.add(file.path);
    if (Date.now() - first < GRACE_MS) return this.schedule(file.path, LATER_MS);
    if (read.state === "fehler" && mine) {
      await trashProposal(this.plugin, file, read.job);
      await this.dropJob(read.job);
      return this.forget(file.path);
    }
    this.orphans.set(file.path, { path: file.path, job: read.job, title, kind: "orphan" });
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
    }
    if (r.kind === "conflict" || r.kind === "allKept" || r.kind === "gone") {
      // The note keeps changing: leave the decision to the user.
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
   * The improvement failed: the first version stays. Every device writes the reason into a note that still carries
   * the job ID and says "offen" (compare-and-set) and deletes the proposal; the device that started the job also
   * tells the user and closes the job. A note that cannot take the reason (not "offen") leaves the proposal as a
   * card, unless this device started the job.
   */
  private async failed(file: TFile, read: Proposal, target: TFile, mine: boolean, title: string) {
    const why = failureReason({ importError: read.error }) ?? tr("improveFailedNoReason");
    const format = this.plugin.noteFormat();
    let written = false;
    await this.app.vault.process(target, (cur) => {
      const next = markImproveFailed(cur, read.job, why, format);
      written = next !== null && next !== cur;
      return next ?? cur;
    });
    if (!written && !mine) {
      this.orphans.set(file.path, { path: file.path, job: read.job, title, kind: "orphan" });
      return this.changed();
    }
    await trashProposal(this.plugin, file, read.job);
    if (mine) await this.dropJob(read.job);
    this.forget(file.path);
    if (mine || written) new Notice(tr("improveFailedNotice", { why }), 8000);
  }

  // ------------------------------------------------------------------ What the recipe page and the import area use
  // The dialog's and the cards' calls are in src/improveReview.ts; they work on the state of this service.

  preview(targetPath: string) {
    return previewProposal(this.reviewHost(), targetPath);
  }

  cancel(_path: string) {
    // Nothing runs in the background of a preview.
  }

  apply(targetPath: string, replace: Part[]) {
    return applyReview(this.reviewHost(), targetPath, replace);
  }

  discard(targetPath: string) {
    return discardReview(this.reviewHost(), targetPath);
  }

  /** "Save as a new recipe" or "Discard" on a card. */
  orphan(path: string, what: "save" | "discard") {
    return orphanAction(this.reviewHost(), path, what);
  }

  private reviewHost(): ReviewHost {
    return {
      plugin: this.plugin,
      reviewPath: (job) => this.review.get(job),
      orphanAt: (path) => this.orphans.get(path),
      forget: (path) => this.forget(path),
      dropJob: (id) => this.dropJob(id),
    };
  }

  /** What the App gets (src/improveHost.ts). */
  host(notify: (message: string) => void): ImproveHost {
    return improveHost(this, notify);
  }
}

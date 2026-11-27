// Improvement proposals inside Obsidian (ADR 0007, rules: src/improve.ts). Watches `<recipe folder>/Verbesserungen/`,
// and for every proposal decides: apply it (the device that started the job, nothing edited by hand changes), ask
// (a "Review" banner on the recipe page; the job keeps the review in data.json until the user applies or discards),
// or show a card. A failed improvement leaves the first version and only writes the reason. The merge itself is
// src/improveApply.ts (writeMerged, ADR 0006); the dialog's and the cards' calls are src/improveReview.ts.
// A proposal is only acted on if its file name is a job ID and its `auftrag` is the same; its note is found only for a
// job known as an improvement job or for a note that says "offen". Anything unclear waits (a grace period for notes
// that sync later) and ends as a card in the import area, never as a change. Events are filtered: only proposals and
// a change of `auftrag` or `import` in a note of the recipe folder look again, and what the service writes (the note
// once, the proposal's deletion) does not lead back into itself: a proposal that is dealt with is forgotten first.
import type { TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import {
  improveDecision,
  isOpenImprove,
  markRecipes,
  readProposal,
  replacedRun,
  reviewJobOf,
  bannerFor,
  schemaFromRecipe,
  startedHere,
  withReview,
  type Orphan,
  type Proposal,
} from "./improve";
import { fileAt, imagesOf, mergeProposal, planProposal, trashProposal } from "./improveApply";
import { deviceId } from "./importSyncService";
import { noticeWithAction } from "./notice";
import { jobFailed } from "./processor";
import { carriesJob, cleanupStarting, findTarget, markTimedOut, rebind, tidyJobs } from "./improveTarget";
import { cardWithoutNote } from "./improveNoNote";
import { improveHost } from "./improveHost";
import { ARRIVED_KEY, SeenStore } from "./improveSeen";
import {
  applyReview,
  discardReview,
  failedProposal,
  orphanAction,
  undoImproved,
  previewProposal,
  type ReviewHost,
} from "./improveReview";
import { watchVault } from "./improveEvents";
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
  valid: boolean;
  recipe: RecipeView;
}

export class ImproveService {
  /** Proposals seen, by path: what `checkJobs` needs to close an improvement job. */
  private seen = new Map<string, Seen>();
  private orphans = new Map<string, Orphan>();
  /** Proposals of another device's job that wait for it to apply them: the note's path and the job ID. */
  private waiting = new Map<string, string>();
  /** Proposals without a final answer (no note yet, or an orphan): looked at again when notes change. */
  private unresolved = new Set<string>();
  private timers = new Map<string, number>();
  private busy = new Set<string>();
  private conflicts = new Map<string, number>();
  private firstSeen: SeenStore;
  /** When the note of a proposal that waited on a card arrived (the job is unknown here): foreign time counts from it. */
  private arrived: SeenStore;
  private stopped = false;

  constructor(private plugin: BetterCookingPlugin) {
    this.firstSeen = new SeenStore(plugin.app);
    this.arrived = new SeenStore(plugin.app, ARRIVED_KEY);
  }

  private get app() {
    return this.plugin.app;
  }

  private get jobs() {
    return this.plugin.settings.jobs;
  }

  /** Events of the vault (src/improveEvents.ts) and one scan once the layout is ready. */
  start() {
    // A first version whose job was reserved but never sent (the app closed in between, #133).
    this.plugin.app.workspace.onLayoutReady(() => void cleanupStarting(this.plugin));
    watchVault(this.plugin, {
      schedule: (path) => this.schedule(path),
      forget: (path) => this.forget(path),
      notesChanged: (kind) => this.notesChanged(kind),
      dropJob: (id) => this.dropJob(id),
    });
  }

  /**
   * A note of the recipe folder appeared, was renamed or changed its `auftrag` or `import`: proposals that found no
   * note yet look again. An orphan card only looks again for a new or renamed note (or a deleted one: a waiting card
   * or an "unexpected" one may link to it).
   */
  private notesChanged(kind: "added" | "changed") {
    for (const path of this.unresolved) {
      const card = this.orphans.get(path)?.kind;
      if (kind === "changed" && card === "orphan") continue;
      // A waiting card has a long timer and an unexpected one none: the note they wait for may be what just arrived.
      if (card === "waiting" || card === "unexpected" || !this.timers.has(path)) this.schedule(path, SETTLE_MS * 2);
    }
  }

  /** The plugin unloads: no timer fires any more and nothing is scheduled or dealt with afterwards. */
  stop() {
    this.stopped = true;
    for (const t of this.timers.values()) window.clearTimeout(t);
    this.timers.clear();
  }

  private schedule(path: string, ms = SETTLE_MS) {
    if (this.stopped) return;
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
    this.seen.delete(path);
    this.orphans.delete(path);
    this.unresolved.delete(path);
    this.conflicts.delete(path);
    this.firstSeen.forget(path);
    this.arrived.forget(path);
    for (const [target] of [...this.waiting].filter(([, job]) => !this.seenJob(job))) this.waiting.delete(target);
    this.changed();
  }

  private seenJob(job: string) {
    return [...this.seen.values()].some((s) => s.job === job);
  }

  private changed() {
    this.plugin.settingsViews.refresh(["improve"]);
  }

  /** The valid proposals seen so far as recipes with their job ID, for `checkJobs` (they close improvement jobs). */
  proposals(): RecipeView[] {
    return [...this.seen.values()].filter((s) => s.valid).map((s) => s.recipe);
  }

  /**
   * What the page shows for a recipe: the banner for the note a job's review is for (only that note: a copy that
   * carries the same `auftrag` shows none), "waiting" while another device's job has time to apply its proposal, and
   * a first version that says "offen" without an open job as "teilweise": no one is improving it any more.
   */
  mark(recipes: RecipeView[]): RecipeView[] {
    const open = new Map<string, Job | undefined>(this.jobs.filter(isOpenImprove).map((j) => [j.id, j]));
    return markRecipes(recipes, {
      banner: (r) => bannerFor(r.job, reviewJobOf(this.jobs, r.path)?.id, this.waiting.get(r.path)),
      open,
      reason: tr("improveStale"),
    });
  }

  /** After the jobs were checked: timeouts are written into their notes, jobs of deleted notes are tidied up. */
  async afterReconcile(pending: readonly Job[]) {
    await markTimedOut(this.plugin, pending);
    await tidyJobs(this.plugin, (id) => this.seenJob(id));
  }

  /** A retry started a new run (src/improveTarget.ts). */
  rebind(from: string, to: string) {
    return rebind(this.plugin, from, to);
  }

  /**
   * The jobs changed on another device: a proposal that waited for its job (still within its waiting time, or a card
   * "claimed" by a note) is looked at again once its job is known. Nothing is read here; the proposal's own handling does.
   */
  jobsChanged() {
    const known = new Set(this.jobs.map((j) => j.id));
    for (const path of this.unresolved) {
      const card = this.orphans.get(path)?.kind;
      if (card === "orphan" || card === "invalid") continue;
      const wait = card === "waiting" || card === "unexpected";
      if (known.has(this.seen.get(path)?.job ?? "") && (wait || !this.timers.has(path))) this.schedule(path, SETTLE_MS);
    }
  }

  /** Proposals without a recipe or invalid ones, for the import area. */
  orphanList(): Orphan[] {
    return [...this.orphans.values()];
  }

  private async dropJob(id: string) {
    if (this.jobs.some((j) => j.id === id)) await this.plugin.save({ jobs: this.jobs.filter((j) => j.id !== id) });
  }

  // ------------------------------------------------------------------ One proposal

  private async process(path: string) {
    if (this.stopped) return;
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
    const first = this.firstSeen.first(path);
    const title = schemaFromRecipe(read.recipe).title;
    this.seen.set(path, {
      job: read.job,
      valid: read.valid,
      recipe: { ...read.recipe, job: read.job, importState: read.state, images: [], imageSrcs: [] },
    });
    if (!read.valid) {
      // Nothing is acted on and nothing is looked up: the file waits as a card until the user discards it.
      this.orphans.set(path, { path, job: read.job, title, kind: "invalid" });
      return this.changed();
    }
    const job = this.jobs.find((j) => j.id === read.job);
    if (job?.dropped || replacedRun(this.jobs, read.job)) {
      // The note was deleted on purpose, or a retry replaced this run: nothing to show.
      await trashProposal(p, file, read.job);
      if (job?.dropped) await this.dropJob(read.job);
      return this.forget(path);
    }
    const target = await findTarget(p, read.job, job?.improve === true);
    if (this.stopped) return;
    if (!target) return this.noTarget(file, read, title, first, startedHere(job, deviceId(this.app)));
    // The note came after the proposal waited: its device may still apply it (`toReview`); kept over a restart.
    if (this.unresolved.has(path)) this.arrived.first(path);
    this.orphans.delete(path);
    if (read.state === "fehler")
      return failedProposal(this.reviewHost(), file, read, target.file, startedHere(job, deviceId(this.app)));
    this.unresolved.delete(path);
    const plan = await planProposal(p, file, target.file);
    if (!plan || this.stopped) return;
    const decision = improveDecision({
      job,
      thisDevice: deviceId(this.app),
      editedChanged: plan.editedChanged,
      findings: read.findings,
    });
    if (decision === "apply" && this.waitingForImages(path, read, first)) return;
    if (decision === "apply") return this.autoApply(file, target.file, read);
    await this.toReview(file, target.path, read, job, first);
  }

  /**
   * The user decides: the job keeps the review (proposal and note) in data.json until it is applied or discarded. A
   * job another device started gets time first (the starting device applies it if it can); the page shows a hint.
   */
  private async toReview(file: TFile, target: string, read: Proposal, job: Job | undefined, first: number) {
    // A job unknown here whose note came late: its device gets the time first, from the note's arrival (#156).
    const arrived = this.arrived.peek(file.path);
    const late = !job && arrived !== undefined;
    const other = !!job?.improve && !job.review && !jobFailed(job) && !startedHere(job, deviceId(this.app));
    if ((late || other) && Date.now() - Math.max(first, arrived ?? 0) < FOREIGN_WAIT_MS) {
      this.waiting.set(target, read.job);
      this.schedule(file.path, LATER_MS);
      return this.changed();
    }
    this.waiting.delete(target);
    // A job this device does not know gets the processor that the settings would use.
    const chosen = this.plugin.settings.processor;
    const jobs = withReview(
      this.jobs,
      read.job,
      { proposal: file.path, target },
      Date.now(),
      chosen === "github" ? "github" : "claude",
    );
    if (jobs !== this.jobs) await this.plugin.save({ jobs });
    this.changed();
  }

  /** No note: wait (it may sync later), then show the card; a failed proposal of an own job has nothing to report to. */
  private async noTarget(file: TFile, read: Proposal, title: string, first: number, mine: boolean) {
    this.unresolved.add(file.path);
    if (Date.now() - first < GRACE_MS) return this.schedule(file.path, LATER_MS);
    // A note that carries the job ID but is no target (not "offen", job unknown here): never a recipe of its own.
    const claimed = await carriesJob(this.plugin, read.job);
    if (this.stopped) return;
    if (read.state === "fehler" && (mine || claimed)) {
      await trashProposal(this.plugin, file, read.job);
      if (mine) await this.dropJob(read.job);
      return this.forget(file.path);
    }
    if (claimed) this.orphans.set(file.path, { path: file.path, job: read.job, title, kind: "claimed" });
    else {
      const { card, recheck } = cardWithoutNote(this.plugin, {
        path: file.path,
        job: read.job,
        title,
        source: read.recipe.source,
        firstSeen: first,
      });
      this.orphans.set(file.path, card);
      if (recheck !== undefined) this.schedule(file.path, recheck);
    }
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
      return this.toReview(file, target.path, read, undefined, 0);
    }
    await this.dropJob(read.job);
    this.forget(file.path);
    if (r.kind === "written") {
      const text = tr("improved", { title: r.title });
      noticeWithAction(text, { label: tr("undo"), run: () => void undoImproved(this.plugin, target, r) }, 10_000);
    }
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
      reviewOf: (target) => reviewJobOf(this.jobs, target),
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

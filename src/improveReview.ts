// The calls of the review dialog and of the cards for proposals without a recipe (ADR 0007), on the state of
// src/improveService.ts: what the proposal would change, applying it, discarding it, "save as a new recipe".
import type { TFile } from "obsidian";
import type BetterCookingPlugin from "./main";
import { applyFailed, fileAt, mergeProposal, planProposal, saveProposalAsRecipe, trashProposal } from "./improveApply";
import type { Orphan } from "./improve";
import { readField } from "./noteFormat";
import type { Preview } from "./refetch";
import type { Part } from "./fingerprint";
import { tr } from "./i18n";

/** What the service gives these functions: its plugin and the little state they read or end. */
export interface ReviewHost {
  plugin: BetterCookingPlugin;
  /** The proposal file that waits for a look for a job. */
  reviewPath: (job: string) => string | undefined;
  orphanAt: (path: string) => Orphan | undefined;
  /** The proposal is dealt with: forget it. */
  forget: (path: string) => void;
  dropJob: (id: string) => Promise<void>;
}

type Done = { ok: boolean; message?: string };

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

function proposalOf(h: ReviewHost, targetPath: string): { proposal: TFile; target: TFile; job: string } | undefined {
  const { plugin } = h;
  const target = fileAt(plugin, targetPath);
  const fields = plugin.noteFormat().fields;
  const job = target && str(readField(plugin.app.metadataCache.getFileCache(target)?.frontmatter ?? {}, fields, "job"));
  const proposal = job ? fileAt(plugin, h.reviewPath(job) ?? "") : null;
  return target && proposal && job ? { proposal, target, job } : undefined;
}

/** What the review dialog shows: the changes the proposal would make, hand edits marked. Writes nothing. */
export async function previewProposal(h: ReviewHost, targetPath: string): Promise<Preview> {
  const at = proposalOf(h, targetPath);
  const plan = at && (await planProposal(h.plugin, at.proposal, at.target));
  if (!plan) return { ok: false, message: tr("improveGone") };
  return { ok: true, changes: plan.changes, via: "proposal", edited: plan.plan.edited, details: plan.details };
}

/** Applying from the review dialog: parts edited by hand are replaced only if listed in `replace`. */
export async function applyReview(
  h: ReviewHost,
  targetPath: string,
  replace: Part[],
): Promise<Done & { stale?: boolean }> {
  const at = proposalOf(h, targetPath);
  if (!at) return { ok: false, message: tr("improveGone") };
  try {
    const r = await mergeProposal(h.plugin, at.proposal, at.target, replace);
    if (r.kind === "gone") return { ok: false, message: tr("improveGone") };
    if (r.kind === "conflict") return { ok: false, message: tr("improveChangedMeanwhile"), stale: true };
    if (r.kind === "allKept") return { ok: false, message: tr("refetchAllKept") };
    // The improvement is done on every device, whoever started the job.
    await h.dropJob(r.job);
    h.forget(at.proposal.path);
    return {
      ok: true,
      message: r.kind === "written" ? tr("refetched", { title: r.title, backup: r.backup }) : tr("refetchNothing"),
    };
  } catch (e) {
    return { ok: false, message: applyFailed(e) };
  }
}

/** "Discard" in the review dialog: the proposal and its images go to the trash, the job is closed. */
export async function discardReview(h: ReviewHost, targetPath: string): Promise<Done> {
  const at = proposalOf(h, targetPath);
  if (!at) return { ok: false, message: tr("improveGone") };
  await trashProposal(h.plugin, at.proposal, at.job);
  await h.dropJob(at.job);
  h.forget(at.proposal.path);
  return { ok: true, message: tr("improveOrphanDiscarded") };
}

/** "Save as a new recipe" or "Discard" on a card. An invalid file is only discarded, and nothing else is touched. */
export async function orphanAction(h: ReviewHost, path: string, what: "save" | "discard"): Promise<Done> {
  const file = fileAt(h.plugin, path);
  const o = h.orphanAt(path);
  if (!file || !o) return { ok: false, message: tr("improveGone") };
  try {
    const valid = o.kind === "orphan";
    let message = tr("improveOrphanDiscarded");
    if (what === "save" && valid) {
      const title = await saveProposalAsRecipe(h.plugin, file);
      if (!title) return { ok: false, message: tr("improveGone") };
      message = tr("improveOrphanSaved", { title });
    } else await trashProposal(h.plugin, file, valid ? o.job : undefined);
    if (valid) await h.dropJob(o.job);
    h.forget(path);
    return { ok: true, message };
  } catch (e) {
    return { ok: false, message: applyFailed(e) };
  }
}

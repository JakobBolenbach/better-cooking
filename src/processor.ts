// Starts processing of new recipes from the plugin. Two interchangeable processors; both write the finished
// note into the recipe folder and push; the plugin sees it after the Git sync and closes the job.
//  - "claude": the scheduled task "Rezept-Import" through its API access (fire endpoint).
//  - "github": workflow "Rezept importieren" via workflow_dispatch; fallback without Claude, with its own AI adapter
//    (OpenAI-compatible, e.g. a local model on a server, or the Anthropic API) and Apify for social networks.
// Contract (input, output, errors): docs/import-contract.md.
// Pure functions, tested in tests/processor.test.ts.
import type { Detection } from "./source";
import { tr } from "./i18n";
import { failJob, isFailureNote } from "./importFailure";
import type { Job, JobErrorKey } from "./types";

/**
 * "none": no AI at all (pasted text by rules, websites and social media posts read locally). Social media posts
 * (src/socialFlow.ts) are read by the plugin itself unless "claude" or "github" is chosen on purpose.
 */
export type Processor = "auto" | "none" | "claude" | "github" | "ai";
export type ActiveProcessor = "claude" | "github" | "ai";

/** Secrets in Obsidian's secret storage (per device, never in the vault or in Git). */
export const CLAUDE_TOKEN_ID = "rezepte-claude-token";
export const GITHUB_TOKEN_ID = "rezepte-github-token";
/** No default: everyone sets up their own processor (docs/import-contract.md). */
export const DEFAULT_REPO = "";
/** ID of your own scheduled task (trig_…). Not a secret; the token is. */
export const DEFAULT_ROUTINE = "";
export const WORKFLOW = "rezept-import.yml";
/** After this many minutes without a note a job counts as failed (a run usually takes 2 to 5 min., the Git sync on a phone adds to it). */
export const WAIT_MIN = 20;
/** From here on the card shows "dauert länger" with a link to the run and "Nochmal" (a run usually takes 2 to 5 minutes). */
export const SLOW_MIN = 8;

/** State of an open job for display. */
export function jobState(
  a: { since: number; error?: string; errorKey?: JobErrorKey },
  now: number,
): "laeuft" | "langsam" | "fehler" {
  if (jobFailed(a)) return "fehler";
  return now - a.since > SLOW_MIN * 60_000 ? "langsam" : "laeuft";
}

/** A running job can be retried only after this many minutes, and then only after a question (cost, duplicates). */
export const RETRY_AFTER_MIN = 2;

/**
 * "Retry" on a job: a failed one at once ("free"); one that is still running only after RETRY_AFTER_MIN minutes
 * ("wait" before, "confirm" after: the run cannot be stopped, a second one can mean double cost and duplicate notes).
 */
export function retryGuard(
  a: { since: number; error?: string; errorKey?: JobErrorKey },
  now: number,
): "free" | "wait" | "confirm" {
  if (jobFailed(a)) return "free";
  return now - a.since < RETRY_AFTER_MIN * 60_000 ? "wait" : "confirm";
}

/** Has a job waited longer than WAIT_MIN minutes? */
export const jobTimedOut = (a: { since: number }, now: number) => now - a.since > WAIT_MIN * 60_000;

export const jobFailed = (a: { error?: string; errorKey?: JobErrorKey }) => !!(a.error || a.errorKey);

/** Error text of a job in the current language: known errors from their key, free messages as they are. */
export function jobError(a: { error?: string; errorKey?: JobErrorKey }): string | undefined {
  return a.errorKey ? tr(a.errorKey, { n: WAIT_MIN }) : a.error;
}

export const routineValid = (id: string) => /^trig_[A-Za-z0-9]{10,}$/.test(id.trim());
export const repoValid = (r: string) => /^[\w.-]+\/[\w.-]+$/.test(r.trim());

/** Which processor is used? "none": null (no AI). "auto": Claude if set up, otherwise GitHub, otherwise the user's own AI (issue #5). */
export function chooseProcessor(
  processor: Processor,
  claudeReady: boolean,
  githubReady: boolean,
  aiReady = false,
): ActiveProcessor | null {
  if (processor === "none") return null;
  if (processor === "claude") return claudeReady ? "claude" : null;
  if (processor === "github") return githubReady ? "github" : null;
  if (processor === "ai") return aiReady ? "ai" : null;
  return claudeReady ? "claude" : githubReady ? "github" : aiReady ? "ai" : null;
}

/** Display name of a processor. */
export const processorName = (p: ActiveProcessor): string =>
  p === "claude" ? "Claude" : p === "github" ? tr("setGithubAction") : tr("setOwnAi");

export type Ready = { claude: boolean; github: boolean; ai: boolean };

/** The chosen processor if it is a concrete one that is not fully set up. */
const chosenMissing = (chosen: Processor, ready: Ready): ActiveProcessor | null =>
  chosen === "claude" || chosen === "github" || chosen === "ai" ? (ready[chosen] ? null : chosen) : null;

/** "X is chosen but not fully set up." plus the processors that can read social media and are set up. */
function notReadyText(chosen: ActiveProcessor, ready: Ready): string {
  const others = (["claude", "github"] as const).filter((p) => ready[p] && p !== chosen).map(processorName);
  const base = tr("chosenNotReady", { chosen: processorName(chosen) });
  if (!others.length) return base;
  return `${base} ${tr(others.length > 1 ? "otherReadyMany" : "otherReady", { others: others.join(` ${tr("and")} `) })}`;
}

/**
 * Why a link that needs a processor cannot be imported, in one place: `short` for the pill in the import dialog,
 * `long` for the hint, `notReady` (chosen but not fully set up) for the offline text hint. Alternatives named are
 * only those that can read pages for the plugin (Claude, GitHub). Social media is read by the plugin itself and
 * rarely needs this (src/socialFlow.ts).
 */
export function processorStatus(chosen: Processor, ready: Ready): { short: string; long: string; notReady?: string } {
  const missing = chosenMissing(chosen, ready);
  const notReady = missing ? notReadyText(missing, ready) : undefined;
  if (missing) return { short: tr("notSetUp", { chosen: processorName(missing) }), long: notReady!, notReady };
  return { short: chosen === "none" ? tr("viaNoAi") : tr("viaNone"), long: tr("noProcessorHint") };
}

/** Message when a page has no recipe data and nothing can take over. */
export function noRecipeDataMessage(chosen: Processor, ready: Ready): string {
  const missing = chosenMissing(chosen, ready);
  if (missing) return notReadyText(missing, ready);
  return tr(chosen === "none" ? "noneNoRecipeData" : "noRecipeData");
}

/** What a retry of a job passes on: an improvement job stays one, with its hint; it gets a new ID like every run. */
export const retryImprove = (old: Job): { feedback?: string } | undefined =>
  old.improve ? { ...(old.feedback ? { feedback: old.feedback } : {}) } : undefined;

/** What `newJobId` makes; a proposal's file name and `auftrag` must both match it (ADR 0007). */
export const JOB_ID = /^rz-[0-9a-z]+-[0-9a-z]{4}$/;
export const isJobId = (s: string): boolean => JOB_ID.test(s);

export function newJobId(now = Date.now(), random = Math.random()): string {
  return `rz-${now.toString(36)}-${Math.floor(random * 36 ** 4)
    .toString(36)
    .padStart(4, "0")}`;
}

/** The open job to remember once a processor accepted it; `device` is the device that started it (import sync, #82). */
export function newJob(
  a: { id: string; input: string; improve?: true; feedback?: string },
  e: Detection,
  processor: "claude" | "github",
  device: string | null | undefined,
  session: string | undefined,
  now = Date.now(),
): Job {
  return {
    id: a.id,
    input: a.input,
    kind: e.kind,
    key: e.key,
    since: now,
    processor,
    device: device ?? undefined,
    session,
    ...(a.improve ? { improve: true as const } : {}),
    ...(a.feedback ? { feedback: a.feedback } : {}),
  };
}

/** The part of a job a processor request is made from; `improve` asks for a proposal (ADR 0007). */
export type JobRequest = { id: string; input: string; improve?: true };

/**
 * Text for the scheduled task: machine-readable, so the prompt can evaluate it safely. `verbessern` only for an
 * improvement job, so a processor that does not know it never sees it for a normal import.
 */
export function jobText(a: JobRequest, e: Detection): string {
  return JSON.stringify({
    rezept_auftrag: a.id,
    art: e.kind,
    quelle: e.url ?? null,
    schluessel: e.key ?? null,
    text: e.kind === "text" ? a.input.slice(0, 20000) : null,
    ...(a.improve ? { verbessern: true } : {}),
  });
}

export function fireRequest(routine: string, token: string, text: string) {
  return {
    url: `https://api.anthropic.com/v1/claude_code/routines/${encodeURIComponent(routine.trim())}/fire`,
    method: "POST",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "experimental-cc-routine-2026-04-01",
    },
    body: JSON.stringify({ text }),
    throw: false,
  };
}

export function githubRequest(repo: string, token: string, a: JobRequest, e: Detection) {
  return {
    url: `https://api.github.com/repos/${repo.trim()}/actions/workflows/${WORKFLOW}/dispatches`,
    method: "POST",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      ref: "main",
      inputs: {
        auftrag: a.id,
        quelle: e.url ?? "",
        text: e.kind === "text" ? a.input.slice(0, 20000) : "",
        // Workflow inputs are strings; only an improvement job sends it, an older workflow would reject it (422).
        ...(a.improve ? { verbessern: "true" } : {}),
      },
    }),
    throw: false,
  };
}

/** Evaluate the response: ok (with a session link for Claude) or a message in the UI language. */
export function evaluateResponse(
  processor: "claude" | "github",
  status: number,
  json: unknown,
): { ok: true; session?: string } | { ok: false; message: string } {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  if (status >= 200 && status < 300) {
    const url =
      typeof o.claude_code_session_url === "string" && o.claude_code_session_url.startsWith("https://claude.ai/")
        ? o.claude_code_session_url
        : undefined;
    return { ok: true, session: url };
  }
  const err = (o.error && typeof o.error === "object" ? o.error : {}) as Record<string, unknown>;
  const msg = (typeof err.message === "string" ? err.message : typeof o.message === "string" ? o.message : "").slice(
    0,
    160,
  );
  const texts: Record<number, string> =
    processor === "claude"
      ? {
          400: /paus/i.test(msg) ? tr("routineOff") : tr("claudeRejected"),
          401: tr("claude401"),
          403: tr("claude403"),
          404: tr("claude404"),
          429: tr("claude429"),
        }
      : {
          401: tr("github401"),
          403: tr("github403"),
          404: tr("github404"),
          422: tr("github422"),
        };
  // A workflow without the input `verbessern` (contract before 0.9) answers 422 "Unexpected inputs provided".
  if (processor === "github" && status === 422 && /unexpected inputs?/i.test(msg)) texts[422] = tr("github422Improve");
  const base = texts[status] ?? (status >= 500 ? tr("serviceDown") : tr("httpError", { status }));
  return { ok: false, message: msg && status !== 401 ? `${base} (${msg})` : base };
}

/** A finished job of another device stays this long after its time limit, so that nothing is left behind for good. */
export const FOREIGN_KEEP_MS = 24 * 3_600_000;

/** Does the job belong to another device? Without a device ID on either side nothing is foreign (behaves as before). */
export const isForeign = (job: Job, device: string | null): boolean =>
  !!device && !!job.device && job.device !== device;

/**
 * What to do with the result of `checkJobs` when several devices share the jobs (#90): only the device that started a
 * job (`device`) closes it and announces "recipe arrived". Another device leaves a finished job of someone else alone
 * (the view hides it, `visibleJobs`) until it is older than its time limit plus `FOREIGN_KEEP_MS`. A job whose failure
 * note arrived is marked failed on every device: the result is the same everywhere (`failJob`), so merging has nothing
 * to settle. `failedNow` are those of this device (started here, or no device ID), for one notice. `pending` keeps the
 * order of `jobs`.
 */
export function settleJobs<R>(
  jobs: Job[],
  checked: { pending: Job[]; done: { job: Job; recipe: R }[]; failed?: { job: Job; recipe: unknown }[] },
  device: string | null,
  now: number,
): { pending: Job[]; announce: { job: Job; recipe: R }[]; failedNow: Job[] } {
  const next = new Map(checked.pending.map((j) => [j.id, j]));
  const announce: { job: Job; recipe: R }[] = [];
  for (const d of checked.done) {
    const foreign = isForeign(d.job, device);
    // An improvement job is closed by the improvement service once it has dealt with the proposal (it needs the job
    // for the decision); here it is only kept for a while and never announced as "recipe arrived".
    if (d.job.improve) {
      if (now - d.job.since <= WAIT_MIN * 60_000 + FOREIGN_KEEP_MS) next.set(d.job.id, d.job);
    } else if (!foreign) announce.push(d);
    else if (now - d.job.since <= WAIT_MIN * 60_000 + FOREIGN_KEEP_MS) next.set(d.job.id, d.job);
  }
  const failedNow = (checked.failed ?? []).map((f) => f.job).filter((j) => !isForeign(j, device));
  return { pending: jobs.flatMap((j) => next.get(j.id) ?? []), announce, failedNow };
}

/**
 * The jobs the cards show: a job of another device whose recipe has arrived is left out (that device closes it; until
 * then it must not turn from "fetching" to "taking longer" to "no recipe arrived"). Display only, nothing is stored.
 */
export function visibleJobs<
  R extends { path: string; job?: string; source?: string; modified: number; importState?: string },
>(
  jobs: Job[],
  recipes: R[],
  keyOf: (q?: string) => string | undefined,
  device: string | null,
  now: number,
  proposals: readonly { job?: string }[] = [],
): Job[] {
  const gone = new Set(
    checkJobs(jobs, recipes, keyOf, now, proposals)
      // An improvement job whose proposal is there is handled by the service: no card for it any more.
      .done.filter((d) => isForeign(d.job, device) || d.job.improve)
      .map((d) => d.job.id),
  );
  // A job whose note was deleted on purpose has nothing to show (#119, ADR 0007).
  return jobs.filter((j) => !gone.has(j.id) && !j.dropped && !j.review);
}

/**
 * Check open jobs against the recipes: a job is done once a recipe carries its job ID
 * or has the same source and was changed after the job. A failure note (import state failed, job ID, no
 * content, see src/importFailure.ts) is no recipe: it closes the job with its job ID as failed (listed in `failed`
 * and, with the reason, in `pending`), unless a real recipe for the job is there. After WAIT_MIN without a result: error.
 * An improvement job (`improve`, ADR 0007) is different: its note exists from the start (`import: offen`), so neither
 * that note nor a newer one with the same source counts. Only a proposal with its job ID (`proposals`, files of
 * Verbesserungen/) closes it; without one it times out as "no improvement arrived".
 */
export function checkJobs<
  R extends {
    path: string;
    job?: string;
    source?: string;
    modified: number;
    importState?: string;
    importError?: string;
    ingredients?: { ingredients: unknown[] }[];
    steps?: unknown[];
    tips?: unknown[];
    notes?: unknown[];
    attempts?: unknown[];
  },
>(
  jobs: Job[],
  recipes: R[],
  keyOf: (q?: string) => string | undefined,
  now: number,
  proposals: readonly { job?: string }[] = [],
): { pending: Job[]; done: { job: Job; recipe: R }[]; failed: { job: Job; recipe: R }[] } {
  const pending: Job[] = [];
  const done: { job: Job; recipe: R }[] = [];
  const failed: { job: Job; recipe: R }[] = [];
  const good = recipes.filter((x) => !isFailureNote(x));
  const bad = recipes.filter(isFailureNote);
  for (const a of jobs) {
    if (a.improve) {
      // A proposal waits for review (kept in the job): nothing to wait for any more, whether or not its file is known yet.
      if (a.review) {
        pending.push(a);
        continue;
      }
      const p = proposals.find((x) => x.job === a.id);
      // The proposal stands in for the note of the job; only its job ID matters to the callers that handle improvements.
      if (p) done.push({ job: a, recipe: p as R });
      else if (!jobFailed(a) && jobTimedOut(a, now)) pending.push({ ...a, errorKey: "noImprovementArrived" });
      else pending.push(a);
      continue;
    }
    // Only a real recipe can match by source; a failure note belongs to a job by its job ID alone.
    const r =
      good.find((x) => x.job === a.id) ??
      (a.key ? good.find((x) => keyOf(x.source) === a.key && x.modified >= a.since - 60_000) : undefined);
    const f = r ? undefined : bad.find((x) => x.job === a.id);
    if (r) done.push({ job: a, recipe: r });
    else if (f) {
      const job = failJob(a, f);
      failed.push({ job, recipe: f });
      pending.push(job);
    } else if (!jobFailed(a) && jobTimedOut(a, now)) pending.push({ ...a, errorKey: "noRecipeArrived" });
    else pending.push(a);
  }
  return { pending, done, failed };
}

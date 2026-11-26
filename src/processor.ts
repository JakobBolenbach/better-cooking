// Starts processing of new recipes from the plugin. Two interchangeable processors; both write the finished
// note into the recipe folder and push; the plugin sees it after the Git sync and closes the job.
//  - "claude": the scheduled task "Rezept-Import" through its API access (fire endpoint).
//  - "github": workflow "Rezept importieren" via workflow_dispatch; fallback without Claude, with its own AI adapter
//    (OpenAI-compatible, e.g. a local model on a server, or the Anthropic API) and Apify for social networks.
// Contract (input, output, errors): docs/import-contract.md.
// Pure functions, tested in tests/processor.test.ts.
import type { Detection } from "./source";
import { tr } from "./i18n";
import type { Job } from "./types";

/** "none": no AI at all (pasted text by rules, websites read locally, social media locked). */
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
/** After this many minutes without a note a job counts as failed (a run takes 1 to 5 min., Git sync on a phone every few min.). */
export const WAIT_MIN = 20;
/** From here on the card shows "dauert länger" with a link to the run and "Nochmal" (a run usually takes 2 to 6 minutes). */
export const SLOW_MIN = 8;

/** State of an open job for display. */
export function jobState(a: { since: number; error?: string }, now: number): "laeuft" | "langsam" | "fehler" {
  if (a.error) return "fehler";
  return now - a.since > SLOW_MIN * 60_000 ? "langsam" : "laeuft";
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

/**
 * Why no processor is active, for the hint next to a locked import (social media): names the processor that
 * is chosen but not set up, and the ones that are set up and could be chosen instead (only those that can read
 * social media, so Claude and GitHub).
 */
export function noProcessorMessage(
  chosen: Processor,
  ready: { claude: boolean; github: boolean; ai: boolean },
): string {
  if (chosen === "auto") return tr("noProcessorHint");
  if (chosen === "none") return tr("noneSocial");
  const others = (["claude", "github"] as const).filter((p) => ready[p] && p !== chosen).map(processorName);
  const base = tr("chosenNotReady", { chosen: processorName(chosen) });
  return others.length ? `${base} ${tr("otherReady", { others: others.join(", ") })}` : base;
}

/** Message when a page has no recipe data and nothing can take over ("none": no AI by choice). */
export const noRecipeDataMessage = (chosen: Processor): string =>
  tr(chosen === "none" ? "noneNoRecipeData" : "noRecipeData");

/** The own AI reads pasted text and web pages, but not social media posts. */
export const aiCanRead = (kind: string) => kind === "text" || kind === "webseite";

export function newJobId(now = Date.now(), random = Math.random()): string {
  return `rz-${now.toString(36)}-${Math.floor(random * 36 ** 4)
    .toString(36)
    .padStart(4, "0")}`;
}

/** Text for the scheduled task: machine-readable, so the prompt can evaluate it safely. */
export function jobText(a: { id: string; input: string }, e: Detection): string {
  return JSON.stringify({
    rezept_auftrag: a.id,
    art: e.kind,
    quelle: e.url ?? null,
    schluessel: e.key ?? null,
    text: e.kind === "text" ? a.input.slice(0, 20000) : null,
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

export function githubRequest(repo: string, token: string, a: { id: string; input: string }, e: Detection) {
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
      inputs: { auftrag: a.id, quelle: e.url ?? "", text: e.kind === "text" ? a.input.slice(0, 20000) : "" },
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
  const base = texts[status] ?? (status >= 500 ? tr("serviceDown") : tr("httpError", { status }));
  return { ok: false, message: msg && status !== 401 ? `${base} (${msg})` : base };
}

/**
 * Check open jobs against the recipes: a job is done once a recipe carries its job ID
 * or has the same source and was changed after the job. After WAIT_MIN without a result: error.
 */
export function checkJobs<R extends { path: string; job?: string; source?: string; modified: number }>(
  jobs: Job[],
  recipes: R[],
  keyOf: (q?: string) => string | undefined,
  now: number,
): { pending: Job[]; done: { job: Job; recipe: R }[] } {
  const pending: Job[] = [];
  const done: { job: Job; recipe: R }[] = [];
  for (const a of jobs) {
    const r =
      recipes.find((x) => x.job === a.id) ??
      (a.key ? recipes.find((x) => keyOf(x.source) === a.key && x.modified >= a.since - 60_000) : undefined);
    if (r) done.push({ job: a, recipe: r });
    else if (!a.error && now - a.since > WAIT_MIN * 60_000)
      pending.push({
        ...a,
        error: tr("noRecipeArrived", { n: WAIT_MIN }),
      });
    else pending.push(a);
  }
  return { pending, done };
}

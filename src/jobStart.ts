// Sends one job to Claude or GitHub (contract: docs/import-contract.md) and answers with the job to remember.
// Runs only when the user submits a link or text. Part of the plugin, depends on Obsidian (requestUrl).
import { requestUrl } from "obsidian";
import type { Detection } from "./source";
import type { Job } from "./types";
import { evaluateResponse, fireRequest, githubRequest, jobText, newJobId } from "./processor";
import { tr } from "./i18n";

export interface JobTarget {
  processor: "claude" | "github";
  /** Trigger ID (Claude) or repository (GitHub), and the secret for it. */
  routine: string;
  repo: string;
  token: string;
}

export async function startJob(
  t: JobTarget,
  e: Detection,
  input: string,
): Promise<{ ok: true; job: Job; message: string } | { ok: false; message: string }> {
  const id = newJobId();
  const a = { id, input: e.url ?? input };
  try {
    const request =
      t.processor === "claude" ? fireRequest(t.routine, t.token, jobText(a, e)) : githubRequest(t.repo, t.token, a, e);
    const res = await requestUrl(request);
    let json: unknown = null;
    try {
      json = res.json;
    } catch {
      /* 204 without content */
    }
    const w = evaluateResponse(t.processor, res.status, json);
    if (!w.ok) return { ok: false, message: w.message };
    const job: Job = {
      id,
      input: a.input,
      kind: e.kind,
      key: e.key,
      since: Date.now(),
      processor: t.processor,
      session: w.session,
    };
    return { ok: true, job, message: t.processor === "claude" ? tr("claudeFetching") : tr("githubFetching") };
  } catch (err) {
    return {
      ok: false,
      message: tr("noConnection", { error: err instanceof Error ? err.message.slice(0, 80) : tr("unknown") }),
    };
  }
}

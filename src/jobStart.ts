// Sends one job to Claude or GitHub (contract: docs/import-contract.md) and answers with the job to remember.
// Runs only when the user submits a link or text. Part of the plugin, depends on Obsidian (requestUrl).
import { requestUrl } from "obsidian";
import type { Detection } from "./source";
import type { Job } from "./types";
import { evaluateResponse, fireRequest, githubRequest, jobText, newJob, newJobId } from "./processor";
import { tr } from "./i18n";

export interface JobTarget {
  processor: "claude" | "github";
  /** Trigger ID (Claude) or repository (GitHub), and the secret for it. */
  routine: string;
  repo: string;
  token: string;
  /** This device (deviceId), set on every job so the import sync knows who started it. */
  device?: string | null;
}

export async function startJob(
  t: JobTarget,
  e: Detection,
  input: string,
  /** An improvement job (ADR 0007): the ID of the note's job, and `improve` for the processor. */
  improve?: { id: string; feedback?: string },
): Promise<{ ok: true; job: Job; message: string } | { ok: false; message: string }> {
  const a = {
    id: improve?.id ?? newJobId(),
    input: e.url ?? input,
    ...(improve ? { improve: true as const } : {}),
    ...(improve?.feedback ? { feedback: improve.feedback } : {}),
  };
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
    const job = newJob(a, e, t.processor, t.device, w.session);
    return { ok: true, job, message: t.processor === "claude" ? tr("claudeFetching") : tr("githubFetching") };
  } catch (err) {
    return {
      ok: false,
      message: tr("noConnection", { error: err instanceof Error ? err.message.slice(0, 80) : tr("unknown") }),
    };
  }
}

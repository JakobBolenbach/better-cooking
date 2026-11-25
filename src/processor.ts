// Anstoß der Verarbeitung neuer Rezepte aus dem Plugin. Zwei austauschbare Wege, beide schreiben die fertige
// Notiz in den Rezeptordner und pushen; das Plugin sieht sie nach dem Git-Sync und schließt den Auftrag.
//  - "claude": geplante Aufgabe "Rezept-Import" über ihren API-Zugang (Fire-Endpunkt, wie das Cockpit).
//  - "github": Workflow "Rezept importieren" per workflow_dispatch; Rückfall ohne Claude, mit eigenem KI-Adapter
//    (OpenAI-kompatibel, z. B. lokales Modell auf dem Server, oder Anthropic-API) und Apify für soziale Netzwerke.
// Vertrag (Eingabe, Ausgabe, Fehler): docs/import-contract.md.
// Reine Funktionen, getestet in tests/verarbeiter.test.ts.
import type { Detection } from "./source";
import type { Job } from "./types";

export type Processor = "auto" | "claude" | "github";

/** Geheimnisse im Obsidian-Schlüsselbund (je Gerät, nie im Vault oder Git). */
export const CLAUDE_TOKEN_ID = "rezepte-claude-token";
export const GITHUB_TOKEN_ID = "rezepte-github-token";
/** Kein Standard: Jede Person richtet ihren eigenen Verarbeiter ein (docs/import-contract.md). */
export const DEFAULT_REPO = "";
/** ID der eigenen geplanten Aufgabe (trig_…). Kein Geheimnis; das Token schon. */
export const DEFAULT_ROUTINE = "";
export const WORKFLOW = "rezept-import.yml";
/** Nach so vielen Minuten ohne Notiz gilt ein Auftrag als gescheitert (Lauf 1 bis 5 Min., Git-Sync am iPhone alle paar Min.). */
export const WAIT_MIN = 20;
/** Ab hier zeigt die Karte „dauert länger“ mit Link zum Lauf und „Nochmal“ (ein Lauf braucht sonst 2 bis 6 Minuten). */
export const SLOW_MIN = 8;

/** Stand eines offenen Auftrags für die Anzeige. */
export function jobState(a: { since: number; error?: string }, now: number): "laeuft" | "langsam" | "fehler" {
  if (a.error) return "fehler";
  return now - a.since > SLOW_MIN * 60_000 ? "langsam" : "laeuft";
}

export const routineValid = (id: string) => /^trig_[A-Za-z0-9]{10,}$/.test(id.trim());
export const repoValid = (r: string) => /^[\w.-]+\/[\w.-]+$/.test(r.trim());

/** Welcher Weg wird genommen? "auto": Claude, wenn eingerichtet, sonst GitHub. */
export function chooseProcessor(
  processor: Processor,
  claudeReady: boolean,
  githubReady: boolean,
): "claude" | "github" | null {
  if (processor === "claude") return claudeReady ? "claude" : null;
  if (processor === "github") return githubReady ? "github" : null;
  return claudeReady ? "claude" : githubReady ? "github" : null;
}

export function newJobId(now = Date.now(), random = Math.random()): string {
  return `rz-${now.toString(36)}-${Math.floor(random * 36 ** 4)
    .toString(36)
    .padStart(4, "0")}`;
}

/** Text für die geplante Aufgabe: maschinenlesbar, damit der Prompt ihn sicher auswerten kann. */
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

/** Antwort auswerten: ok (mit Sitzungs-Link bei Claude) oder deutsche Meldung. */
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
          400: /paus/i.test(msg)
            ? "Die Routine „Rezept Import“ ist ausgeschaltet. In Claude Code unter Routinen einschalten; schaltet der Server sie wieder ab, fehlt Nutzungsguthaben für das Modell"
            : "Anfrage abgelehnt",
          401: "Claude-Token ungültig oder gehört nicht zu dieser Aufgabe",
          403: "Kein Zugriff (Konto)",
          404: "Geplante Aufgabe nicht gefunden (Routine-ID prüfen)",
          429: "Zu viele Anstöße, später noch einmal",
        }
      : {
          401: "GitHub-Token ungültig oder abgelaufen",
          403: "GitHub-Token darf keine Actions starten (Recht „Actions: Read and write“)",
          404: "Repo oder Workflow nicht gefunden (Token-Rechte und Repo prüfen)",
          422: "GitHub hat den Auftrag abgelehnt (Workflow-Eingaben)",
        };
  const base = texts[status] ?? (status >= 500 ? "Dienst gerade nicht erreichbar" : `Fehler ${status}`);
  return { ok: false, message: msg && status !== 401 ? `${base} (${msg})` : base };
}

/**
 * Offene Aufträge gegen den Bestand prüfen: Ein Auftrag ist erledigt, sobald ein Rezept seine Auftrags-ID trägt
 * oder dieselbe Quelle hat und nach dem Auftrag geändert wurde. Nach WARTEN_MIN ohne Ergebnis: Fehler.
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
        error: `Nach ${WAIT_MIN} Minuten kein Rezept angekommen. Warum, steht im Lauf; sonst Sync prüfen.`,
      });
    else pending.push(a);
  }
  return { pending, done };
}

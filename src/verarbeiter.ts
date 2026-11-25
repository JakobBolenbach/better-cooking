// Anstoß der Verarbeitung neuer Rezepte aus dem Plugin. Zwei austauschbare Wege, beide schreiben die fertige
// Notiz in den Rezeptordner und pushen; das Plugin sieht sie nach dem Git-Sync und schließt den Auftrag.
//  - "claude": geplante Aufgabe "Rezept-Import" über ihren API-Zugang (Fire-Endpunkt, wie das Cockpit).
//  - "github": Workflow "Rezept importieren" per workflow_dispatch; Rückfall ohne Claude, mit eigenem KI-Adapter
//    (OpenAI-kompatibel, z. B. lokales Modell auf dem Server, oder Anthropic-API) und Apify für soziale Netzwerke.
// Vertrag (Eingabe, Ausgabe, Fehler): docs/import-contract.md.
// Reine Funktionen, getestet in tests/verarbeiter.test.ts.
import type { Erkennung } from "./quelle";
import type { Auftrag } from "./types";

export type Weg = "auto" | "claude" | "github";

/** Geheimnisse im Obsidian-Schlüsselbund (je Gerät, nie im Vault oder Git). */
export const CLAUDE_TOKEN_ID = "rezepte-claude-token";
export const GITHUB_TOKEN_ID = "rezepte-github-token";
/** Kein Standard: Jede Person richtet ihren eigenen Verarbeiter ein (docs/import-contract.md). */
export const REPO_STANDARD = "";
/** ID der eigenen geplanten Aufgabe (trig_…). Kein Geheimnis; das Token schon. */
export const ROUTINE_STANDARD = "";
export const WORKFLOW = "rezept-import.yml";
/** Nach so vielen Minuten ohne Notiz gilt ein Auftrag als gescheitert (Lauf 1 bis 5 Min., Git-Sync am iPhone alle paar Min.). */
export const WARTEN_MIN = 20;
/** Ab hier zeigt die Karte „dauert länger“ mit Link zum Lauf und „Nochmal“ (ein Lauf braucht sonst 2 bis 6 Minuten). */
export const LANGSAM_MIN = 8;

/** Stand eines offenen Auftrags für die Anzeige. */
export function auftragsStand(a: { seit: number; fehler?: string }, jetzt: number): "laeuft" | "langsam" | "fehler" {
  if (a.fehler) return "fehler";
  return jetzt - a.seit > LANGSAM_MIN * 60_000 ? "langsam" : "laeuft";
}

export const routineGueltig = (id: string) => /^trig_[A-Za-z0-9]{10,}$/.test(id.trim());
export const repoGueltig = (r: string) => /^[\w.-]+\/[\w.-]+$/.test(r.trim());

/** Welcher Weg wird genommen? "auto": Claude, wenn eingerichtet, sonst GitHub. */
export function waehleWeg(weg: Weg, claudeBereit: boolean, githubBereit: boolean): "claude" | "github" | null {
  if (weg === "claude") return claudeBereit ? "claude" : null;
  if (weg === "github") return githubBereit ? "github" : null;
  return claudeBereit ? "claude" : githubBereit ? "github" : null;
}

export function neueAuftragsId(jetzt = Date.now(), zufall = Math.random()): string {
  return `rz-${jetzt.toString(36)}-${Math.floor(zufall * 36 ** 4)
    .toString(36)
    .padStart(4, "0")}`;
}

/** Text für die geplante Aufgabe: maschinenlesbar, damit der Prompt ihn sicher auswerten kann. */
export function auftragsText(a: { id: string; eingabe: string }, e: Erkennung): string {
  return JSON.stringify({
    rezept_auftrag: a.id,
    art: e.art,
    quelle: e.url ?? null,
    schluessel: e.schluessel ?? null,
    text: e.art === "text" ? a.eingabe.slice(0, 20000) : null,
  });
}

export function fireAnfrage(routine: string, token: string, text: string) {
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

export function githubAnfrage(repo: string, token: string, a: { id: string; eingabe: string }, e: Erkennung) {
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
      inputs: { auftrag: a.id, quelle: e.url ?? "", text: e.art === "text" ? a.eingabe.slice(0, 20000) : "" },
    }),
    throw: false,
  };
}

/** Antwort auswerten: ok (mit Sitzungs-Link bei Claude) oder deutsche Meldung. */
export function werteAus(
  weg: "claude" | "github",
  status: number,
  json: unknown,
): { ok: true; sitzung?: string } | { ok: false; meldung: string } {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  if (status >= 200 && status < 300) {
    const url =
      typeof o.claude_code_session_url === "string" && o.claude_code_session_url.startsWith("https://claude.ai/")
        ? o.claude_code_session_url
        : undefined;
    return { ok: true, sitzung: url };
  }
  const err = (o.error && typeof o.error === "object" ? o.error : {}) as Record<string, unknown>;
  const msg = (typeof err.message === "string" ? err.message : typeof o.message === "string" ? o.message : "").slice(
    0,
    160,
  );
  const texte: Record<number, string> =
    weg === "claude"
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
  const basis = texte[status] ?? (status >= 500 ? "Dienst gerade nicht erreichbar" : `Fehler ${status}`);
  return { ok: false, meldung: msg && status !== 401 ? `${basis} (${msg})` : basis };
}

/**
 * Offene Aufträge gegen den Bestand prüfen: Ein Auftrag ist erledigt, sobald ein Rezept seine Auftrags-ID trägt
 * oder dieselbe Quelle hat und nach dem Auftrag geändert wurde. Nach WARTEN_MIN ohne Ergebnis: Fehler.
 */
export function pruefeAuftraege<R extends { pfad: string; auftrag?: string; quelle?: string; geaendert: number }>(
  auftraege: Auftrag[],
  rezepte: R[],
  schluesselVon: (q?: string) => string | undefined,
  jetzt: number,
): { offen: Auftrag[]; fertig: { auftrag: Auftrag; rezept: R }[] } {
  const offen: Auftrag[] = [];
  const fertig: { auftrag: Auftrag; rezept: R }[] = [];
  for (const a of auftraege) {
    const r =
      rezepte.find((x) => x.auftrag === a.id) ??
      (a.schluessel
        ? rezepte.find((x) => schluesselVon(x.quelle) === a.schluessel && x.geaendert >= a.seit - 60_000)
        : undefined);
    if (r) fertig.push({ auftrag: a, rezept: r });
    else if (!a.fehler && jetzt - a.seit > WARTEN_MIN * 60_000)
      offen.push({
        ...a,
        fehler: `Nach ${WARTEN_MIN} Minuten kein Rezept angekommen. Warum, steht im Lauf; sonst Sync prüfen.`,
      });
    else offen.push(a);
  }
  return { offen, fertig };
}

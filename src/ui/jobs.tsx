// Rezept holen: Importfenster, laufende Aufträge als Karten und ihre Knöpfe.
// Teil der Oberfläche aus src/ui/App.tsx (Preact), ohne Obsidian.
import { useMemo, useState } from "preact/hooks";
import { detectSource, findDuplicate } from "../source";
import type { Job, RecipeView } from "../types";
import { jobState, SLOW_MIN } from "../processor";
import { Image, Modal, useTick } from "./shared";
import { Icon, type IconName } from "./icons";

export function JobCard({ a, onDismiss, onRetry }: { a: Job; onDismiss: () => void; onRetry: () => Promise<void> }) {
  const kind = detectSource(a.input);
  const state = jobState(a, useTick());
  const title = state === "fehler" ? "Import gescheitert" : state === "langsam" ? "Dauert länger" : "Wird geholt …";
  return (
    <div
      class={`rz-karte rz-karte-auftrag${state === "fehler" ? " fehler" : ""}${state === "langsam" ? " langsam" : ""}`}
      role="status"
    >
      <span class="rz-karte-bild rz-auftrag-bild">
        {state === "fehler" ? <Icon n="warnung" large={28} /> : <Icon n="lader" large={28} className="rz-dreht" />}
      </span>
      <span class="rz-karte-text">
        <span class="rz-karte-titel">{title}</span>
        <span class="rz-karte-meta">
          <span>{kind.label}</span>
          <span>{a.processor === "claude" ? "Claude" : "GitHub"}</span>
          <span>seit {new Date(a.since).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
        </span>
        {state === "fehler" && <span class="rz-karte-grund">{a.error}</span>}
        {state === "langsam" && (
          <span class="rz-karte-grund">Über {SLOW_MIN} Min. ohne Ergebnis. Im Lauf steht, warum.</span>
        )}
        <JobButtons a={a} state={state} onRetry={onRetry} />
      </span>
      <button type="button" class="rz-karte-weg" aria-label="Auftrag entfernen" onClick={onDismiss}>
        <Icon n="x" large={14} />
      </button>
    </div>
  );
}

/** „Lauf ansehen“ (Claude-Sitzung) und „Nochmal“ (ab „dauert länger“). */
export function JobButtons({
  a,
  state,
  onRetry,
}: {
  a: Job;
  state: "laeuft" | "langsam" | "fehler";
  onRetry: () => Promise<void>;
}) {
  const [sending, setSending] = useState(false);
  if (!a.session && state === "laeuft") return null;
  return (
    <span class="rz-auftrag-knoepfe">
      {a.session && (
        <a class="rz-knopf rz-knopf-klein" href={a.session} target="_blank" rel="noopener">
          <Icon n="extern" large={14} />
          Lauf ansehen
        </a>
      )}
      {state !== "laeuft" && (
        <button
          type="button"
          class="rz-knopf rz-knopf-klein"
          disabled={sending}
          onClick={() =>
            void (async () => {
              setSending(true);
              await onRetry();
              setSending(false);
            })()
          }
        >
          {sending ? <Icon n="lader" large={14} className="rz-dreht" /> : <Icon n="nochmal" large={14} />}Nochmal
        </button>
      )}
    </span>
  );
}

export function ImportModal(p: {
  recipes: RecipeView[];
  jobs: Job[];
  processor: "claude" | "github" | null;
  onImport: (input: string) => Promise<{ ok: boolean; message?: string }>;
  onCloseView: () => void;
  onOpenNote: (path: string) => void;
  onJobGone: (id: string) => void;
  onRetry: (id: string) => Promise<void>;
}) {
  const [input, setInput] = useState("");
  const [anyway, setAnyway] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const e = useMemo(() => detectSource(input), [input]);
  const duplicate = useMemo(() => findDuplicate(e, p.recipes), [e, p.recipes]);
  const openEquals = p.jobs.find((a) => !a.error && a.key && a.key === e.key);
  // Rezeptseiten liest das Plugin selbst (schema.org); alles andere braucht einen Verarbeiter.
  const direct = e.kind === "webseite";
  const locked = e.kind === "leer" || running || (!p.processor && !direct) || (!!duplicate && !anyway) || !!openEquals;
  const NEEDS: Record<string, string> = { schema: "Rezeptdaten der Seite", apify: "Apify", ki: "KI" };
  const ICON: Record<string, IconName> = {
    instagram: "bild",
    tiktok: "bild",
    youtube: "play",
    facebook: "bild",
    pinterest: "bild",
    webseite: "link",
    text: "notiz",
  };
  const submit = async () => {
    if (locked) return;
    setRunning(true);
    setMessage(null);
    const r = await p.onImport(input.trim());
    setRunning(false);
    if (r.ok) {
      setMessage({
        ok: true,
        text: r.message ?? "Auftrag ist unterwegs. Das Rezept erscheint in der Übersicht, sobald es fertig ist.",
      });
      setInput("");
      setAnyway(false);
    } else setMessage({ ok: false, text: r.message ?? "Hat nicht geklappt." });
  };
  return (
    <Modal title="Rezept holen" onCloseView={p.onCloseView} id="rz-import-titel">
      <label class="rz-feld">
        <span class="rz-feld-name">Link oder Rezepttext</span>
        <textarea
          rows={input.includes("\n") ? 6 : 2}
          placeholder="https://… (Rezeptseite, Instagram, TikTok, YouTube) oder ein Rezept einfügen"
          value={input}
          onInput={(ev) => {
            setInput((ev.target as HTMLTextAreaElement).value);
            setAnyway(false);
            setMessage(null);
          }}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) void submit();
          }}
        />
      </label>

      {e.kind !== "leer" && (
        <div class="rz-erkennung" aria-live="polite">
          <span class="rz-erkennung-icon">
            <Icon n={ICON[e.kind] ?? "link"} />
          </span>
          <div>
            <p class="rz-erkennung-art">Erkannt: {e.label}</p>
            <p class="rz-leise">{e.processor}</p>
            <p class="rz-erkennung-braucht">
              {e.needs.map((b) => (
                <span key={b} class="rz-pille">
                  {b === "ki" && <Icon n="funken" large={12} />}
                  {NEEDS[b]}
                </span>
              ))}
              <span class="rz-pille rz-pille-weg">
                {direct
                  ? "direkt im Plugin, ohne KI"
                  : p.processor === "claude"
                    ? "verarbeitet von Claude"
                    : p.processor === "github"
                      ? "verarbeitet von der GitHub-Action"
                      : "kein Verarbeiter eingerichtet"}
              </span>
            </p>
          </div>
        </div>
      )}

      {duplicate && (
        <div class="rz-dublette" role="alert">
          <Image src={duplicate.imageSrc} alt="" className="rz-dublette-bild" />
          <div>
            <p class="rz-erkennung-art">Schon gespeichert: {duplicate.title}</p>
            <p class="rz-leise">Dieselbe Quelle steckt bereits in deiner Sammlung.</p>
            <div class="rz-zeile">
              <button type="button" class="rz-knopf rz-knopf-klein" onClick={() => p.onOpenNote(duplicate.path)}>
                Öffnen
              </button>
              <label class="rz-haken-zeile">
                <input
                  type="checkbox"
                  checked={anyway}
                  onChange={(ev) => setAnyway((ev.target as HTMLInputElement).checked)}
                />
                Trotzdem neu holen
              </label>
            </div>
          </div>
        </div>
      )}
      {openEquals && <p class="rz-hinweis">Diese Quelle wird gerade schon geholt.</p>}
      {!p.processor && e.kind !== "leer" && !direct && (
        <p class="rz-hinweis rz-hinweis-warn">
          <Icon n="warnung" large={16} />
          Noch kein Verarbeiter eingerichtet: Einstellungen → Rezepte → Claude-Token oder GitHub-Token.
        </p>
      )}
      {message && <p class={`rz-hinweis${message.ok ? " rz-hinweis-ok" : " rz-hinweis-warn"}`}>{message.text}</p>}

      <div class="rz-fenster-fuss">
        <button type="button" class="rz-knopf" onClick={p.onCloseView}>
          Schließen
        </button>
        <button type="button" class="rz-knopf rz-knopf-haupt" disabled={locked} onClick={() => void submit()}>
          {running ? <Icon n="lader" large={16} className="rz-dreht" /> : <Icon n="funken" large={16} />}Holen
        </button>
      </div>

      {p.jobs.length > 0 && (
        <div class="rz-auftraege">
          <h3 class="rz-gruppe-titel">Aufträge</h3>
          <ul>
            {p.jobs.map((a) => (
              <li key={a.id} class={a.error ? "fehler" : ""}>
                {a.error ? <Icon n="warnung" large={16} /> : <Icon n="lader" large={16} className="rz-dreht" />}
                <span class="rz-auftrag-text">
                  <span>
                    {detectSource(a.input).label} · {a.processor === "claude" ? "Claude" : "GitHub"} · seit{" "}
                    {new Date(a.since).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {a.error && <span class="rz-leise">{a.error}</span>}
                  <JobButtons a={a} state={jobState(a, Date.now())} onRetry={() => p.onRetry(a.id)} />
                </span>
                <button
                  type="button"
                  class="rz-symbol"
                  aria-label="Auftrag entfernen"
                  onClick={() => p.onJobGone(a.id)}
                >
                  <Icon n="x" large={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

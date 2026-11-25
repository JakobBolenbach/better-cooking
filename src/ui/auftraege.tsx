// Rezept holen: Importfenster, laufende Aufträge als Karten und ihre Knöpfe.
// Teil der Oberfläche aus src/ui/App.tsx (Preact), ohne Obsidian.
import { useMemo, useState } from "preact/hooks";
import { erkenneQuelle, findeDublette } from "../quelle";
import type { Auftrag, RezeptAnsicht } from "../types";
import { auftragsStand, LANGSAM_MIN } from "../verarbeiter";
import { Bild, Fenster, useTakt } from "./gemeinsam";
import { Icon, type IconName } from "./icons";

export function AuftragsKarte({
  a,
  onWeg,
  onNochmal,
}: {
  a: Auftrag;
  onWeg: () => void;
  onNochmal: () => Promise<void>;
}) {
  const art = erkenneQuelle(a.eingabe);
  const stand = auftragsStand(a, useTakt());
  const titel = stand === "fehler" ? "Import gescheitert" : stand === "langsam" ? "Dauert länger" : "Wird geholt …";
  return (
    <div
      class={`rz-karte rz-karte-auftrag${stand === "fehler" ? " fehler" : ""}${stand === "langsam" ? " langsam" : ""}`}
      role="status"
    >
      <span class="rz-karte-bild rz-auftrag-bild">
        {stand === "fehler" ? <Icon n="warnung" gross={28} /> : <Icon n="lader" gross={28} klasse="rz-dreht" />}
      </span>
      <span class="rz-karte-text">
        <span class="rz-karte-titel">{titel}</span>
        <span class="rz-karte-meta">
          <span>{art.bezeichnung}</span>
          <span>{a.weg === "claude" ? "Claude" : "GitHub"}</span>
          <span>seit {new Date(a.seit).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
        </span>
        {stand === "fehler" && <span class="rz-karte-grund">{a.fehler}</span>}
        {stand === "langsam" && (
          <span class="rz-karte-grund">Über {LANGSAM_MIN} Min. ohne Ergebnis. Im Lauf steht, warum.</span>
        )}
        <AuftragKnoepfe a={a} stand={stand} onNochmal={onNochmal} />
      </span>
      <button type="button" class="rz-karte-weg" aria-label="Auftrag entfernen" onClick={onWeg}>
        <Icon n="x" gross={14} />
      </button>
    </div>
  );
}

/** „Lauf ansehen“ (Claude-Sitzung) und „Nochmal“ (ab „dauert länger“). */
export function AuftragKnoepfe({
  a,
  stand,
  onNochmal,
}: {
  a: Auftrag;
  stand: "laeuft" | "langsam" | "fehler";
  onNochmal: () => Promise<void>;
}) {
  const [schickt, setSchickt] = useState(false);
  if (!a.sitzung && stand === "laeuft") return null;
  return (
    <span class="rz-auftrag-knoepfe">
      {a.sitzung && (
        <a class="rz-knopf rz-knopf-klein" href={a.sitzung} target="_blank" rel="noopener">
          <Icon n="extern" gross={14} />
          Lauf ansehen
        </a>
      )}
      {stand !== "laeuft" && (
        <button
          type="button"
          class="rz-knopf rz-knopf-klein"
          disabled={schickt}
          onClick={() =>
            void (async () => {
              setSchickt(true);
              await onNochmal();
              setSchickt(false);
            })()
          }
        >
          {schickt ? <Icon n="lader" gross={14} klasse="rz-dreht" /> : <Icon n="nochmal" gross={14} />}Nochmal
        </button>
      )}
    </span>
  );
}

export function ImportFenster(p: {
  rezepte: RezeptAnsicht[];
  auftraege: Auftrag[];
  verarbeiter: "claude" | "github" | null;
  onImport: (eingabe: string) => Promise<{ ok: boolean; meldung?: string }>;
  onZu: () => void;
  onOeffnen: (pfad: string) => void;
  onAuftragWeg: (id: string) => void;
  onNochmal: (id: string) => Promise<void>;
}) {
  const [eingabe, setEingabe] = useState("");
  const [trotzdem, setTrotzdem] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const e = useMemo(() => erkenneQuelle(eingabe), [eingabe]);
  const dublette = useMemo(() => findeDublette(e, p.rezepte), [e, p.rezepte]);
  const offenGleich = p.auftraege.find((a) => !a.fehler && a.schluessel && a.schluessel === e.schluessel);
  // Rezeptseiten liest das Plugin selbst (schema.org); alles andere braucht einen Verarbeiter.
  const direkt = e.art === "webseite";
  const gesperrt =
    e.art === "leer" || laeuft || (!p.verarbeiter && !direkt) || (!!dublette && !trotzdem) || !!offenGleich;
  const BRAUCHT: Record<string, string> = { schema: "Rezeptdaten der Seite", apify: "Apify", ki: "KI" };
  const ICON: Record<string, IconName> = {
    instagram: "bild",
    tiktok: "bild",
    youtube: "play",
    facebook: "bild",
    pinterest: "bild",
    webseite: "link",
    text: "notiz",
  };
  const absenden = async () => {
    if (gesperrt) return;
    setLaeuft(true);
    setMeldung(null);
    const r = await p.onImport(eingabe.trim());
    setLaeuft(false);
    if (r.ok) {
      setMeldung({
        ok: true,
        text: r.meldung ?? "Auftrag ist unterwegs. Das Rezept erscheint in der Übersicht, sobald es fertig ist.",
      });
      setEingabe("");
      setTrotzdem(false);
    } else setMeldung({ ok: false, text: r.meldung ?? "Hat nicht geklappt." });
  };
  return (
    <Fenster titel="Rezept holen" onZu={p.onZu} id="rz-import-titel">
      <label class="rz-feld">
        <span class="rz-feld-name">Link oder Rezepttext</span>
        <textarea
          rows={eingabe.includes("\n") ? 6 : 2}
          placeholder="https://… (Rezeptseite, Instagram, TikTok, YouTube) oder ein Rezept einfügen"
          value={eingabe}
          onInput={(ev) => {
            setEingabe((ev.target as HTMLTextAreaElement).value);
            setTrotzdem(false);
            setMeldung(null);
          }}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) void absenden();
          }}
        />
      </label>

      {e.art !== "leer" && (
        <div class="rz-erkennung" aria-live="polite">
          <span class="rz-erkennung-icon">
            <Icon n={ICON[e.art] ?? "link"} />
          </span>
          <div>
            <p class="rz-erkennung-art">Erkannt: {e.bezeichnung}</p>
            <p class="rz-leise">{e.weg}</p>
            <p class="rz-erkennung-braucht">
              {e.braucht.map((b) => (
                <span key={b} class="rz-pille">
                  {b === "ki" && <Icon n="funken" gross={12} />}
                  {BRAUCHT[b]}
                </span>
              ))}
              <span class="rz-pille rz-pille-weg">
                {direkt
                  ? "direkt im Plugin, ohne KI"
                  : p.verarbeiter === "claude"
                    ? "verarbeitet von Claude"
                    : p.verarbeiter === "github"
                      ? "verarbeitet von der GitHub-Action"
                      : "kein Verarbeiter eingerichtet"}
              </span>
            </p>
          </div>
        </div>
      )}

      {dublette && (
        <div class="rz-dublette" role="alert">
          <Bild src={dublette.bildSrc} alt="" klasse="rz-dublette-bild" />
          <div>
            <p class="rz-erkennung-art">Schon gespeichert: {dublette.titel}</p>
            <p class="rz-leise">Dieselbe Quelle steckt bereits in deiner Sammlung.</p>
            <div class="rz-zeile">
              <button type="button" class="rz-knopf rz-knopf-klein" onClick={() => p.onOeffnen(dublette.pfad)}>
                Öffnen
              </button>
              <label class="rz-haken-zeile">
                <input
                  type="checkbox"
                  checked={trotzdem}
                  onChange={(ev) => setTrotzdem((ev.target as HTMLInputElement).checked)}
                />
                Trotzdem neu holen
              </label>
            </div>
          </div>
        </div>
      )}
      {offenGleich && <p class="rz-hinweis">Diese Quelle wird gerade schon geholt.</p>}
      {!p.verarbeiter && e.art !== "leer" && !direkt && (
        <p class="rz-hinweis rz-hinweis-warn">
          <Icon n="warnung" gross={16} />
          Noch kein Verarbeiter eingerichtet: Einstellungen → Rezepte → Claude-Token oder GitHub-Token.
        </p>
      )}
      {meldung && <p class={`rz-hinweis${meldung.ok ? " rz-hinweis-ok" : " rz-hinweis-warn"}`}>{meldung.text}</p>}

      <div class="rz-fenster-fuss">
        <button type="button" class="rz-knopf" onClick={p.onZu}>
          Schließen
        </button>
        <button type="button" class="rz-knopf rz-knopf-haupt" disabled={gesperrt} onClick={() => void absenden()}>
          {laeuft ? <Icon n="lader" gross={16} klasse="rz-dreht" /> : <Icon n="funken" gross={16} />}Holen
        </button>
      </div>

      {p.auftraege.length > 0 && (
        <div class="rz-auftraege">
          <h3 class="rz-gruppe-titel">Aufträge</h3>
          <ul>
            {p.auftraege.map((a) => (
              <li key={a.id} class={a.fehler ? "fehler" : ""}>
                {a.fehler ? <Icon n="warnung" gross={16} /> : <Icon n="lader" gross={16} klasse="rz-dreht" />}
                <span class="rz-auftrag-text">
                  <span>
                    {erkenneQuelle(a.eingabe).bezeichnung} · {a.weg === "claude" ? "Claude" : "GitHub"} · seit{" "}
                    {new Date(a.seit).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {a.fehler && <span class="rz-leise">{a.fehler}</span>}
                  <AuftragKnoepfe a={a} stand={auftragsStand(a, Date.now())} onNochmal={() => p.onNochmal(a.id)} />
                </span>
                <button
                  type="button"
                  class="rz-symbol"
                  aria-label="Auftrag entfernen"
                  onClick={() => p.onAuftragWeg(a.id)}
                >
                  <Icon n="x" gross={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Fenster>
  );
}

// Fenster zum Notieren eines Versuchs.
// Teil der Oberfläche aus src/ui/App.tsx (Preact), ohne Obsidian.
import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { heuteIso, isoZuDe } from "../parse";
import type { RezeptAnsicht } from "../types";
import { Fenster, Sterne } from "./gemeinsam";
import { Icon } from "./icons";

export interface VersuchEingabe {
  datum: string;
  geaendert: string;
  ergebnis: string;
  bewertung?: number;
  alsBewertung: boolean;
  gemacht: boolean;
}

export function VersuchFenster({
  r,
  onZu,
  onSpeichern,
}: {
  r: RezeptAnsicht;
  onZu: () => void;
  onSpeichern: (v: VersuchEingabe) => Promise<void>;
}) {
  const [v, setV] = useState<VersuchEingabe>({
    datum: isoZuDe(heuteIso()),
    geaendert: "",
    ergebnis: "",
    alsBewertung: !r.bewertung,
    gemacht: true,
  });
  const [laeuft, setLaeuft] = useState(false);
  const feld = (k: "geaendert" | "ergebnis") => (ev: JSX.TargetedEvent<HTMLTextAreaElement>) =>
    setV({ ...v, [k]: (ev.target as HTMLTextAreaElement).value });
  return (
    <Fenster titel="Versuch notieren" onZu={onZu} id="rz-versuch-titel">
      <p class="rz-leise">{r.titel}</p>
      <label class="rz-feld">
        <span class="rz-feld-name">Datum</span>
        <input
          type="text"
          value={v.datum}
          onInput={(ev) => setV({ ...v, datum: (ev.target as HTMLInputElement).value })}
        />
      </label>
      <label class="rz-feld">
        <span class="rz-feld-name">Was hast du geändert?</span>
        <textarea
          rows={2}
          placeholder="z. B. 60 Min. Gare statt 45, 20 g mehr Wasser"
          value={v.geaendert}
          onInput={feld("geaendert")}
        />
      </label>
      <label class="rz-feld">
        <span class="rz-feld-name">Wie war es?</span>
        <textarea
          rows={2}
          placeholder="z. B. Krume fluffiger, Kruste etwas zu dunkel"
          value={v.ergebnis}
          onInput={feld("ergebnis")}
        />
      </label>
      <div class="rz-feld">
        <span class="rz-feld-name">Bewertung dieses Versuchs</span>
        <Sterne wert={v.bewertung} onWert={(n) => setV({ ...v, bewertung: n ?? undefined })} gross />
      </div>
      <label class="rz-haken-zeile">
        <input
          type="checkbox"
          checked={v.alsBewertung}
          onChange={(ev) => setV({ ...v, alsBewertung: (ev.target as HTMLInputElement).checked })}
        />
        Als Bewertung des Rezepts übernehmen
      </label>
      <label class="rz-haken-zeile">
        <input
          type="checkbox"
          checked={v.gemacht}
          onChange={(ev) => setV({ ...v, gemacht: (ev.target as HTMLInputElement).checked })}
        />
        „Zuletzt gemacht“ auf dieses Datum setzen
      </label>
      <div class="rz-fenster-fuss">
        <button type="button" class="rz-knopf" onClick={onZu}>
          Abbrechen
        </button>
        <button
          type="button"
          class="rz-knopf rz-knopf-haupt"
          disabled={laeuft || !/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(v.datum.trim())}
          onClick={() =>
            void (async () => {
              setLaeuft(true);
              await onSpeichern(v);
              setLaeuft(false);
            })()
          }
        >
          <Icon n="haken" gross={16} />
          Speichern
        </button>
      </div>
    </Fenster>
  );
}

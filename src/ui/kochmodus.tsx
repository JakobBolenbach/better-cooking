// Kochmodus im Vollbild: ein Schritt pro Ansicht, Timer-Leiste und Signalton.
// Teil der Oberfläche aus src/ui/App.tsx (Preact), ohne Obsidian.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { uhr, zutatenImSchritt } from "../kochen";
import type { RezeptAnsicht } from "../types";
import type { Uhrwerk } from "./gemeinsam";
import { Icon } from "./icons";
import { MitUhren, Schritttitel, Zutatenliste } from "./zutaten";

// ---------------------------------------------------------------- Kochmodus

export function Kochmodus(p: {
  r: RezeptAnsicht;
  schritt: number;
  faktor: number;
  onSchritt: (n: number) => void;
  onZu: () => void;
  onUhr: (titel: string, sek: number) => void;
  onVersuch: () => void;
  onWachHalten: (an: boolean) => Promise<boolean>;
}) {
  const { r } = p;
  const n = r.schritte.length;
  const fertig = p.schritt >= n;
  const s = r.schritte[Math.min(p.schritt, n - 1)];
  const [wach, setWach] = useState(false);
  const [zutatenAuf, setZutatenAuf] = useState(false);
  useEffect(() => {
    void p.onWachHalten(true).then(setWach);
    return () => void p.onWachHalten(false);
  }, []);
  const imSchritt = useMemo(() => (s ? zutatenImSchritt(`${s.titel ?? ""} ${s.text}`, r.zutaten) : []), [s, r.zutaten]);
  const wisch = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      class="rz-koch"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rz-koch-titel"
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse") wisch.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const w = wisch.current;
        wisch.current = null;
        if (!w) return;
        const dx = e.clientX - w.x;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - w.y) * 1.5)
          p.onSchritt(Math.max(0, Math.min(n, p.schritt + (dx < 0 ? 1 : -1))));
      }}
    >
      <div class="rz-koch-kopf">
        <button type="button" class="rz-symbol" aria-label="Kochmodus beenden" onClick={p.onZu}>
          <Icon n="x" gross={22} />
        </button>
        <div class="rz-koch-kopftext">
          <span id="rz-koch-titel" class="rz-koch-rezept">
            {r.titel}
          </span>
          <span class="rz-koch-stand">
            {fertig ? "Fertig" : `Schritt ${p.schritt + 1} von ${n}`}
            {wach && (
              <span class="rz-koch-wach">
                <Icon n="auge" gross={13} />
                Bildschirm bleibt an
              </span>
            )}
          </span>
        </div>
        <button
          type="button"
          class={`rz-knopf rz-knopf-klein${zutatenAuf ? " an" : ""}`}
          aria-expanded={zutatenAuf}
          onClick={() => setZutatenAuf(!zutatenAuf)}
        >
          Zutaten
        </button>
      </div>
      <div class="rz-koch-fortschritt" aria-hidden="true">
        {r.schritte.map((_, i) => (
          <span key={i} class={i < p.schritt ? "erledigt" : i === p.schritt ? "jetzt" : ""} />
        ))}
      </div>

      <div class="rz-koch-buehne">
        {zutatenAuf && (
          <div class="rz-koch-alle-zutaten">
            <Zutatenliste r={r} faktor={p.faktor} />
          </div>
        )}
        {fertig ? (
          <div class="rz-koch-fertig">
            <span class="rz-leer-icon">
              <Icon n="haken" gross={36} />
            </span>
            <p class="rz-koch-schritttext">Guten Appetit!</p>
            <p class="rz-leise">
              Wie ist es geworden? Halte fest, was du geändert hast, damit das nächste Mal noch besser wird.
            </p>
            <div class="rz-zeile">
              <button type="button" class="rz-knopf rz-knopf-haupt" onClick={p.onVersuch}>
                <Icon n="stift" gross={16} />
                Versuch notieren
              </button>
              <button type="button" class="rz-knopf" onClick={p.onZu}>
                Schließen
              </button>
            </div>
          </div>
        ) : (
          <div class="rz-koch-schritt" key={p.schritt}>
            <span class="rz-koch-nr">{p.schritt + 1}</span>
            {s.titel && (
              <p class="rz-koch-schritttitel">
                <Schritttitel titel={s.titel} onUhr={p.onUhr} />
              </p>
            )}
            <p class="rz-koch-schritttext">
              <MitUhren text={s.text} titel={s.titel ?? `Schritt ${p.schritt + 1}`} onUhr={p.onUhr} />
            </p>
            {imSchritt.length > 0 && (
              <div class="rz-koch-zutaten">
                <span class="rz-oberzeile">In diesem Schritt</span>
                <Zutatenliste r={r} faktor={p.faktor} nur={imSchritt} />
              </div>
            )}
          </div>
        )}
      </div>

      <div class="rz-koch-fuss">
        <button
          type="button"
          class="rz-knopf rz-knopf-gross"
          disabled={p.schritt === 0}
          onClick={() => p.onSchritt(p.schritt - 1)}
        >
          <Icon n="links" gross={20} />
          Zurück
        </button>
        {!fertig && (
          <button
            type="button"
            class="rz-knopf rz-knopf-haupt rz-knopf-gross"
            onClick={() => p.onSchritt(p.schritt + 1)}
          >
            {p.schritt === n - 1 ? "Fertig" : "Weiter"}
            <Icon n="rechts" gross={20} />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Uhren

export function Uhrenleiste({
  uhren,
  jetzt,
  onPause,
  onWeg,
}: {
  uhren: Uhrwerk[];
  jetzt: number;
  onPause: (id: number) => void;
  onWeg: (id: number) => void;
}) {
  return (
    <div class="rz-uhren" role="region" aria-label="Timer">
      {uhren.map((u) => {
        const rest = u.fertig ? 0 : u.rest !== undefined ? u.rest : u.ende - jetzt;
        return (
          <div key={u.id} class={`rz-uhr${u.fertig ? " fertig" : ""}${u.rest !== undefined ? " pause" : ""}`}>
            <Icon n="timer" gross={16} />
            <span class="rz-uhr-text">
              <span class="rz-uhr-zeit">{u.fertig ? "Fertig" : uhr(rest / 1000)}</span>
              <span class="rz-uhr-titel">{u.titel}</span>
            </span>
            {!u.fertig && (
              <button
                type="button"
                class="rz-symbol"
                aria-label={u.rest !== undefined ? "Weiter" : "Pause"}
                onClick={() => onPause(u.id)}
              >
                <Icon n={u.rest !== undefined ? "play" : "pause"} gross={16} />
              </button>
            )}
            <button type="button" class="rz-symbol" aria-label="Timer entfernen" onClick={() => onWeg(u.id)}>
              <Icon n="x" gross={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Kurzer Ton beim Ende eines Timers (WebAudio, ohne Datei); auf dem Handy zusätzlich Vibration. */
export function klingeln() {
  try {
    navigator.vibrate?.([200, 100, 200]);
    const Ctx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.22);
    });
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* ohne Ton */
  }
}

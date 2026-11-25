import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Rezeptsuche, type Treffer } from "../suche";
import type { Auftrag, DesignModus, RezeptAnsicht, Status, Theme } from "../types";
import { ImportFenster } from "./auftraege";
import type { Liste, Uhrwerk } from "./gemeinsam";
import type { IconName } from "./icons";
import { klingeln, Kochmodus, Uhrenleiste } from "./kochmodus";
import { Rezeptseite } from "./rezeptseite";
import { AnsichtFenster, Seitenleiste } from "./seitenleiste";
import { istEingabefeld, tasteFuerAnsicht } from "./tastatur";
import { Uebersicht } from "./uebersicht";
import { type VersuchEingabe, VersuchFenster } from "./versuch";

export interface AppProps {
  rezepte: RezeptAnsicht[];
  theme: Theme;
  modus: DesignModus;
  auftraege: Auftrag[];
  /** Welcher Weg einen neuen Auftrag verarbeiten würde; null = keiner eingerichtet. */
  verarbeiter: "claude" | "github" | null;
  liste?: string;
  /** Rezeptordner aus den Einstellungen, für den Hinweis in der leeren Übersicht. */
  ordner?: string;
  /** Für die Vorschau: Rezept direkt öffnen. */
  start?: {
    rezept?: string;
    kochen?: boolean;
    importieren?: boolean;
    suche?: string;
    versuch?: boolean;
    ansicht?: boolean;
  };
  onListe: (liste: string) => void;
  onModus: (m: DesignModus) => void;
  onOeffnen: (pfad: string) => void;
  onStatus: (pfad: string, s: Status) => void;
  onBewertung: (pfad: string, n: number | null) => void;
  onGemacht: (pfad: string) => void;
  onVersuch: (pfad: string, v: VersuchEingabe) => Promise<boolean>;
  onImport: (eingabe: string) => Promise<{ ok: boolean; meldung?: string }>;
  onAuftragWeg: (id: string) => void;
  /** Auftrag neu anstoßen (gleiche Eingabe) und den alten entfernen. */
  onNochmal: (id: string) => Promise<{ ok: boolean; meldung?: string }>;
  onHinweis: (text: string) => void;
  onWachHalten: (an: boolean) => Promise<boolean>;
}

// ---------------------------------------------------------------- App

export function App(p: AppProps) {
  const [liste, setListe] = useState<Liste>((p.liste as Liste) || "alle");
  const [suche, setSuche] = useState(p.start?.suche ?? "");
  const [offen, setOffen] = useState<string | null>(p.start?.rezept ?? null);
  const [koch, setKoch] = useState<{ pfad: string; schritt: number } | null>(
    p.start?.kochen && p.start.rezept ? { pfad: p.start.rezept, schritt: 0 } : null,
  );
  const [importOffen, setImportOffen] = useState(!!p.start?.importieren);
  const [ansichtOffen, setAnsichtOffen] = useState(!!p.start?.ansicht);
  const [versuchFuer, setVersuchFuer] = useState<string | null>(
    p.start?.versuch && p.start.rezept ? p.start.rezept : null,
  );
  const [portionen, setPortionen] = useState<Record<string, number>>({});
  const [abgehakt, setAbgehakt] = useState<Record<string, string[]>>({});
  const [uhren, setUhren] = useState<Uhrwerk[]>([]);
  const [jetzt, setJetzt] = useState(Date.now());
  const sucheRef = useRef<HTMLInputElement>(null);
  const wurzelRef = useRef<HTMLDivElement>(null);
  const suchIndex = useRef(new Rezeptsuche());

  const sichtbar = useMemo(() => p.rezepte, [p.rezepte]);
  useMemo(() => suchIndex.current.abgleichen(sichtbar), [sichtbar]);
  const nachPfad = useMemo(() => new Map(sichtbar.map((r) => [r.pfad, r])), [sichtbar]);
  const offenesRezept = offen ? nachPfad.get(offen) : undefined;
  const kochRezept = koch ? nachPfad.get(koch.pfad) : undefined;

  // Uhren: einmal je Sekunde, nur wenn eine läuft.
  useEffect(() => {
    if (!uhren.some((u) => !u.fertig && u.rest === undefined)) return;
    const t = window.setInterval(() => setJetzt(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [uhren]);
  useEffect(() => {
    const fertig = uhren.filter((u) => !u.fertig && u.rest === undefined && u.ende <= jetzt);
    if (!fertig.length) return;
    setUhren((alt) => alt.map((u) => (fertig.some((f) => f.id === u.id) ? { ...u, fertig: true } : u)));
    for (const f of fertig) {
      p.onHinweis(`Timer fertig: ${f.titel} (${f.rezept})`);
      klingeln();
    }
  }, [jetzt]);

  // Tastatur: "/" fokussiert die Suche, Esc schließt die oberste Ebene.
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      const ziel = e.target as HTMLElement | null;
      if (!tasteFuerAnsicht(ziel, wurzelRef.current)) return;
      const imFeld = istEingabefeld(ziel);
      if (e.key === "Escape") {
        if (versuchFuer) setVersuchFuer(null);
        else if (ansichtOffen) setAnsichtOffen(false);
        else if (importOffen) setImportOffen(false);
        else if (koch) setKoch(null);
        else if (offen) setOffen(null);
        else return;
        e.preventDefault();
      } else if (e.key === "/" && !imFeld && !koch && !importOffen) {
        e.preventDefault();
        setOffen(null);
        // Breit steht die Suche in der Seitenleiste, schmal über der Liste: die sichtbare nehmen.
        const felder = Array.from(
          wurzelRef.current?.querySelectorAll<HTMLInputElement>(".rz-suche input") ?? [],
        ).filter((i) => i.offsetParent);
        (felder[0] ?? sucheRef.current)?.focus();
      } else if (koch && !imFeld && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        const r = nachPfad.get(koch.pfad);
        if (!r) return;
        const n = r.schritte.length;
        setKoch({ ...koch, schritt: Math.max(0, Math.min(n, koch.schritt + (e.key === "ArrowRight" ? 1 : -1))) });
      }
    };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  });

  const waehle = (l: Liste) => {
    setListe(l);
    setSuche("");
    setOffen(null);
    p.onListe(l);
  };

  const kategorien = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of sichtbar)
      if (r.kategorie && r.status !== "verworfen") m.set(r.kategorie, (m.get(r.kategorie) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "de"));
  }, [sichtbar]);

  const zaehle = (f: (r: RezeptAnsicht) => boolean) => sichtbar.filter(f).length;
  const listen: { id: Liste; name: string; icon: IconName; anzahl: number }[] = [
    { id: "alle", name: "Alle Rezepte", icon: "buch", anzahl: zaehle((r) => r.status !== "verworfen") },
    { id: "bewaehrt", name: "Bewährt", icon: "siegel", anzahl: zaehle((r) => r.status === "bewaehrt") },
    {
      id: "ausprobieren",
      name: "Zum Ausprobieren",
      icon: "kolben",
      anzahl: zaehle((r) => r.status === "ausprobieren"),
    },
    { id: "zuletzt", name: "Zuletzt gekocht", icon: "verlauf", anzahl: zaehle((r) => !!r.zuletztGemacht) },
  ];
  const verworfen = zaehle((r) => r.status === "verworfen");

  const neueste = (a: RezeptAnsicht, b: RezeptAnsicht) =>
    (b.erstellt ?? "").localeCompare(a.erstellt ?? "") || b.geaendert - a.geaendert;
  const inListe = useMemo(() => {
    let l = sichtbar.filter((r) => r.status !== "verworfen");
    if (liste === "bewaehrt")
      l = sichtbar
        .filter((r) => r.status === "bewaehrt")
        .sort((a, b) => (b.bewertung ?? 0) - (a.bewertung ?? 0) || a.titel.localeCompare(b.titel, "de"));
    else if (liste === "ausprobieren") l = sichtbar.filter((r) => r.status === "ausprobieren").sort(neueste);
    else if (liste === "zuletzt")
      l = sichtbar
        .filter((r) => !!r.zuletztGemacht)
        .sort((a, b) => (b.zuletztGemacht ?? "").localeCompare(a.zuletztGemacht ?? ""));
    else if (liste === "verworfen") l = sichtbar.filter((r) => r.status === "verworfen").sort(neueste);
    else if (liste.startsWith("kat:")) l = l.filter((r) => r.kategorie === liste.slice(4)).sort(neueste);
    else l = l.sort(neueste);
    return l;
  }, [sichtbar, liste]);

  const treffer: Treffer[] = useMemo(() => (suche.trim() ? suchIndex.current.suche(suche) : []), [suche, sichtbar]);
  const listenName = liste.startsWith("kat:")
    ? liste.slice(4)
    : liste === "verworfen"
      ? "Verworfen"
      : (listen.find((l) => l.id === liste)?.name ?? "Rezepte");

  const nochmal = async (id: string) => {
    const r = await p.onNochmal(id);
    if (!r.ok) p.onHinweis(r.meldung ?? "Hat nicht geklappt.");
  };
  const laufend = p.auftraege.filter((a) => !a.fehler).length;

  const startUhr = (titel: string, rezept: string, sek: number) => {
    setUhren((u) => [...u, { id: Date.now() + Math.random(), titel, rezept, ende: Date.now() + sek * 1000 }]);
    setJetzt(Date.now());
  };

  const faktorVon = (r: RezeptAnsicht) => {
    const basis = r.portionen?.anzahl;
    const wert = portionen[r.pfad];
    if (!basis) return wert ?? 1; // ohne Angabe: Faktor direkt
    return (wert ?? basis) / basis;
  };

  return (
    <div class="rz-app" ref={wurzelRef}>
      <Seitenleiste
        listen={listen}
        kategorien={kategorien}
        verworfen={verworfen}
        aktiv={suche.trim() ? null : liste}
        onListe={waehle}
        suche={suche}
        onSuche={(s) => {
          setSuche(s);
          setOffen(null);
        }}
        sucheRef={sucheRef}
        onImport={() => setImportOffen(true)}
        modus={p.modus}
        onModus={p.onModus}
        auftraege={p.auftraege}
      />
      <main class="rz-haupt" aria-labelledby="rz-titel">
        <Uebersicht
          titel={suche.trim() ? "Suche" : listenName}
          liste={liste}
          listen={listen}
          kategorien={kategorien}
          verworfen={verworfen}
          rezepte={
            suche.trim() ? treffer.map((t) => nachPfad.get(t.pfad)).filter((x): x is RezeptAnsicht => !!x) : inListe
          }
          treffer={suche.trim() ? treffer : null}
          suche={suche}
          onSuche={(s) => setSuche(s)}
          sucheRef={sucheRef}
          onListe={waehle}
          onRezept={setOffen}
          onImport={() => setImportOffen(true)}
          auftraege={liste === "alle" || liste === "ausprobieren" ? p.auftraege : []}
          laufend={laufend}
          onAuftragWeg={p.onAuftragWeg}
          onNochmal={nochmal}
          onAnsicht={() => setAnsichtOffen(true)}
          gesamt={sichtbar.length}
          ordner={p.ordner}
        />
      </main>

      <div class={`rz-detail-ebene${offenesRezept ? " offen" : ""}`} aria-hidden={!offenesRezept}>
        {offenesRezept && (
          <Rezeptseite
            key={offenesRezept.pfad}
            r={offenesRezept}
            theme={p.theme}
            faktor={faktorVon(offenesRezept)}
            portion={portionen[offenesRezept.pfad]}
            onPortion={(n) => setPortionen({ ...portionen, [offenesRezept.pfad]: n })}
            abgehakt={abgehakt[offenesRezept.pfad] ?? []}
            onHaken={(k) => {
              const alt = abgehakt[offenesRezept.pfad] ?? [];
              setAbgehakt({
                ...abgehakt,
                [offenesRezept.pfad]: alt.includes(k) ? alt.filter((x) => x !== k) : [...alt, k],
              });
            }}
            onZurueck={() => setOffen(null)}
            onKochen={() => setKoch({ pfad: offenesRezept.pfad, schritt: 0 })}
            onUhr={(t, s) => startUhr(t, offenesRezept.titel, s)}
            onStatus={(s) => p.onStatus(offenesRezept.pfad, s)}
            onBewertung={(n) => p.onBewertung(offenesRezept.pfad, n)}
            onGemacht={() => p.onGemacht(offenesRezept.pfad)}
            onVersuch={() => setVersuchFuer(offenesRezept.pfad)}
            onOeffnen={() => p.onOeffnen(offenesRezept.pfad)}
          />
        )}
      </div>

      {kochRezept && koch && (
        <Kochmodus
          r={kochRezept}
          schritt={koch.schritt}
          faktor={faktorVon(kochRezept)}
          onSchritt={(s) => setKoch({ ...koch, schritt: s })}
          onZu={() => setKoch(null)}
          onUhr={(t, s) => startUhr(t, kochRezept.titel, s)}
          onVersuch={() => {
            setKoch(null);
            setOffen(kochRezept.pfad);
            setVersuchFuer(kochRezept.pfad);
          }}
          onWachHalten={p.onWachHalten}
        />
      )}

      {uhren.length > 0 && (
        <Uhrenleiste
          uhren={uhren}
          jetzt={jetzt}
          onPause={(id) =>
            setUhren((u) =>
              u.map((x) =>
                x.id !== id
                  ? x
                  : x.rest !== undefined
                    ? { ...x, ende: Date.now() + x.rest, rest: undefined }
                    : { ...x, rest: Math.max(0, x.ende - Date.now()) },
              ),
            )
          }
          onWeg={(id) => setUhren((u) => u.filter((x) => x.id !== id))}
        />
      )}

      {importOffen && (
        <ImportFenster
          rezepte={sichtbar}
          auftraege={p.auftraege}
          verarbeiter={p.verarbeiter}
          onImport={p.onImport}
          onZu={() => setImportOffen(false)}
          onOeffnen={(pfad) => {
            setImportOffen(false);
            setOffen(pfad);
          }}
          onAuftragWeg={p.onAuftragWeg}
          onNochmal={nochmal}
        />
      )}

      {ansichtOffen && (
        <AnsichtFenster
          listen={listen}
          kategorien={kategorien}
          verworfen={verworfen}
          aktiv={suche.trim() ? null : liste}
          onListe={(l) => {
            waehle(l);
            setAnsichtOffen(false);
          }}
          modus={p.modus}
          onModus={p.onModus}
          onImport={() => {
            setAnsichtOffen(false);
            setImportOffen(true);
          }}
          laufend={laufend}
          onZu={() => setAnsichtOffen(false)}
        />
      )}

      {versuchFuer && nachPfad.get(versuchFuer) && (
        <VersuchFenster
          r={nachPfad.get(versuchFuer)!}
          onZu={() => setVersuchFuer(null)}
          onSpeichern={async (v) => {
            const ok = await p.onVersuch(versuchFuer, v);
            if (ok) setVersuchFuer(null);
          }}
        />
      )}
    </div>
  );
}

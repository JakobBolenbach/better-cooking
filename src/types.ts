// Datenmodell der Rezepte. Quelle sind die Notizen im Rezeptordner (Aufbau: docs/recipe-format.md).

export type Status = "ausprobieren" | "bewaehrt" | "verworfen";
export type DesignModus = "system" | "hell" | "dunkel";
export type Theme = "hell" | "dunkel";

export interface Zutatengruppe {
  titel?: string;
  zutaten: string[];
}

export interface Schritt {
  /** Fetter Kurztitel ohne Doppelpunkt, z. B. "Kneten (7 bis 10 Min.)". */
  titel?: string;
  text: string;
}

export interface Versuch {
  /** Überschrift wie im Markdown, z. B. "24.11.2026". */
  datum: string;
  zeilen: string[];
}

export interface Portionen {
  anzahl: number;
  einheit: string;
}

export interface Rezept {
  pfad: string;
  /** Dateiname ohne .md */
  name: string;
  titel: string;
  status: Status;
  kategorie?: string;
  quelle?: string;
  autor?: string;
  ergebnis?: string;
  portionen?: Portionen;
  zeitAktiv?: number;
  zeitGesamt?: number;
  bewertung?: number;
  zuletztGemacht?: string;
  importStand?: string;
  importFehler?: string;
  /** Auftrags-ID aus dem Import (Plugin → Verarbeiter), damit das Plugin offene Aufträge zuordnen kann. */
  auftrag?: string;
  erstellt?: string;
  /** Linkziel des Titelbilds, z. B. "Dinkel-Sonntagsbrötchen Titelbild.webp". */
  bild?: string;
  /** Linkziel der Ablaufgrafik (SVG). */
  ablauf?: string;
  bilder: string[];
  beschreibung?: string;
  zutaten: Zutatengruppe[];
  schritte: Schritt[];
  tipps: string[];
  versuche: Versuch[];
  notizen: string[];
  /** Zeitstempel der Datei (für Sortierung „neu“). */
  geaendert: number;
}

/** Rezept mit aufgelösten Bildadressen für die Anzeige (Obsidian-Ressourcenpfade bzw. Vorschau-URLs). */
export interface RezeptAnsicht extends Rezept {
  bildSrc?: string;
  bilderSrc: string[];
  /** SVG-Text der Ablaufgrafik zum Einbetten (folgt so dem Hell/Dunkel des Plugins). */
  ablaufSvg?: string;
}

export interface Auftrag {
  id: string;
  eingabe: string;
  art: string;
  schluessel?: string;
  seit: number;
  weg: "claude" | "github";
  sitzung?: string;
  fehler?: string;
}

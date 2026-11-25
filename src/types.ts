// Datenmodell der Rezepte. Quelle sind die Notizen im Rezeptordner (Aufbau: docs/recipe-format.md).

export type Status = "ausprobieren" | "bewaehrt" | "verworfen";
export type ColorMode = "system" | "hell" | "dunkel";
export type Theme = "hell" | "dunkel";

export interface IngredientGroup {
  title?: string;
  ingredients: string[];
}

export interface Step {
  /** Fetter Kurztitel ohne Doppelpunkt, z. B. "Kneten (7 bis 10 Min.)". */
  title?: string;
  text: string;
}

export interface Attempt {
  /** Überschrift wie im Markdown, z. B. "24.11.2026". */
  date: string;
  lines: string[];
}

export interface Servings {
  count: number;
  unit: string;
}

export interface Recipe {
  path: string;
  /** Dateiname ohne .md */
  name: string;
  title: string;
  status: Status;
  category?: string;
  source?: string;
  author?: string;
  result?: string;
  servings?: Servings;
  timeActive?: number;
  timeTotal?: number;
  rating?: number;
  lastMade?: string;
  importState?: string;
  importError?: string;
  /** Auftrags-ID aus dem Import (Plugin → Verarbeiter), damit das Plugin offene Aufträge zuordnen kann. */
  job?: string;
  created?: string;
  /** Linkziel des Titelbilds, z. B. "Dinkel-Sonntagsbrötchen Titelbild.webp". */
  image?: string;
  /** Linkziel der Ablaufgrafik (SVG). */
  timeline?: string;
  images: string[];
  description?: string;
  ingredients: IngredientGroup[];
  steps: Step[];
  tips: string[];
  attempts: Attempt[];
  notes: string[];
  /** Zeitstempel der Datei (für Sortierung „neu“). */
  modified: number;
}

/** Rezept mit aufgelösten Bildadressen für die Anzeige (Obsidian-Ressourcenpfade bzw. Vorschau-URLs). */
export interface RecipeView extends Recipe {
  imageSrc?: string;
  imageSrcs: string[];
  /** SVG-Text der Ablaufgrafik zum Einbetten (folgt so dem Hell/Dunkel des Plugins). */
  timelineSvg?: string;
}

export interface Job {
  id: string;
  input: string;
  kind: string;
  key?: string;
  since: number;
  processor: "claude" | "github";
  session?: string;
  error?: string;
}

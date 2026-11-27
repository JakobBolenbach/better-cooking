import type { Finding } from "./importCheck";
import type { Key } from "./i18n";
// Data model of the recipes. The source are the notes in the recipe folder (structure: docs/recipe-format.md).

export type Status = "ausprobieren" | "bewaehrt" | "verworfen";
export type ColorMode = "system" | "hell" | "dunkel";
/** "kitchen": the plugin's own palette (adjustable with Style Settings); "calm": muted sage on off-white; "obsidian": the active theme's colors. */
export type Palette = "kitchen" | "calm" | "obsidian";
export type Theme = "hell" | "dunkel";

export interface IngredientGroup {
  title?: string;
  ingredients: string[];
}

export interface Step {
  /** Bold short title without a colon, e.g. "Kneten (7 bis 10 Min.)". */
  title?: string;
  text: string;
}

export interface Attempt {
  /** Heading as in the Markdown, e.g. "24.11.2026". */
  date: string;
  lines: string[];
}

export interface Servings {
  count: number;
  unit: string;
  /** Upper end of a range ("4-6 servings"); `count` is the lower one and the base of the servings control. */
  countTo?: number;
  /** Words before the amount in the yield text ("Ergibt ca. "), kept when the key fact is shown for other servings. */
  prefix?: string;
}

export interface Recipe {
  path: string;
  /** File name without .md */
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
  /** Job ID from the import (plugin → processor), so the plugin can match open jobs. */
  job?: string;
  created?: string;
  /** Link target of the cover image, e.g. "Dinkel-Sonntagsbrötchen Titelbild.webp". */
  image?: string;
  /** Link target of the timeline graphic (SVG). */
  timeline?: string;
  images: string[];
  description?: string;
  ingredients: IngredientGroup[];
  steps: Step[];
  tips: string[];
  attempts: Attempt[];
  notes: string[];
  /** Timestamp of the file (for sorting by "new"). */
  /** Link target of the original if this note is a translation (issue #10), and the note's language. */
  translationOf?: string;
  language?: string;
  /** Content that does not belong into an imported recipe (importCheck.ts); only for imported notes. */
  findings?: Finding[];
  modified: number;
}

/** Recipe with resolved image addresses for display (Obsidian resource paths or preview URLs). */
export interface RecipeView extends Recipe {
  imageSrc?: string;
  imageSrcs: string[];
  /** SVG text of the timeline graphic for embedding (so it follows the plugin's light/dark mode). */
  timelineSvg?: string;
}

/** Known job errors; each is a string key of the interface language (see `jobError`). */
export const JOB_ERROR_KEYS = ["noRecipeArrived", "importFailedNoReason"] as const satisfies readonly Key[];
export type JobErrorKey = (typeof JOB_ERROR_KEYS)[number];

export interface Job {
  id: string;
  input: string;
  kind: string;
  key?: string;
  since: number;
  processor: "claude" | "github";
  /** Device that started the job (src/importSyncService.ts); jobs without it count as started elsewhere. */
  device?: string;
  session?: string;
  /** Free error text (from a processor); shown as it is. Known errors use `errorKey` instead. */
  error?: string;
  /** Known error as a key, translated when shown (see `jobError` in src/processor.ts). */
  errorKey?: JobErrorKey;
  /** Path of the failure note the processor wrote for this job (docs/import-contract.md, src/importFailure.ts). */
  failedNote?: string;
}

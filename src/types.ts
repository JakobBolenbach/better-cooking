// Data model of the recipes. The source are the notes in the recipe folder (structure: docs/recipe-format.md).

export type Status = "ausprobieren" | "bewaehrt" | "verworfen";
export type ColorMode = "system" | "hell" | "dunkel";
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
  modified: number;
}

/** Recipe with resolved image addresses for display (Obsidian resource paths or preview URLs). */
export interface RecipeView extends Recipe {
  imageSrc?: string;
  imageSrcs: string[];
  /** SVG text of the timeline graphic for embedding (so it follows the plugin's light/dark mode). */
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

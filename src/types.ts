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
  /** Raw value of the import fingerprint field (src/fingerprint.ts); undefined without one. */
  importHash?: string;
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
  /** A proposal for an improved version waits for this recipe: "ready" needs a look, "waiting" is left to the device that started the import (src/improveService.ts). */
  improvement?: "ready" | "waiting";
  /** A first version that a processor still improves (ADR 0007, #133): its job, if this device knows it. */
  improving?: { job?: Job };
  imageSrc?: string;
  imageSrcs: string[];
  /** SVG text of the timeline graphic for embedding (so it follows the plugin's light/dark mode). */
  timelineSvg?: string;
}

/** The answer of an import: `warning`: something was saved but not all went as asked (shown as a warning, not green). */
export interface ImportResult {
  ok: boolean;
  message?: string;
  warning?: boolean;
}

/**
 * Why the plugin's own reading of a social media post gave nothing and the post went to the processor as a normal job
 * (#156): `unreadable` (no caption, login wall, page not understood), `noRecipe` (read, but no recipe in it), `network`
 * (not reachable). `instant`: "Erste Fassung sofort" was on, so the user expected a note at once.
 */
export interface LocalMiss {
  why: "unreadable" | "noRecipe" | "network";
  instant?: true;
}

/** Known job errors; each is a string key of the interface language (see `jobError`). */
export const JOB_ERROR_KEYS = [
  "noRecipeArrived",
  "importFailedNoReason",
  "noImprovementArrived",
] as const satisfies readonly Key[];
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
  /** Runs this job replaced with "Retry": their job IDs and failure notes, which stay hidden while this job is open. */
  retryOf?: { job: string; note?: string }[];
  /**
   * An improvement job (ADR 0007): the note with this job ID already exists (`import: offen`); the processor answers
   * with a proposal file, never with a note, and the plugin merges it (src/improveService.ts).
   */
  improve?: true;
  /** A hint of the user for an improvement run (#120), sent as `hinweis`. */
  feedback?: string;
  /** The note of this improvement job was deleted: a proposal that arrives is dropped (src/improve.ts). */
  dropped?: true;
  /**
   * A proposal waits for the user's look (ADR 0007): the proposal file and the note it is for. Kept in data.json, so it
   * survives a restart and reaches the other devices; applying or discarding the proposal closes the job.
   */
  review?: { proposal: string; target: string };
  /**
   * The job of a first version that is reserved before its note is written and before the request is sent (#133): it
   * is not sent yet. It is replaced by the real job when the processor answered, or removed (and the note closed) when
   * it did not; one left over from a crash is cleaned up at the next start (src/improveTarget.ts).
   */
  starting?: string;
  /** The request got no answer at all (the connection broke): the job may have arrived and is treated as sent (src/improveStart.ts). */
  unsure?: true;
  /** The post could not be read in the plugin, so the processor fetches it completely (shown on the card, #156). */
  local?: LocalMiss;
  /** The timeout of this improvement job was written into its note (once, src/improveTarget.ts). */
  timedOut?: true;
}

// Settings of Better Cooking: data model and defaults. The page in Obsidian's settings is src/settingsTab.ts.
import { DEFAULT_FOLDER } from "./folder";
import type { Job, ColorMode } from "./types";
import { DEFAULT_REPO, DEFAULT_ROUTINE, type Processor } from "./processor";
import type { NoteLang } from "./noteFormat";
import type { AiProvider } from "./ai";

export interface Settings {
  /** Folder with the recipe notes, as Obsidian stores it ("" = top level). */
  folder: string;
  mode: ColorMode;
  openOnStartup: boolean;
  list?: string;
  processor: Processor;
  /** Read recipe websites in the plugin (schema.org); off: prefer the processor if one is set up. */
  readWebsitesLocally: boolean;
  /** Language of the field names, values and sections the plugin writes (reading accepts both). */
  noteFormat: NoteLang;
  /** Own field names, one "fieldId: name" per line (makeNoteFormat). */
  fieldNames: string;
  /** Path of the shopping list note; "" = "<Shopping list>.md" at the top of the vault (issue #7). */
  shoppingList: string;
  /** Lines "name: value" for the frontmatter of new notes (readExtraProperties). */
  extraProperties: string;
  /** ID of the scheduled task "Rezept-Import" (not a secret; the token is in the secret storage). */
  routine: string;
  repo: string;
  /** Own AI (issue #5); the key is in the secret storage. */
  aiProvider: AiProvider;
  aiEndpoint: string;
  aiModel: string;
  /** Open jobs (survive a restart, so "Wird geholt" does not disappear). */
  jobs: Job[];
}

export const DEFAULTS: Settings = {
  folder: DEFAULT_FOLDER,
  mode: "system",
  openOnStartup: false,
  processor: "auto",
  readWebsitesLocally: true,
  noteFormat: "de",
  fieldNames: "",
  shoppingList: "",
  extraProperties: "",
  routine: DEFAULT_ROUTINE,
  repo: DEFAULT_REPO,
  aiProvider: "anthropic",
  aiEndpoint: "",
  aiModel: "",
  jobs: [],
};

// Settings of Better Cooking: data model and defaults. The page in Obsidian's settings is src/settingsTab.ts.
import { DEFAULT_FOLDER } from "./folder";
import type { Job, ColorMode, Palette } from "./types";
import { DEFAULT_REPO, DEFAULT_ROUTINE, type Processor } from "./processor";
import type { LanguageSetting, NoteLangSetting } from "./i18n";
import type { AiProvider } from "./ai";
import { DEFAULT_VOLUME, type TimerVolume } from "./timerSound";

export interface Settings {
  /** Folder with the recipe notes, as Obsidian stores it ("" = top level). */
  folder: string;
  mode: ColorMode;
  palette: Palette;
  openOnStartup: boolean;
  list?: string;
  processor: Processor;
  /** Read recipe websites in the plugin (schema.org); off: prefer the processor if one is set up. */
  readWebsitesLocally: boolean;
  /** Interface language: "auto" follows Obsidian (issue #77). */
  language: LanguageSetting;
  /** Language of the field names, values and sections the plugin writes, and of what it writes into list notes ("ui": like the interface; reading accepts both). */
  noteFormat: NoteLangSetting;
  /** Own field names, one "fieldId: name" per line (makeNoteFormat). */
  fieldNames: string;
  /** Path of the shopping list note; "" = "<Shopping list>.md" at the top of the vault (issue #7). */
  shoppingList: string;
  /** Stores for the shopping list, one "Store: word, word" per line (issue #12). */
  stores: string;
  /** Path of the meal plan note; "" = "<Meal plan>.md" at the top of the vault (issue #11). */
  mealPlan: string;
  /** Lines "name: value" for the frontmatter of new notes (readExtraProperties). */
  extraProperties: string;
  /** ID of the scheduled task "Rezept-Import" (not a secret; the token is in the secret storage). */
  routine: string;
  repo: string;
  /** Own AI (issue #5); the key is in the secret storage. */
  aiProvider: AiProvider;
  aiEndpoint: string;
  aiModel: string;
  /** The one-time hint on tapping left or right in cooking mode was shown (issue #57). */
  cookingTapHintSeen: boolean;
  /** Volume of the gong when a timer ends (issue #58). */
  timerVolume: TimerVolume;
  /** The one-time hint that timers ring on a phone only while Obsidian is open was shown (issue #58). */
  timerPhoneHintSeen: boolean;
  /** Ask the Git plugin (Obsidian Git) to sync while an import by Claude or GitHub waits for its note (issue #82). */
  syncWhileImporting: boolean;
  /** Open jobs (survive a restart, so "Wird geholt" does not disappear). */
  jobs: Job[];
  /** Address of the cover image last used per recipe note (path → https address), so "Fetch again" loads a new image only when the address changed (issue #63). */
  coverUrls: Record<string, string>;
}

export const DEFAULTS: Settings = {
  folder: DEFAULT_FOLDER,
  mode: "system",
  palette: "kitchen",
  openOnStartup: false,
  processor: "auto",
  readWebsitesLocally: true,
  language: "auto",
  noteFormat: "ui",
  fieldNames: "",
  shoppingList: "",
  mealPlan: "",
  stores: "",
  extraProperties: "",
  routine: DEFAULT_ROUTINE,
  repo: DEFAULT_REPO,
  aiProvider: "anthropic",
  aiEndpoint: "",
  aiModel: "",
  cookingTapHintSeen: false,
  timerVolume: DEFAULT_VOLUME,
  timerPhoneHintSeen: false,
  syncWhileImporting: true,
  jobs: [],
  coverUrls: {},
};

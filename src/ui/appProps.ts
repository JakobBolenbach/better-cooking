// What the host (the plugin, or the preview) gives the App: the recipes, the settings it shows and what it does.
import type { Job, ColorMode, Palette, RecipeView, Status, Theme, ImportResult } from "../types";
import type { ActiveProcessor } from "../processor";
import type { Kind } from "../source";
import type { SocialRoute } from "../socialFlow";
import type { SubPageProps } from "./subPages";
import type { GoTo, Page } from "./pages";
import type { ResumeApi } from "../cookingResume";
import type { AttemptInput } from "./attempt";
import type { RefetchApi } from "./refetchModal";
import type { FeedbackApi } from "./feedbackPanel";
import type { DeleteApi } from "./deleteModal";
import type { ImproveHost } from "./improveBanner";
import type { EditApi } from "./editApi";
import type { TimerApi } from "../timerStore";
import type { DeviceStore } from "./useBubblePlace";
import type { JobActions } from "./jobActions";
import type { EscapeHandler } from "./useKeyboard";

export interface AppProps extends SubPageProps {
  recipes: RecipeView[];
  theme: Theme;
  mode: ColorMode;
  jobs: Job[];
  /** Which processor would handle a new job; null = none set up. */
  processor: ActiveProcessor | null;
  /** The way for a social media link (read by the plugin, processor, or locked for Facebook). */
  route?: (kind: Kind) => SocialRoute | null;
  /** Why a link that needs a processor is locked (pill and hint) and whether the chosen processor is not fully set up. */
  status?: { short: string; long: string; notReady?: string };
  list?: string;
  /** Recipe folder from the settings, for the hint in the empty overview. */
  folder?: string;
  /** The recipe folder does not exist (the empty overview says so). */
  folderMissing?: boolean;
  /** For the preview: open a recipe directly. */
  start?: {
    recipe?: string;
    cooking?: boolean;
    importRecipe?: boolean;
    search?: string;
    attempt?: boolean;
    view?: boolean;
    page?: Page;
  };
  /** A note was renamed (`id` counts them): the open recipe, if it is `from`, moves to `to`. */
  renamed?: { id: number; from: string; to: string };
  /** Shows a page when `id` changes (notice button of the host). */
  goto?: GoTo;
  onList: (list: string) => void;
  onMode: (m: ColorMode) => void;
  /** "obsidian": colors and light/dark follow the theme, so the mode switch is hidden. */
  palette?: Palette;
  onOpenNote: (path: string) => void;
  onStatus: (path: string, s: Status) => void;
  onRating: (path: string, n: number | null) => void;
  onMade: (path: string) => void;
  onUndoMade: (path: string) => void;
  onAttempt: (path: string, v: AttemptInput) => Promise<boolean>;
  onShop: (path: string, factor: number, skip: string[]) => void;
  canTranslate?: boolean;
  onTranslate?: (path: string, language: string) => Promise<{ ok: boolean; message?: string; path?: string }>;
  /** "Fetch again" (issue #63): read the source and say what would change; then write it. Unset without a plugin. */
  refetch?: RefetchApi;
  /** Feedback on a recipe (issue #120): "Something wrong? Fetch again with feedback". Unset without a plugin. */
  feedback?: FeedbackApi;
  /** Improvement proposals of processors (ADR 0007): review dialog, proposals without a recipe. */
  improve?: ImproveHost;
  /** "Delete recipe" (issue #119): what goes with it, and the deleting. Unset without a plugin. */
  deleteRecipe?: DeleteApi;
  /** The recipe editor (issue #131): reads the note for the dialog and writes the changed parts. Unset without a plugin. */
  edit?: EditApi;
  onImport: (input: string) => Promise<ImportResult>;
  jobActions: JobActions<{ ok: boolean; message?: string }>;
  failures?: RecipeView[]; // failure notes without an open import, kept out of `recipes`
  /** A notice; with an action it has a button. */
  onHint: (text: string, action?: { label: string; run: () => void }) => void;
  /** Desktop only: printing (and PDF) through the print dialog. */
  canPrint?: boolean;
  onKeepAwake: (an: boolean) => Promise<boolean>;
  /** The cooking timers; they live in the plugin, so they outlast the view (issue #58). */
  timers: TimerApi;
  /** Where the timer bubble's position is kept, per device (not in the synced settings); unset: not kept (issue #154). */
  timerBubble?: DeviceStore;
  /** One-time hint on the tap zones in cooking mode (issue #57). */
  tapHintSeen?: boolean;
  /** The device is a phone or tablet (the tap zone hint is shown); unset: the browser decides. */
  touch?: boolean;
  onTapHintSeen?: () => void;
  /** Where cooking mode stopped, per recipe and device (src/cookingResume.ts); unset: no memory. */
  resume?: ResumeApi;
  /**
   * Inside Obsidian the view handles Esc in its own key scope (a window listener runs too late, Obsidian
   * switches the tab first) and passes each press to the handler given here.
   * Without this prop (preview) the App listens for Esc on the window itself.
   */
  registerEscape?: (handle: EscapeHandler | null) => void;
}

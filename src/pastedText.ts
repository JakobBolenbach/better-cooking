// Pasted text without a processor or with the own AI (issue #15, #88): the cases that are decided in the plugin before
// anything is sent. Writes only one new note in the recipe folder.
import type { App } from "obsidian";
import { saveRecipe } from "./localImport";
import type { Detection } from "./source";
import type { ActiveProcessor } from "./processor";
import type { NoteFormat } from "./noteFormat";
import { recipeFromText } from "./textRecipe";
import { missingRecipeHint } from "./caption";
import { tr } from "./i18n";

export interface PastedContext {
  app: App;
  folder: string;
  extraProperties: [string, string][];
  format: NoteFormat;
}

/**
 * A caption that says "recipe in the bio" has no recipe: say so instead of an empty note or a request to the AI;
 * without a processor the text is split by offline rules (#15). undefined: not this case, the import goes on.
 */
export async function importPastedText(
  c: PastedContext,
  e: Detection,
  input: string,
  processor: ActiveProcessor | null,
): Promise<{ ok: boolean; message?: string } | undefined> {
  if (e.kind !== "text" || (processor && processor !== "ai")) return undefined;
  const ruled = recipeFromText(input);
  const hint = missingRecipeHint(input, !!(ruled?.ingredients.length || ruled?.steps.length), processor === "ai");
  if (hint) return { ok: false, message: tr(hint) };
  if (processor) return undefined;
  if (!ruled) return { ok: false, message: tr("textNoRecipe") };
  const saved = await saveRecipe(c.app, c.folder, ruled, {
    extraProperties: c.extraProperties,
    format: c.format,
    fromText: true,
  });
  return { ok: true, message: tr("savedFromText", { title: saved.title }) };
}

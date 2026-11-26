// Import with the user's own AI (issue #5): sends pasted text or the text of a page without recipe data to the
// configured AI, checks the answer (src/ai.ts) and writes the note itself, so it works without Git (issue #13).
// Runs only when the user submits a recipe. Writes only one new note and its cover image in the recipe folder.
import { requestUrl, type App } from "obsidian";
import { aiAnswer, aiRequest, material, recipeFromAnswer, type AiSettings } from "./ai";
import { loadPage, saveRecipe, type Saved } from "./localImport";
import { findPreviewImage, pageText } from "./schemaorg";
import type { NoteFormat } from "./noteFormat";
import { tr } from "./i18n";

export interface AiSource {
  /** Address of a page; its HTML if it was already loaded. */
  url?: string;
  html?: string;
  /** Pasted recipe text. */
  text?: string;
}

export async function importWithAi(
  app: App,
  folder: string,
  ai: AiSettings,
  key: string | null,
  source: AiSource,
  extraProperties: [string, string][],
  format: NoteFormat,
): Promise<Saved | { status: "fehler"; message: string }> {
  let content: string;
  let html = source.html;
  if (source.url) {
    if (html === undefined) {
      const page = await loadPage(source.url);
      if ("error" in page) return { status: "fehler", message: page.error };
      html = page.html;
    }
    content = material(pageText(html), source.url);
  } else content = material(source.text ?? "");

  let answer: ReturnType<typeof aiAnswer>;
  try {
    const res = await requestUrl(aiRequest(ai, key, content));
    let json: unknown = null;
    try {
      json = res.json;
    } catch {
      /* no JSON body */
    }
    answer = aiAnswer(ai.provider, res.status, json);
  } catch (e) {
    return {
      status: "fehler",
      message: tr("noConnection", { error: e instanceof Error ? e.message.slice(0, 80) : "" }),
    };
  }
  if (!answer.ok) return { status: "fehler", message: answer.message };
  const r = recipeFromAnswer(answer.text, source.url);
  if ("error" in r) return { status: "fehler", message: r.error };
  const coverUrl = source.url && html ? findPreviewImage(html, source.url) : undefined;
  return saveRecipe(app, folder, r.recipe, { source: source.url, coverUrl, extraProperties, format });
}

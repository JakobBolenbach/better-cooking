// Import with the user's own AI (issue #5): sends pasted text or the text of a page without recipe data to the
// configured AI, checks the answer (src/ai.ts) and writes the note itself, so it works without Git (issue #13).
// Runs only when the user submits a recipe. Writes only one new note and its cover image in the recipe folder.
import { requestUrl, type App } from "obsidian";
import { aiAnswer, aiRequest, material, recipeFromAnswer, type AiSettings } from "./ai";
import { loadPage, saveRecipe, type Saved } from "./localImport";
import { findPreviewImage, pageText } from "./schemaorg";
import type { NoteFormat } from "./noteFormat";
import type { Recipe } from "./types";
import { TRANSLATE_INSTRUCTIONS, translationFromAnswer, translationMaterial } from "./translate";
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

  const answer = await ask(ai, key, content);
  if (!answer.ok) return { status: "fehler", message: answer.message };
  const r = recipeFromAnswer(answer.text, source.url, format.lang);
  if ("error" in r) return { status: "fehler", message: r.error };
  const coverUrl = source.url && html ? findPreviewImage(html, source.url) : undefined;
  return saveRecipe(app, folder, r.recipe, { source: source.url, coverUrl, extraProperties, format });
}

/** Sends one request to the AI; the answer's text or a message in the UI language. */
async function ask(ai: AiSettings, key: string | null, content: string, system?: string) {
  try {
    const res = await requestUrl(aiRequest(ai, key, content, system));
    let json: unknown = null;
    try {
      json = res.json;
    } catch {
      /* no JSON body */
    }
    return aiAnswer(ai.provider, res.status, json);
  } catch (e) {
    return {
      ok: false as const,
      message: tr("noConnection", { error: e instanceof Error ? e.message.slice(0, 80) : "" }),
    };
  }
}

/** Translates a recipe into `language` as a new note linked to the original (issue #10). */
export async function translateWithAi(
  app: App,
  folder: string,
  ai: AiSettings,
  key: string | null,
  original: Recipe,
  language: string,
  extraProperties: [string, string][],
  format: NoteFormat,
): Promise<Saved | { status: "fehler"; message: string }> {
  const answer = await ask(ai, key, translationMaterial(original, language), TRANSLATE_INSTRUCTIONS);
  if (!answer.ok) return { status: "fehler", message: answer.message };
  const t = translationFromAnswer(answer.text, original);
  if ("error" in t) return { status: "fehler", message: t.error };
  return saveRecipe(app, folder, t.recipe, {
    source: original.source,
    image: original.image,
    extraProperties,
    format,
    translationOf: original.name,
    language: language.trim(),
  });
}

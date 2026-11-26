// Import of a recipe website inside the plugin: load the page, read the schema.org data, create cover image and note.
// Runs only when the user submits a link. No AI service, no third-party infrastructure.
// Writes only one new note in the recipe folder and its cover image in the folder's subfolder Bilder.
import { normalizePath, requestUrl, type App } from "obsidian";
import { todayIso } from "./parse";
import { isPublicAddress } from "./network";
import { fileName, importState, recipeNote } from "./recipeNote";
import { findRecipeJsonLd, findPreviewImage, recipeFromSchema, type SchemaRecipe } from "./schemaorg";
import { tr } from "./i18n";
import type { NoteFormat } from "./noteFormat";

export type LocalResult = Saved | { status: "keinSchema"; html: string } | { status: "fehler"; message: string };

const MAX_PAGE = 5_000_000;
const MAX_IMAGE = 15_000_000;
const IMAGE_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const pathIn = (folder: string, name: string) => normalizePath(folder ? `${folder}/${name}` : name);

export interface SaveOptions {
  /** Address of the source page; none for pasted text. */
  source?: string;
  /** Address of the cover image; fetched only from public hosts. */
  coverUrl?: string;
  extraProperties?: [string, string][];
  format?: NoteFormat;
}

export type Saved = { status: "gespeichert"; path: string; title: string; state: "fertig" | "teilweise" };

/** Loads a page as text (at most MAX_PAGE characters), or a message in the UI language. */
export async function loadPage(url: string): Promise<{ html: string } | { error: string }> {
  try {
    const res = await requestUrl({
      url,
      method: "GET",
      headers: { Accept: "text/html,application/xhtml+xml" },
      throw: false,
    });
    if (res.status >= 400) return { error: tr("pageError", { status: res.status }) };
    return { html: res.text.slice(0, MAX_PAGE) };
  } catch (e) {
    return { error: tr("pageUnreachable", { error: e instanceof Error ? e.message.slice(0, 80) : tr("unknown") }) };
  }
}

/** Creates the note (never overwrites) and its cover image in the recipe folder. */
export async function saveRecipe(app: App, folder: string, r: SchemaRecipe, o: SaveOptions): Promise<Saved> {
  await createFolder(app, folder);
  const name = freeName(app, folder, fileName(r.title));
  // Image addresses come from the page: do not fetch addresses on the local network (SECURITY.md).
  const image =
    o.coverUrl && isPublicAddress(o.coverUrl)
      ? await saveCoverImage(app, pathIn(folder, "Bilder"), name, o.coverUrl)
      : undefined;
  const path = pathIn(folder, `${name}.md`);
  const note = recipeNote(r, {
    source: o.source,
    image,
    today: todayIso(),
    extraProperties: o.extraProperties,
    format: o.format,
  });
  await app.vault.create(path, note);
  return { status: "gespeichert", path, title: r.title, state: importState(r) };
}

export async function importLocally(
  app: App,
  folder: string,
  url: string,
  extraProperties: [string, string][] = [],
  format?: NoteFormat,
): Promise<LocalResult> {
  const page = await loadPage(url);
  if ("error" in page) return { status: "fehler", message: page.error };
  const obj = findRecipeJsonLd(page.html);
  if (!obj) return { status: "keinSchema", html: page.html };
  const r = recipeFromSchema(obj, url, format?.lang);
  if (!r.ingredients.length && !r.steps.length) return { status: "keinSchema", html: page.html };
  const coverUrl = r.images[0] ?? findPreviewImage(page.html, url);
  return saveRecipe(app, folder, r, { source: url, coverUrl, extraProperties, format });
}

async function createFolder(app: App, folder: string) {
  if (folder && !app.vault.getFolderByPath(folder)) await app.vault.createFolder(folder);
}

/** "Brot", otherwise "Brot 2", "Brot 3" … */
function freeName(app: App, folder: string, name: string): string {
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? name : `${name} ${i}`;
    if (!app.vault.getAbstractFileByPath(pathIn(folder, `${candidate}.md`))) return candidate;
  }
  return `${name} ${Date.now()}`;
}

/** Loads the cover image; returns the link target, or undefined if that fails (the note is created anyway). */
async function saveCoverImage(app: App, imagesFolder: string, name: string, url: string): Promise<string | undefined> {
  try {
    const res = await requestUrl({ url, method: "GET", throw: false });
    if (res.status >= 400) return undefined;
    const mimeType = (res.headers["content-type"] ?? res.headers["Content-Type"] ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const extension = IMAGE_EXTENSION[mimeType];
    if (!extension || res.arrayBuffer.byteLength > MAX_IMAGE) return undefined;
    if (!app.vault.getFolderByPath(imagesFolder)) await app.vault.createFolder(imagesFolder);
    let file = `${name} Titelbild.${extension}`;
    for (let i = 2; app.vault.getAbstractFileByPath(`${imagesFolder}/${file}`); i++)
      file = `${name} Titelbild ${i}.${extension}`;
    await app.vault.createBinary(`${imagesFolder}/${file}`, res.arrayBuffer);
    return file;
  } catch {
    return undefined;
  }
}

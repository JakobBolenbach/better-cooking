// Import of a recipe website inside the plugin: load the page, read the schema.org data, create cover image and note.
// Runs only when the user submits a link ("Fetch again" also reads a page, and may add a changed cover image, see
// src/refetchService.ts). No AI service, no third-party infrastructure.
// Writes only one new note in the recipe folder and its cover image in the folder's subfolder Bilder.
import { normalizePath, requestUrl, type App, type TFile } from "obsidian";
import { todayIso } from "./parse";
import { isPublicAddress } from "./network";
import { firstFree } from "./folder";
import { fileName, importState, recipeNote } from "./recipeNote";
import { findRecipeMicrodata } from "./microdata";
import { findRecipeJsonLd, findPreviewImage, recipeFromSchema, type SchemaRecipe } from "./schemaorg";
import { tr } from "./i18n";
import type { NoteFormat, NoteLang } from "./noteFormat";

/** `unreachable`: no answer at all (network), as opposed to an error status of the page. */
export type LocalResult =
  Saved | { status: "keinSchema"; html: string } | { status: "fehler"; message: string; unreachable?: boolean };

export type Page = { html: string } | { error: string; unreachable?: boolean };

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
  /** Link target of an image already in the vault (translations reuse the original's cover). */
  image?: string;
  extraProperties?: [string, string][];
  format?: NoteFormat;
  /** For a translation: link target of the original and the new note's language. */
  translationOf?: string;
  language?: string;
}

/** `coverUrl`: the address of the cover image that was saved with the note, to remember it (issue #63). */
export type Saved = {
  status: "gespeichert";
  path: string;
  title: string;
  state: "fertig" | "teilweise";
  coverUrl?: string;
};

/** Loads a page as text (at most MAX_PAGE characters), or a message in the UI language. */
export async function loadPage(
  url: string,
  headers: Record<string, string> = { Accept: "text/html,application/xhtml+xml" },
): Promise<Page> {
  try {
    const res = await requestUrl({
      url,
      method: "GET",
      headers,
      throw: false,
    });
    if (res.status >= 400) return { error: tr("pageError", { status: res.status }) };
    return { html: res.text.slice(0, MAX_PAGE) };
  } catch (e) {
    return {
      error: tr("pageUnreachable", { error: e instanceof Error ? e.message.slice(0, 80) : tr("unknown") }),
      unreachable: true,
    };
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
      : o.image;
  const path = pathIn(folder, `${name}.md`);
  const note = recipeNote(r, {
    source: o.source,
    image,
    today: todayIso(),
    extraProperties: o.extraProperties,
    format: o.format,
    translationOf: o.translationOf,
    language: o.language,
  });
  await app.vault.create(path, note);
  const saved = image && image !== o.image ? o.coverUrl : undefined;
  return { status: "gespeichert", path, title: r.title, state: importState(r), coverUrl: saved };
}

export async function importLocally(
  app: App,
  folder: string,
  url: string,
  extraProperties: [string, string][] = [],
  format?: NoteFormat,
): Promise<LocalResult> {
  const page = await loadPage(url);
  if ("error" in page) return { status: "fehler", message: page.error, unreachable: page.unreachable };
  const read = recipeFromHtml(page.html, url, format?.lang);
  if (!read) return { status: "keinSchema", html: page.html };
  return saveRecipe(app, folder, read.recipe, { source: url, coverUrl: read.coverUrl, extraProperties, format });
}

/** The recipe in a page's schema.org data (JSON-LD or microdata) and its cover image address; undefined if none. */
export function recipeFromHtml(
  html: string,
  url: string,
  lang?: NoteLang,
): { recipe: SchemaRecipe; coverUrl?: string } | undefined {
  const obj = findRecipeJsonLd(html) ?? findRecipeMicrodata(html);
  if (!obj) return undefined;
  const recipe = recipeFromSchema(obj, url, lang);
  if (!recipe.ingredients.length && !recipe.steps.length) return undefined;
  return { recipe, coverUrl: recipe.images[0] ?? findPreviewImage(html, url) };
}

async function createFolder(app: App, folder: string) {
  if (folder && !app.vault.getFolderByPath(folder)) await app.vault.createFolder(folder);
}

/** "Brot", otherwise "Brot 2", "Brot 3" … */
function freeName(app: App, folder: string, name: string): string {
  return firstFree(
    (i) => (i === 1 ? name : `${name} ${i}`),
    (n) => !!app.vault.getAbstractFileByPath(pathIn(folder, `${n}.md`)),
  );
}

/** Downloads an image (public hosts only, known types, size limit); undefined if that fails. */
async function downloadImage(url: string): Promise<{ extension: string; data: ArrayBuffer } | undefined> {
  try {
    const res = await requestUrl({ url, method: "GET", throw: false });
    if (res.status >= 400) return undefined;
    const mimeType = (res.headers["content-type"] ?? res.headers["Content-Type"] ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const extension = IMAGE_EXTENSION[mimeType];
    if (!extension || res.arrayBuffer.byteLength > MAX_IMAGE) return undefined;
    return { extension, data: res.arrayBuffer };
  } catch {
    return undefined;
  }
}

async function storeImage(
  app: App,
  imagesFolder: string,
  name: string,
  img: { extension: string; data: ArrayBuffer },
): Promise<TFile | undefined> {
  try {
    if (!app.vault.getFolderByPath(imagesFolder)) await app.vault.createFolder(imagesFolder);
    const file = firstFree(
      (i) => `${name} Titelbild${i === 1 ? "" : ` ${i}`}.${img.extension}`,
      (n) => !!app.vault.getAbstractFileByPath(`${imagesFolder}/${n}`),
    );
    return await app.vault.createBinary(`${imagesFolder}/${file}`, img.data);
  } catch {
    return undefined;
  }
}

/** Loads the cover image; returns the link target, or undefined if that fails (the note is created anyway). */
async function saveCoverImage(app: App, imagesFolder: string, name: string, url: string): Promise<string | undefined> {
  const img = await downloadImage(url);
  return img && (await storeImage(app, imagesFolder, name, img))?.name;
}

const sameBytes = (a: ArrayBuffer, b: ArrayBuffer) => {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  return x.every((v, i) => v === y[i]);
};

/**
 * Cover image for "Fetch again": a new file next to the old one (which stays) if the page's image differs from the
 * current file's bytes; undefined to keep the current image. The caller removes the new file again if the note
 * cannot be written.
 */
export async function refreshCover(
  app: App,
  folder: string,
  name: string,
  url: string,
  current: TFile | null,
): Promise<TFile | undefined> {
  if (!isPublicAddress(url)) return undefined;
  const img = await downloadImage(url);
  if (!img) return undefined;
  if (current) {
    try {
      if (sameBytes(await app.vault.readBinary(current), img.data)) return undefined;
    } catch {
      /* unreadable: a new file is safer than none */
    }
  }
  return storeImage(app, pathIn(folder, "Bilder"), name, img);
}

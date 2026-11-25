// Import einer Rezeptseite direkt im Plugin: Seite laden, schema.org-Daten lesen, Titelbild und Notiz anlegen.
// Läuft nur, wenn der Nutzer einen Link absendet. Kein KI-Dienst, keine fremde Infrastruktur.
// Geschrieben werden nur eine neue Notiz im Rezeptordner und ihr Titelbild in dessen Unterordner Bilder.
import { normalizePath, requestUrl, type App } from "obsidian";
import { todayIso } from "./parse";
import { isPublicAddress } from "./network";
import { fileName, importState, recipeNote } from "./recipeNote";
import { findRecipeJsonLd, findPreviewImage, recipeFromSchema } from "./schemaorg";

export type LocalResult =
  | { status: "gespeichert"; path: string; title: string; state: "fertig" | "teilweise" }
  | { status: "keinSchema" }
  | { status: "fehler"; message: string };

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

export async function importLocally(
  app: App,
  folder: string,
  url: string,
  extraProperties: [string, string][] = [],
): Promise<LocalResult> {
  let html: string;
  try {
    const res = await requestUrl({
      url,
      method: "GET",
      headers: { Accept: "text/html,application/xhtml+xml" },
      throw: false,
    });
    if (res.status >= 400) return { status: "fehler", message: `Die Seite antwortet mit Fehler ${res.status}.` };
    html = res.text.slice(0, MAX_PAGE);
  } catch (e) {
    return {
      status: "fehler",
      message: `Seite nicht erreichbar (${e instanceof Error ? e.message.slice(0, 80) : "unbekannt"}).`,
    };
  }
  const obj = findRecipeJsonLd(html);
  if (!obj) return { status: "keinSchema" };
  const r = recipeFromSchema(obj, url);
  if (!r.ingredients.length && !r.steps.length) return { status: "keinSchema" };

  await createFolder(app, folder);
  const name = freeName(app, folder, fileName(r.title));
  const imageUrl = r.images[0] ?? findPreviewImage(html, url);
  // Bildadressen stammen von der Seite: keine Adressen im lokalen Netz abrufen (SECURITY.md).
  const image =
    imageUrl && isPublicAddress(imageUrl)
      ? await saveCoverImage(app, pathIn(folder, "Bilder"), name, imageUrl)
      : undefined;
  const path = pathIn(folder, `${name}.md`);
  await app.vault.create(path, recipeNote(r, { source: url, image, today: todayIso(), extraProperties }));
  return { status: "gespeichert", path, title: r.title, state: importState(r) };
}

async function createFolder(app: App, folder: string) {
  if (folder && !app.vault.getFolderByPath(folder)) await app.vault.createFolder(folder);
}

/** "Brot", sonst "Brot 2", "Brot 3" … */
function freeName(app: App, folder: string, name: string): string {
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? name : `${name} ${i}`;
    if (!app.vault.getAbstractFileByPath(pathIn(folder, `${candidate}.md`))) return candidate;
  }
  return `${name} ${Date.now()}`;
}

/** Lädt das Titelbild; gibt das Linkziel zurück oder undefined, wenn es nicht geht (die Notiz entsteht trotzdem). */
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

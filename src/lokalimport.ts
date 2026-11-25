// Import einer Rezeptseite direkt im Plugin: Seite laden, schema.org-Daten lesen, Titelbild und Notiz anlegen.
// Läuft nur, wenn der Nutzer einen Link absendet. Kein KI-Dienst, keine fremde Infrastruktur.
// Geschrieben werden nur eine neue Notiz im Rezeptordner und ihr Titelbild in dessen Unterordner Bilder.
import { normalizePath, requestUrl, type App } from "obsidian";
import { heuteIso } from "./parse";
import { oeffentlicheAdresse } from "./netz";
import { dateiname, importStand, rezeptNotiz } from "./rezeptnotiz";
import { findeRezeptJsonLd, findeVorschaubild, rezeptAusSchema } from "./schemaorg";

export type LokalErgebnis =
  | { status: "gespeichert"; pfad: string; titel: string; stand: "fertig" | "teilweise" }
  | { status: "keinSchema" }
  | { status: "fehler"; meldung: string };

const MAX_SEITE = 5_000_000;
const MAX_BILD = 15_000_000;
const BILD_ENDUNG: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const pfadIn = (ordner: string, name: string) => normalizePath(ordner ? `${ordner}/${name}` : name);

export async function lokalImportieren(
  app: App,
  ordner: string,
  url: string,
  zusatz: [string, string][] = [],
): Promise<LokalErgebnis> {
  let html: string;
  try {
    const res = await requestUrl({
      url,
      method: "GET",
      headers: { Accept: "text/html,application/xhtml+xml" },
      throw: false,
    });
    if (res.status >= 400) return { status: "fehler", meldung: `Die Seite antwortet mit Fehler ${res.status}.` };
    html = res.text.slice(0, MAX_SEITE);
  } catch (e) {
    return {
      status: "fehler",
      meldung: `Seite nicht erreichbar (${e instanceof Error ? e.message.slice(0, 80) : "unbekannt"}).`,
    };
  }
  const objekt = findeRezeptJsonLd(html);
  if (!objekt) return { status: "keinSchema" };
  const r = rezeptAusSchema(objekt, url);
  if (!r.zutaten.length && !r.schritte.length) return { status: "keinSchema" };

  await ordnerAnlegen(app, ordner);
  const name = freierName(app, ordner, dateiname(r.titel));
  const bildUrl = r.bilder[0] ?? findeVorschaubild(html, url);
  // Bildadressen stammen von der Seite: keine Adressen im lokalen Netz abrufen (SECURITY.md).
  const bild =
    bildUrl && oeffentlicheAdresse(bildUrl)
      ? await titelbildSpeichern(app, pfadIn(ordner, "Bilder"), name, bildUrl)
      : undefined;
  const pfad = pfadIn(ordner, `${name}.md`);
  await app.vault.create(pfad, rezeptNotiz(r, { quelle: url, bild, heute: heuteIso(), zusatz }));
  return { status: "gespeichert", pfad, titel: r.titel, stand: importStand(r) };
}

async function ordnerAnlegen(app: App, ordner: string) {
  if (ordner && !app.vault.getFolderByPath(ordner)) await app.vault.createFolder(ordner);
}

/** "Brot", sonst "Brot 2", "Brot 3" … */
function freierName(app: App, ordner: string, name: string): string {
  for (let i = 1; i < 100; i++) {
    const kandidat = i === 1 ? name : `${name} ${i}`;
    if (!app.vault.getAbstractFileByPath(pfadIn(ordner, `${kandidat}.md`))) return kandidat;
  }
  return `${name} ${Date.now()}`;
}

/** Lädt das Titelbild; gibt das Linkziel zurück oder undefined, wenn es nicht geht (die Notiz entsteht trotzdem). */
async function titelbildSpeichern(
  app: App,
  bilderOrdner: string,
  name: string,
  url: string,
): Promise<string | undefined> {
  try {
    const res = await requestUrl({ url, method: "GET", throw: false });
    if (res.status >= 400) return undefined;
    const typ = (res.headers["content-type"] ?? res.headers["Content-Type"] ?? "").split(";")[0].trim().toLowerCase();
    const endung = BILD_ENDUNG[typ];
    if (!endung || res.arrayBuffer.byteLength > MAX_BILD) return undefined;
    if (!app.vault.getFolderByPath(bilderOrdner)) await app.vault.createFolder(bilderOrdner);
    let datei = `${name} Titelbild.${endung}`;
    for (let i = 2; app.vault.getAbstractFileByPath(`${bilderOrdner}/${datei}`); i++)
      datei = `${name} Titelbild ${i}.${endung}`;
    await app.vault.createBinary(`${bilderOrdner}/${datei}`, res.arrayBuffer);
    return datei;
  } catch {
    return undefined;
  }
}

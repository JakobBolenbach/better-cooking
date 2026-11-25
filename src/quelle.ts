// Quelle eines neuen Rezepts erkennen (Link-Art, Weg der Verarbeitung) und Dubletten finden.
// Dieselben Regeln muss jeder Verarbeiter anwenden (docs/import-contract.md). Ändert sich eine Seite, beide anpassen.

export type Art = "instagram" | "tiktok" | "youtube" | "facebook" | "pinterest" | "webseite" | "text" | "leer";

export interface Erkennung {
  art: Art;
  /** Normierte Adresse (ohne Tracking, ohne #…), nur bei Links. */
  url?: string;
  /** Schlüssel für den Dublettenvergleich, z. B. "instagram:BcExample01" oder "chefkoch.de/rezepte/123". */
  schluessel?: string;
  /** Anzeige: "Instagram-Beitrag", "Rezeptseite chefkoch.de", "Eingefügter Text". */
  bezeichnung: string;
  /** Wie der Verarbeiter vorgeht, in einem Satz. */
  weg: string;
  /** Was dafür gebraucht wird. */
  braucht: ("schema" | "apify" | "ki")[];
}

const SOZIAL: Record<string, { art: Art; name: string }> = {
  "instagram.com": { art: "instagram", name: "Instagram-Beitrag" },
  "tiktok.com": { art: "tiktok", name: "TikTok-Video" },
  "vm.tiktok.com": { art: "tiktok", name: "TikTok-Video" },
  "youtube.com": { art: "youtube", name: "YouTube-Video" },
  "m.youtube.com": { art: "youtube", name: "YouTube-Video" },
  "youtu.be": { art: "youtube", name: "YouTube-Video" },
  "facebook.com": { art: "facebook", name: "Facebook-Beitrag" },
  "fb.watch": { art: "facebook", name: "Facebook-Video" },
  "pinterest.com": { art: "pinterest", name: "Pinterest-Pin" },
  "pinterest.de": { art: "pinterest", name: "Pinterest-Pin" },
  "pin.it": { art: "pinterest", name: "Pinterest-Pin" },
};

const WEGE: Record<Art, { weg: string; braucht: Erkennung["braucht"] }> = {
  webseite: {
    weg: "Rezeptdaten der Seite (schema.org) direkt lesen, ohne KI, und das Titelbild laden. Fehlen sie, übernimmt der Verarbeiter, falls eingerichtet.",
    braucht: ["schema"],
  },
  instagram: {
    weg: "Beschreibung und Vorschaubild über Apify holen, das Rezept daraus mit KI aufbereiten. Steht es nur im Video, meldet der Import das.",
    braucht: ["apify", "ki"],
  },
  tiktok: {
    weg: "Beschreibung und Vorschaubild über Apify holen, das Rezept daraus mit KI aufbereiten. Steht es nur im Video, meldet der Import das.",
    braucht: ["apify", "ki"],
  },
  facebook: {
    weg: "Beschreibung und Vorschaubild über Apify holen, das Rezept daraus mit KI aufbereiten.",
    braucht: ["apify", "ki"],
  },
  youtube: {
    weg: "Videobeschreibung und Vorschaubild über Apify holen, das Rezept daraus mit KI aufbereiten.",
    braucht: ["apify", "ki"],
  },
  pinterest: {
    weg: "Der Pin führt meist auf eine Rezeptseite: Ziel holen, dann wie eine Rezeptseite.",
    braucht: ["schema"],
  },
  text: { weg: "Den eingefügten Text mit KI in den festen Aufbau bringen.", braucht: ["ki"] },
  leer: { weg: "", braucht: [] },
};

/** Tracking-Parameter, die nie zum Rezept gehören. */
const TRACKING = /^(utm_\w*|fbclid|gclid|igsh|igshid|bqrl|si|feature|ref|ref_src|mc_cid|mc_eid|_ga|share|s)$/i;

function host(u: URL) {
  return u.hostname.toLowerCase().replace(/^www\./, "");
}

export function erkenneQuelle(eingabe: string): Erkennung {
  const roh = eingabe.trim();
  if (!roh) return { art: "leer", bezeichnung: "", ...WEGE.leer };
  const link =
    /^(https?:\/\/\S+)$/i.exec(roh) ??
    (/^\S+\.\S+\/\S*$/.test(roh) && !/\s/.test(roh) ? [roh, `https://${roh}`] : null);
  if (!link) return { art: "text", bezeichnung: "Eingefügter Text", ...WEGE.text };
  let u: URL;
  try {
    u = new URL(link[1]);
  } catch {
    return { art: "text", bezeichnung: "Eingefügter Text", ...WEGE.text };
  }
  const h = host(u);
  const sozial = SOZIAL[h] ?? Object.entries(SOZIAL).find(([d]) => h.endsWith("." + d))?.[1];
  const url = normiereUrl(u);
  const schluessel = schluesselAus(u);
  if (sozial) return { art: sozial.art, url, schluessel, bezeichnung: sozial.name, ...WEGE[sozial.art] };
  return { art: "webseite", url, schluessel, bezeichnung: `Rezeptseite ${h}`, ...WEGE.webseite };
}

/** Adresse ohne Tracking-Parameter und Sprungmarke; bei YouTube bleibt nur v. */
export function normiereUrl(u: URL): string {
  const n = new URL(u.toString());
  n.hash = "";
  const h = host(n);
  const behalten = new URLSearchParams();
  n.searchParams.forEach((v, k) => {
    if (h.includes("youtube.com") ? k === "v" : !TRACKING.test(k)) behalten.set(k, v);
  });
  n.search = behalten.toString() ? `?${behalten.toString()}` : "";
  return n.toString();
}

/** Schlüssel für Dubletten: Plattform plus ID, sonst Host plus Pfad ohne Schrägstrich am Ende. */
export function schluesselAus(u: URL): string {
  const h = host(u);
  const pfad = u.pathname.replace(/\/+$/, "");
  const teil = pfad.split("/").filter(Boolean);
  if (h.endsWith("instagram.com")) {
    const i = teil.findIndex((t) => ["p", "reel", "reels", "tv"].includes(t));
    if (i >= 0 && teil[i + 1]) return `instagram:${teil[i + 1]}`;
  }
  if (h.endsWith("tiktok.com")) {
    const i = teil.indexOf("video");
    if (i >= 0 && teil[i + 1]) return `tiktok:${teil[i + 1]}`;
  }
  if (h === "youtu.be" && teil[0]) return `youtube:${teil[0]}`;
  if (h.endsWith("youtube.com")) {
    const v = u.searchParams.get("v");
    if (v) return `youtube:${v}`;
    const i = teil.findIndex((t) => t === "shorts" || t === "live");
    if (i >= 0 && teil[i + 1]) return `youtube:${teil[i + 1]}`;
  }
  const behalten = new URLSearchParams();
  u.searchParams.forEach((v, k) => {
    if (!TRACKING.test(k)) behalten.set(k, v);
  });
  const q = behalten.toString();
  return `${h}${pfad.toLowerCase()}${q ? `?${q}` : ""}`;
}

/** Schlüssel einer gespeicherten Quelle (Text aus dem Frontmatter); ungültig → undefined. */
export function schluesselVon(quelle: string | undefined): string | undefined {
  if (!quelle) return undefined;
  try {
    return schluesselAus(new URL(quelle.trim()));
  } catch {
    return undefined;
  }
}

/** Erstes Rezept mit derselben Quelle. */
export function findeDublette<T extends { quelle?: string }>(e: Erkennung, rezepte: T[]): T | undefined {
  if (!e.schluessel) return undefined;
  return rezepte.find((r) => schluesselVon(r.quelle) === e.schluessel);
}

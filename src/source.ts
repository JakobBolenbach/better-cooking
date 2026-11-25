// Quelle eines neuen Rezepts erkennen (Link-Art, Weg der Verarbeitung) und Dubletten finden.
// Dieselben Regeln muss jeder Verarbeiter anwenden (docs/import-contract.md). Ändert sich eine Seite, beide anpassen.

export type Kind = "instagram" | "tiktok" | "youtube" | "facebook" | "pinterest" | "webseite" | "text" | "leer";

export interface Detection {
  kind: Kind;
  /** Normierte Adresse (ohne Tracking, ohne #…), nur bei Links. */
  url?: string;
  /** Schlüssel für den Dublettenvergleich, z. B. "instagram:BcExample01" oder "chefkoch.de/rezepte/123". */
  key?: string;
  /** Anzeige: "Instagram-Beitrag", "Rezeptseite chefkoch.de", "Eingefügter Text". */
  label: string;
  /** Wie der Verarbeiter vorgeht, in einem Satz. */
  processor: string;
  /** Was dafür gebraucht wird. */
  needs: ("schema" | "apify" | "ki")[];
}

const SOCIAL: Record<string, { kind: Kind; name: string }> = {
  "instagram.com": { kind: "instagram", name: "Instagram-Beitrag" },
  "tiktok.com": { kind: "tiktok", name: "TikTok-Video" },
  "vm.tiktok.com": { kind: "tiktok", name: "TikTok-Video" },
  "youtube.com": { kind: "youtube", name: "YouTube-Video" },
  "m.youtube.com": { kind: "youtube", name: "YouTube-Video" },
  "youtu.be": { kind: "youtube", name: "YouTube-Video" },
  "facebook.com": { kind: "facebook", name: "Facebook-Beitrag" },
  "fb.watch": { kind: "facebook", name: "Facebook-Video" },
  "pinterest.com": { kind: "pinterest", name: "Pinterest-Pin" },
  "pinterest.de": { kind: "pinterest", name: "Pinterest-Pin" },
  "pin.it": { kind: "pinterest", name: "Pinterest-Pin" },
};

const PROCESSORS: Record<Kind, { processor: string; needs: Detection["needs"] }> = {
  webseite: {
    processor:
      "Rezeptdaten der Seite (schema.org) direkt lesen, ohne KI, und das Titelbild laden. Fehlen sie, übernimmt der Verarbeiter, falls eingerichtet.",
    needs: ["schema"],
  },
  instagram: {
    processor:
      "Beschreibung und Vorschaubild über Apify holen, das Rezept daraus mit KI aufbereiten. Steht es nur im Video, meldet der Import das.",
    needs: ["apify", "ki"],
  },
  tiktok: {
    processor:
      "Beschreibung und Vorschaubild über Apify holen, das Rezept daraus mit KI aufbereiten. Steht es nur im Video, meldet der Import das.",
    needs: ["apify", "ki"],
  },
  facebook: {
    processor: "Beschreibung und Vorschaubild über Apify holen, das Rezept daraus mit KI aufbereiten.",
    needs: ["apify", "ki"],
  },
  youtube: {
    processor: "Videobeschreibung und Vorschaubild über Apify holen, das Rezept daraus mit KI aufbereiten.",
    needs: ["apify", "ki"],
  },
  pinterest: {
    processor: "Der Pin führt meist auf eine Rezeptseite: Ziel holen, dann wie eine Rezeptseite.",
    needs: ["schema"],
  },
  text: { processor: "Den eingefügten Text mit KI in den festen Aufbau bringen.", needs: ["ki"] },
  leer: { processor: "", needs: [] },
};

/** Tracking-Parameter, die nie zum Rezept gehören. */
const TRACKING = /^(utm_\w*|fbclid|gclid|igsh|igshid|bqrl|si|feature|ref|ref_src|mc_cid|mc_eid|_ga|share|s)$/i;

function host(u: URL) {
  return u.hostname.toLowerCase().replace(/^www\./, "");
}

export function detectSource(input: string): Detection {
  const raw = input.trim();
  if (!raw) return { kind: "leer", label: "", ...PROCESSORS.leer };
  const link =
    /^(https?:\/\/\S+)$/i.exec(raw) ??
    (/^\S+\.\S+\/\S*$/.test(raw) && !/\s/.test(raw) ? [raw, `https://${raw}`] : null);
  if (!link) return { kind: "text", label: "Eingefügter Text", ...PROCESSORS.text };
  let u: URL;
  try {
    u = new URL(link[1]);
  } catch {
    return { kind: "text", label: "Eingefügter Text", ...PROCESSORS.text };
  }
  const h = host(u);
  const social = SOCIAL[h] ?? Object.entries(SOCIAL).find(([d]) => h.endsWith("." + d))?.[1];
  const url = normalizeUrl(u);
  const key = keyFrom(u);
  if (social) return { kind: social.kind, url, key, label: social.name, ...PROCESSORS[social.kind] };
  return { kind: "webseite", url, key, label: `Rezeptseite ${h}`, ...PROCESSORS.webseite };
}

/** Adresse ohne Tracking-Parameter und Sprungmarke; bei YouTube bleibt nur v. */
export function normalizeUrl(u: URL): string {
  const n = new URL(u.toString());
  n.hash = "";
  const h = host(n);
  const keep = new URLSearchParams();
  n.searchParams.forEach((v, k) => {
    if (h.includes("youtube.com") ? k === "v" : !TRACKING.test(k)) keep.set(k, v);
  });
  n.search = keep.toString() ? `?${keep.toString()}` : "";
  return n.toString();
}

/** Schlüssel für Dubletten: Plattform plus ID, sonst Host plus Pfad ohne Schrägstrich am Ende. */
export function keyFrom(u: URL): string {
  const h = host(u);
  const path = u.pathname.replace(/\/+$/, "");
  const part = path.split("/").filter(Boolean);
  if (h.endsWith("instagram.com")) {
    const i = part.findIndex((t) => ["p", "reel", "reels", "tv"].includes(t));
    if (i >= 0 && part[i + 1]) return `instagram:${part[i + 1]}`;
  }
  if (h.endsWith("tiktok.com")) {
    const i = part.indexOf("video");
    if (i >= 0 && part[i + 1]) return `tiktok:${part[i + 1]}`;
  }
  if (h === "youtu.be" && part[0]) return `youtube:${part[0]}`;
  if (h.endsWith("youtube.com")) {
    const v = u.searchParams.get("v");
    if (v) return `youtube:${v}`;
    const i = part.findIndex((t) => t === "shorts" || t === "live");
    if (i >= 0 && part[i + 1]) return `youtube:${part[i + 1]}`;
  }
  const keep = new URLSearchParams();
  u.searchParams.forEach((v, k) => {
    if (!TRACKING.test(k)) keep.set(k, v);
  });
  const q = keep.toString();
  return `${h}${path.toLowerCase()}${q ? `?${q}` : ""}`;
}

/** Schlüssel einer gespeicherten Quelle (Text aus dem Frontmatter); ungültig → undefined. */
export function keyOf(source: string | undefined): string | undefined {
  if (!source) return undefined;
  try {
    return keyFrom(new URL(source.trim()));
  } catch {
    return undefined;
  }
}

/** Erstes Rezept mit derselben Quelle. */
export function findDuplicate<T extends { source?: string }>(e: Detection, recipes: T[]): T | undefined {
  if (!e.key) return undefined;
  return recipes.find((r) => keyOf(r.source) === e.key);
}

// Detect the source of a new recipe (kind of link, how it is processed) and find duplicates.
// Every processor must apply the same rules (docs/import-contract.md). If one side changes, change both.

import { tr, type Key } from "./i18n";

export type Kind = "instagram" | "tiktok" | "youtube" | "facebook" | "pinterest" | "webseite" | "text" | "leer";

export interface Detection {
  kind: Kind;
  /** Normalized address (without tracking, without #…), links only. */
  url?: string;
  /** Key for duplicate checks, e.g. "instagram:BcExample01" or "chefkoch.de/rezepte/123". */
  key?: string;
  /** Display in the UI language, e.g. "Instagram post", "Recipe website chefkoch.de", "Pasted text". */
  label: string;
  /** How the processor proceeds, in one sentence. */
  processor: string;
  /** What is needed for it. */
  needs: ("schema" | "apify" | "ki")[];
}

/** The one table of platform hosts: source detection, the social media import and its link filter all read it. */
const SOCIAL: Record<string, { kind: Kind; name: Key }> = {
  "instagram.com": { kind: "instagram", name: "srcInstagram" },
  "tiktok.com": { kind: "tiktok", name: "srcTiktok" },
  "vm.tiktok.com": { kind: "tiktok", name: "srcTiktok" },
  "youtube.com": { kind: "youtube", name: "srcYoutube" },
  "m.youtube.com": { kind: "youtube", name: "srcYoutube" },
  "youtu.be": { kind: "youtube", name: "srcYoutube" },
  "facebook.com": { kind: "facebook", name: "srcFacebookPost" },
  "fb.watch": { kind: "facebook", name: "srcFacebookVideo" },
  "pinterest.com": { kind: "pinterest", name: "srcPinterest" },
  "pinterest.de": { kind: "pinterest", name: "srcPinterest" },
  "pin.it": { kind: "pinterest", name: "srcPinterest" },
};

/** Kinds that are social media posts (processor or the plugin's own reader, src/socialFlow.ts). */
export const SOCIAL_KINDS: Kind[] = [...new Set(Object.values(SOCIAL).map((s) => s.kind))];

/** Hosts of the platforms' own media and short links; a link there is no link to a recipe. */
const PLATFORM_EXTRA = [
  "cdninstagram.com",
  "fb.me",
  "fb.com",
  "meta.com",
  "tiktokcdn.com",
  "tiktokcdn-eu.com",
  "tiktokv.com",
  "ytimg.com",
  "googlevideo.com",
  "pinimg.com",
];
/** Pinterest in every country: pinterest.de, pinterest.co.uk, pinterest.com.au … */
const PINTEREST = /(^|\.)pinterest\.[a-z]{2,3}(\.[a-z]{2})?$/;

/** Does a host belong to one of the platforms (all of them, not only the post's own)? */
export function isPlatformHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  const under = (d: string) => h === d || h.endsWith(`.${d}`);
  return Object.keys(SOCIAL).some(under) || PLATFORM_EXTRA.some(under) || PINTEREST.test(h);
}

const PROCESSORS: Record<Kind, { processor: Key | ""; needs: Detection["needs"] }> = {
  webseite: { processor: "procWebsite", needs: ["schema"] },
  instagram: { processor: "procSocialVideo", needs: ["apify", "ki"] },
  tiktok: { processor: "procSocialVideo", needs: ["apify", "ki"] },
  facebook: { processor: "procFacebook", needs: ["apify", "ki"] },
  youtube: { processor: "procYoutube", needs: ["apify", "ki"] },
  pinterest: { processor: "procPinterest", needs: ["schema"] },
  text: { processor: "procText", needs: ["ki"] },
  leer: { processor: "", needs: [] },
};

/** Detection fields for a kind, translated now (not at import time). */
function how(kind: Kind): Pick<Detection, "processor" | "needs"> {
  const p = PROCESSORS[kind];
  return { processor: p.processor ? tr(p.processor) : "", needs: p.needs };
}

/** Tracking parameters that never belong to a recipe. */
const TRACKING = /^(utm_\w*|fbclid|gclid|igsh|igshid|bqrl|si|feature|ref|ref_src|mc_cid|mc_eid|_ga|share|s)$/i;

function host(u: URL) {
  return u.hostname.toLowerCase().replace(/^www\./, "");
}

export function detectSource(input: string): Detection {
  const raw = input.trim();
  if (!raw) return { kind: "leer", label: "", ...how("leer") };
  const link =
    /^(https?:\/\/\S+)$/i.exec(raw) ??
    (/^\S+\.\S+\/\S*$/.test(raw) && !/\s/.test(raw) ? [raw, `https://${raw}`] : null);
  if (!link) return { kind: "text", label: tr("srcText"), ...how("text") };
  let u: URL;
  try {
    u = new URL(link[1]);
  } catch {
    return { kind: "text", label: tr("srcText"), ...how("text") };
  }
  const h = host(u);
  const social = SOCIAL[h] ?? Object.entries(SOCIAL).find(([d]) => h.endsWith("." + d))?.[1];
  const url = normalizeUrl(u);
  const key = keyFrom(u);
  if (social) return { kind: social.kind, url, key, label: tr(social.name), ...how(social.kind) };
  return { kind: "webseite", url, key, label: tr("srcWebsite", { host: h }), ...how("webseite") };
}

/** Address without tracking parameters and fragment; for YouTube only v stays. */
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

/** Key for duplicates: platform plus ID, otherwise host plus path without trailing slash. */
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

/** Key of a stored source (text from the frontmatter); invalid → undefined. */
export function keyOf(source: string | undefined): string | undefined {
  if (!source) return undefined;
  try {
    return keyFrom(new URL(source.trim()));
  } catch {
    return undefined;
  }
}

/** First recipe with the same source. */
export function findDuplicate<T extends { source?: string }>(e: Detection, recipes: T[]): T | undefined {
  if (!e.key) return undefined;
  return recipes.find((r) => keyOf(r.source) === e.key);
}

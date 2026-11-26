// Short titles and waiting times for instruction units (issue #62). A title is only taken from a verb the text itself
// contains; where the rules are unsure there is none. Durations are only taken from the clause they belong to.
// Pure functions, tested in tests/stepSplit.test.ts.
import { findTimes } from "./cooking";
import { upper, words } from "./sentences";

// ------------------------------------------------------------------ Clauses

export interface Clause {
  start: number;
  text: string;
}

/** The clauses of a unit: parts between commas, semicolons, "und", "oder" and "and". */
export function clausesOf(unit: string): Clause[] {
  const out: Clause[] = [];
  const sep = /\s*[,;]\s+|\s+(?:und|oder|and)\s+/g;
  let from = 0;
  for (let m = sep.exec(unit); m; m = sep.exec(unit)) {
    out.push({ start: from, text: unit.slice(from, m.index) });
    from = m.index + m[0].length;
  }
  out.push({ start: from, text: unit.slice(from).replace(/[.!?…]+$/, "") });
  return out.filter((c) => c.text.trim());
}

/** The only duration written in a text ("7 bis 10 Min."), without "ca."; undefined if none or several. */
export function onlyTime(text: string): string | undefined {
  const spots = findTimes(text);
  if (spots.length !== 1) return undefined;
  return spots[0].text.replace(/^(?:ca\.\s*|etwa\s*|about\s+|approx\.\s*)/i, "").trim();
}

// ------------------------------------------------------------------ Waiting times

const WAIT_VERBS =
  "gehen|ruhen|ziehen|quellen|abkühlen|auskühlen|abtropfen|durchziehen|aufgehen|rasten|stehen|trocknen|antrocknen|erkalten|auftauen|marinieren|einweichen|reifen|gären|fermentieren|entspannen|köcheln|simmern|schmoren|schmelzen";
const WAIT_DE = /\b(\p{Ll}{3,}(?:en|ln|rn))\s+lassen\b/iu;
/** "Lass den Teig 30 Min. ruhen" (du form). */
const WAIT_DU = new RegExp(`\\blasse?\\b.*?\\b(${WAIT_VERBS})\\b`, "iu");
const WAIT_COLD = /\b(kalt|kühl)\s+stellen\b/i;
const WAIT_EN = /\b(?:let|leave)\b.*?\b(rest|rise|proof|cool|chill|stand|sit|marinate|soak|set|simmer)\b/i;
const WAIT_EN_VERB = /^(rest|chill|refrigerate|marinate|proof|cool|soak)\b/i;
const WAIT_ONLY = new RegExp(`^(${WAIT_VERBS})\\b`, "iu");

export interface Wait {
  title: string;
  /** Index of the clause that waits, and the duration written in that clause only. */
  clause: number;
  time?: string;
}

function waitTitle(clause: string): string | undefined {
  const de = WAIT_DE.exec(clause);
  if (de && !/^(?:sich|fallen)$/i.test(de[1])) return `${upper(de[1].toLowerCase())} lassen`;
  const du = WAIT_DU.exec(clause);
  if (du) return `${upper(du[1].toLowerCase())} lassen`;
  const cold = WAIT_COLD.exec(clause);
  if (cold) return `${upper(cold[1].toLowerCase())} stellen`;
  const en = WAIT_EN.exec(clause);
  if (en) return upper(en[1].toLowerCase());
  const verb = WAIT_EN_VERB.exec(clause);
  if (verb) return upper(verb[1].toLowerCase());
  if (WAIT_ONLY.test(clause) && findTimes(clause).length) return upper(words(clause)[0].toLowerCase());
  return undefined;
}

/** The waiting clause of a unit, with its title and its own duration; undefined if the unit does not wait. */
export function waitOf(unit: string): Wait | undefined {
  const clauses = clausesOf(unit);
  for (const [i, c] of clauses.entries()) {
    const title = waitTitle(c.text);
    if (title) return { title, clause: i, time: onlyTime(c.text) };
  }
  return undefined;
}

// ------------------------------------------------------------------ Verbs

const VERBS_EN = new Set(
  (
    "add bake beat blend boil brown chill chop combine cook cool cover crack cream cut dice dissolve divide drain drizzle " +
    "fill finish flip fold fry garnish grate grease grill heat knead line marinate mash melt mix peel pour preheat press proof " +
    "reduce refrigerate remove rest rinse roast roll rub scoop season serve shape sift simmer slice soak spread sprinkle squeeze " +
    "stir strain stuff taste toast top toss transfer trim turn warm whip whisk wrap"
  ).split(" "),
);
export const SUBORDINATE =
  /^(?:wenn|sobald|bis|damit|nachdem|falls|während|solange|weil|dass|ob|wie|sodass|so dass|als|if|when|once|while|until|as soon as|after|before|unless)\b/i;
const MANNER_DE = new Set([
  "steif",
  "glatt",
  "weich",
  "fein",
  "grob",
  "goldbraun",
  "kräftig",
  "knusprig",
  "cremig",
  "schaumig",
]);
/** Verbs that say nothing about the action ("in die Form geben"): no title from them. */
const NOT_VERB = new Set([
  "worden",
  "gewesen",
  "sein",
  "werden",
  "haben",
  "können",
  "müssen",
  "sollen",
  "dürfen",
  "wollen",
  "lassen",
  "geben",
  "nehmen",
  "bringen",
  "legen",
  "stellen",
  "setzen",
]);
const PARTICIPLE =
  /^(?:(?:auf|an|ab|aus|ein|durch|zusammen|um|vor|zu|hin|her|weg|fest|los|mit|nach|bei|dar|über|unter)?ge)\p{Ll}{2,}en$/u;

const PARTICLES = new Set([
  "vor",
  "ab",
  "an",
  "auf",
  "aus",
  "ein",
  "zu",
  "um",
  "unter",
  "weg",
  "fest",
  "zusammen",
  "dazu",
  "hinzu",
]);
/** Du-form imperatives of cooking verbs: "Rühre" → "Rühren". The e-form of each infinitive plus a few safe short ones. */
const IMPERATIVE_VERBS =
  "rühren schlagen kneten mischen gießen schneiden erhitzen heizen backen kochen braten schälen würfeln hacken verrühren vermischen verkneten formen streichen bestreuen bestreichen decken zerdrücken pürieren würzen wenden füllen verteilen sieben schmelzen garen dünsten rösten abschmecken schütten rollen auswellen belegen glasieren".split(
    " ",
  );
const IMPERATIVE = new Map<string, string>();
for (const v of IMPERATIVE_VERBS) IMPERATIVE.set(`${v.slice(0, -2)}e`.toLowerCase(), v);
for (const [bare, v] of [
  ["rühr", "rühren"],
  ["misch", "mischen"],
  ["knet", "kneten"],
  ["schneid", "schneiden"],
  ["erhitz", "erhitzen"],
  ["heiz", "heizen"],
])
  IMPERATIVE.set(bare, v);
const IMPERATIVE_AUX = new Set(["gib", "gebe", "nimm", "nehme", "bringe", "bring", "lege", "stelle", "setze", "tue"]);

const lowerWord = (w?: string) => (w ?? "").toLowerCase().replace(/[^\p{L}]/gu, "");

function imperativeTitle(clause: string): string | undefined {
  const w = words(clause.replace(/[.!?…:]+$/, ""));
  const first = lowerWord(w[0]);
  const verb = IMPERATIVE.get(first);
  if (!verb) return undefined;
  const last = lowerWord(w.at(-1));
  // "Heize den Ofen vor" → "Vorheizen", "Gieße das Wasser ab" → "Abgießen"
  return upper(w.length > 2 && PARTICLES.has(last) ? `${last}${verb}` : verb);
}

/** The infinitive at the end of a German instruction clause ("Eier trennen" → "trennen"), with its manner word. */
function germanVerb(clause: string): string | undefined {
  const w = words(clause.replace(/[.!?…:]+$/, ""));
  const last = w.at(-1);
  if (!last || !/^\p{Ll}{3,}(?:en|ern|eln)$/u.test(last) || NOT_VERB.has(last) || PARTICIPLE.test(last))
    return undefined;
  const before = w.at(-2)?.toLowerCase();
  return upper(before && MANNER_DE.has(before) ? `${before} ${last}` : last);
}

function germanTitle(unit: string): string | undefined {
  for (const clause of unit.split(/\s*,\s+/)) {
    if (SUBORDINATE.test(clause)) continue;
    if (IMPERATIVE_AUX.has(lowerWord(words(clause)[0]))) return undefined;
    const first = clause.split(/\s+(?:und|oder)\s+/i)[0];
    const v = imperativeTitle(first) ?? germanVerb(first) ?? germanVerb(clause);
    if (v) return v;
  }
  return undefined;
}

function englishTitle(unit: string): string | undefined {
  const first = lowerWord(words(unit)[0]);
  return first && VERBS_EN.has(first) ? upper(first) : undefined;
}

/** The verb title of an action unit, without the waiting rules; undefined if unsure. */
export const verbTitle = (unit: string, en: boolean) => (en ? englishTitle(unit) : germanTitle(unit));

/** Short title for one action or waiting time, undefined if unsure. */
export function titleFor(unit: string, en: boolean): string | undefined {
  const title = waitOf(unit)?.title ?? verbTitle(unit, en);
  return title && words(title).length <= 4 ? title : undefined;
}

/** "Title (10 Min.)": the duration of the waiting clause, or the unit's only duration if the title's verb comes first. */
export function withDuration(title: string, unit: string, en: boolean): string {
  if (findTimes(title).length) return title;
  const wait = waitOf(unit);
  if (wait) return wait.time ? `${title} (${wait.time})` : title;
  const d = onlyTime(unit);
  if (!d) return title;
  // The time must not stand behind an "und" that follows the title's verb ("Ofen vorheizen und 25 Min. backen").
  const and = /\s(?:und|oder|and)\s/.exec(unit);
  const spot = findTimes(unit)[0];
  if (and && spot.start > and.index && verbTitle(unit.slice(0, and.index), en)) return title;
  return `${title} (${d})`;
}

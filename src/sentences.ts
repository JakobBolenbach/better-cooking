// Sentence and enumeration splitting for instructions (issue #62), plus the small text helpers the step modules share.
// Pure functions, tested in tests/stepSplit.test.ts.

export const upper = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const words = (s: string) => s.split(/\s+/).filter(Boolean);
export const closed = (s: string) => (/[.!?…:]$/.test(s) ? s : `${s}.`);

const ENGLISH_HINT = /\b(the|and|until|then|minutes?|add|with|into|over|bowl|oven|stir)\b/gi;
const GERMAN_HINT = /\b(und|die|der|das|den|dem|mit|bis|dann|minuten?|unter|auf|aus|ein|eine|im|in)\b/gi;
/** More English than German function words. Decided once per instruction text and passed on. */
export const looksEnglish = (s: string) => (s.match(ENGLISH_HINT)?.length ?? 0) > (s.match(GERMAN_HINT)?.length ?? 0);

/** Abbreviations that never end a sentence ("ca.", "z. B.", "EL" …); matched on the last characters before a dot. */
const ABBREVIATION =
  /(?:^|[\s(])(?:z\.\s?b|d\.\s?h|u\.\s?a|o\.\s?ä|v\.\s?a|i\.\s?d\.\s?r|e\.\s?g|i\.\s?e|ca|bzw|evtl|ggf|usw|etc|vgl|inkl|max|mind|min|mins|std|sek|sec|hr|hrs|el|tl|msp|pck|pkg|stk|nr|approx|vs|tbsp|tsp|oz|lb|lbs)\.$/i;
const TIME_ABBREVIATION = /(?:min|mins|std|sek|sec|hr|hrs)\.$/i;
/**
 * After "20 Min." a new sentence starts with a capital letter in English. In German nouns are capitalized too
 * ("10 Min. Wasser kochen"), so only words that are never a noun count.
 */
const GERMAN_STARTERS =
  /^(?:dann|danach|anschließend|anschliessend|nach|zum|zur|zuletzt|nun|jetzt|später|abschließend|schließlich|sobald|wenn|falls|dabei|die|der|das|den|dem|ein|eine|im|in|am|auf|mit|bei|für|aus|über|unter|vom|man|sie|er|es|alles)\b/i;
const OPENING = /^[\p{Lu}\d„"“([]/u;
const LOOK_BEHIND = 15;
const LOOK_AHEAD = 40;

/** Sentences of a text; abbreviations, decimal numbers and ordinals ("am 3. Tag", "z. B.") do not end one. */
export function splitSentences(text: string, english = looksEnglish(text)): string[] {
  const out: string[] = [];
  let start = 0;
  const re = /[.!?…]+(?=\s)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    const rest = text.slice(end, end + LOOK_AHEAD).trimStart();
    if (!OPENING.test(rest)) continue;
    if (m[0] === ".") {
      // Only the last characters matter; a cut-off word at the left edge must not look like an abbreviation.
      const tail = text
        .slice(Math.max(start, end - LOOK_BEHIND), end)
        .replace(/^\S*/, (w) => (end - LOOK_BEHIND > start ? " " : w));
      if (/\d\.$/.test(tail)) continue;
      if (ABBREVIATION.test(tail) && !(TIME_ABBREVIATION.test(tail) && (english || GERMAN_STARTERS.test(rest))))
        continue;
      // "z. B." and "d. h.": a lone letter before a capital letter with its own dot.
      if (/(?:^|\s)[a-zäöü]\.$/.test(tail) && /^[A-Za-zÄÖÜ]\./.test(rest)) continue;
    }
    out.push(text.slice(start, end).trim());
    start = end;
  }
  const last = text.slice(start).trim();
  if (last) out.push(last);
  return out;
}

/**
 * Inline enumeration "1) Eier trennen. 2) Zucker schlagen." → one part per number. The first number is 1 and stands at
 * the start of the text or after a colon, every further one follows the end of a sentence and counts on;
 * "Am 1. Tag … Am 2. Tag" and "Stufe 1" are no enumeration. Undefined if it is none.
 */
export function splitEnumeration(text: string): string[] | undefined {
  const marks: { at: number; from: number; n: number }[] = [];
  for (const m of text.matchAll(/(^|[.!?;:]\s+)\(?(\d{1,2})[.)]\s+(?=\p{Lu})/gu)) {
    const n = Number(m[2]);
    const punct = m[1].trim();
    const first = marks.length === 0;
    if (first ? n !== 1 || (punct !== "" && punct !== ":") : n !== marks.length + 1 || !/^[.!?;]$/.test(punct)) {
      if (first) continue;
      return undefined;
    }
    marks.push({ at: m.index + m[1].trimEnd().length, from: m.index + m[0].length, n });
  }
  if (marks.length < 2) return undefined;
  const head = text.slice(0, marks[0].at).trim();
  const parts = marks.map((k, i) => text.slice(k.from, i + 1 < marks.length ? marks[i + 1].at : undefined).trim());
  return [...(head ? [head] : []), ...parts];
}

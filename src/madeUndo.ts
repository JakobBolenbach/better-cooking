// "Made today" and its undo on the frontmatter of a note. Pure functions on the frontmatter object (tested in tests/madeUndo.test.ts).
// The raw values from before the click are kept, so Undo writes back exactly what was there, also an empty template line (null).
import { keyFor, type FieldId, type Fields } from "./noteFormat";

interface Saved {
  key: string;
  had: boolean;
  before: unknown;
  written: unknown;
}

export interface MadeToken {
  lastMade: Saved;
  updated: Saved;
}

function write(fm: Record<string, unknown>, fields: Fields, id: FieldId, value: unknown): Saved {
  const key = keyFor(fm, fields, id);
  const saved = { key, had: key in fm, before: fm[key], written: value };
  fm[key] = value;
  return saved;
}

/** Sets `lastMade` and `updated` to `today` and returns what is needed to undo it. */
export function markMade(fm: Record<string, unknown>, fields: Fields, today: string): MadeToken {
  return { lastMade: write(fm, fields, "lastMade", today), updated: write(fm, fields, "updated", today) };
}

function restore(fm: Record<string, unknown>, s: Saved): void {
  // A field the click created is removed again; one that existed (even empty: null) gets its raw value back.
  if (s.had) fm[s.key] = s.before;
  else delete fm[s.key];
}

/**
 * Takes the click back, but only while `lastMade` still holds what the click wrote (compare and set): if the note
 * was changed in the meantime, nothing is touched and the result is false. `updated` goes back too, if it is still ours.
 */
export function undoMade(fm: Record<string, unknown>, token: MadeToken): boolean {
  if (fm[token.lastMade.key] !== token.lastMade.written) return false;
  restore(fm, token.lastMade);
  if (fm[token.updated.key] === token.updated.written) restore(fm, token.updated);
  return true;
}

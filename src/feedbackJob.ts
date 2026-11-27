// The note's side of an improvement job that carries feedback (issue #120), pure: the note becomes "offen" with the new
// job ID like a first version (so the proposal finds it and the page says it is being improved), and what it was is
// kept in the job (`prevState`) to put it back if no improvement comes. Every write is a compare-and-set on the job
// ID the note had. Tested in tests/feedbackJob.test.ts.
import { markImproveFailed, rebindJob, withImportState, type Prev } from "./improve";
import { importStateFrom, keyFor, readField, type ImportState, type NoteFormat } from "./noteFormat";
import { joinNote, splitNote } from "./noteText";
import { readFrontmatter } from "./parse";

const STATES: readonly ImportState[] = ["offen", "fertig", "teilweise", "fehler"];

/** The import state and reason a note has now ("fertig" for a note without the field: nothing is wrong with it). */
export function stateOf(text: string, format: NoteFormat): Prev {
  const parsed = readFrontmatter(text).fm;
  const error = readField(parsed, format.fields, "importError");
  const state = importStateFrom(readField(parsed, format.fields, "importState"));
  return {
    state: STATES.includes(state as ImportState) ? (state as ImportState) : "fertig",
    ...(typeof error === "string" && error.trim() ? { error: error.trim() } : {}),
  };
}

/**
 * The note carrying the new job ID from `from` (compare-and-set), as an open improvement: `offen`, without a reason.
 * `prev` is what the note said before when that was not `offen` (a first version that is being improved has nothing to
 * put back). Null if the note no longer has `from`.
 */
export function bindJob(
  text: string,
  format: NoteFormat,
  from: string | undefined,
  to: string,
): { text: string; prev?: Prev } | null {
  const bound = rebindJob(text, format, from, to);
  if (bound === null) return null;
  const was = stateOf(text, format);
  if (was.state === "offen") return { text: bound };
  const open = withImportState(bound, format, "offen");
  return open === null ? null : { text: open, prev: was };
}

/**
 * Takes `bindJob` back when the processor clearly refused the job: only if the note still has the new ID and says
 * `offen`; the old job ID is written back, or the field is removed if there was none; the old state and reason too.
 */
export function unbindJob(
  text: string,
  format: NoteFormat,
  to: string,
  from: string | undefined,
  prev: Prev | undefined,
): string | null {
  const back = prev ? markImproveFailed(text, to, "", format, prev) : text;
  if (back === null) return null;
  if (from) return rebindJob(back, format, to, from);
  const { fm, head, sections } = splitNote(back);
  const parsed = readFrontmatter(back).fm;
  const job = readField(parsed, format.fields, "job");
  if (!fm || typeof job !== "string" || job.trim() !== to) return null;
  const key = keyFor(parsed, format.fields, "job");
  const eol = back.includes("\r\n") ? "\r\n" : "\n";
  return joinNote(
    fm.filter((l) => !l.startsWith(`${key}:`)),
    head,
    sections,
    eol,
  );
}

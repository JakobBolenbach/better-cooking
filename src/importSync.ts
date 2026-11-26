// While a processor job waits for its note, the plugin can ask the vault's Git plugin to sync, so the recipe shows up
// without waiting for the plugin's own interval. Pure rules, tested in tests/importSync.test.ts; the part that talks to
// Obsidian is src/importSyncService.ts.
import { jobFailed, WAIT_MIN } from "./processor";
import type { Job } from "./types";

/** The plugin asks for a sync this often while a job waits. */
export const SYNC_EVERY_MS = 20_000;
/** Two requests never come closer than this (interval, return to the foreground and the button together). */
export const SYNC_MIN_GAP_MS = 15_000;
/** From here on the card says that it waits for the sync (a run takes about 3.5 minutes). */
export const SYNC_HINT_MIN = 3;

/** Setting value: "auto" (Obsidian Git if present), "off", or the ID of a command. */
export const SYNC_AUTO = "auto";
export const SYNC_OFF = "off";
/** The command "Automatic" uses. */
export const AUTO_COMMAND = "obsidian-git:pull";

/** Is a job waiting for a note that arrives through Git, and still within its time limit? */
export function syncWanted(jobs: Pick<Job, "since" | "processor" | "error" | "errorKey">[], now: number): boolean {
  return jobs.some(
    (a) =>
      (a.processor === "claude" || a.processor === "github") && !jobFailed(a) && now - a.since <= WAIT_MIN * 60_000,
  );
}

/** May a request go out now? `lastAt` is the time of the last one (0: none yet). */
export function syncDue(lastAt: number, now: number): boolean {
  return now < lastAt || now - lastAt >= SYNC_MIN_GAP_MS;
}

/** The command to run: null if off, unknown or not installed. `available` are the command IDs that exist. */
export function resolveSyncCommand(setting: string, available: readonly string[]): string | null {
  if (setting === SYNC_OFF) return null;
  const id = setting === SYNC_AUTO || !setting ? AUTO_COMMAND : setting;
  return available.includes(id) ? id : null;
}

/** Commands for the dropdown: ID or name contains "pull" or "sync". */
export function syncCandidates<C extends { id: string; name: string }>(commands: readonly C[]): C[] {
  return commands
    .filter((c) => /pull|sync/i.test(c.id) || /pull|sync/i.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The card hints at the wait for the sync after SYNC_HINT_MIN minutes without a result. */
export const syncHintDue = (a: { since: number }, now: number) => now - a.since > SYNC_HINT_MIN * 60_000;

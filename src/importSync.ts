// While a processor job waits for its note, the plugin can ask the vault's Git plugin to sync, so the recipe shows up
// without waiting for the Git plugin's own interval. Pure rules, tested in tests/importSync.test.ts; the part that
// talks to Obsidian is src/importSyncService.ts.
import { jobFailed, jobTimedOut, WAIT_MIN } from "./processor";
import type { Job } from "./types";

/** Commands the plugin may run, and nothing else (a command of another plugin is run only from this list). */
export const SYNC_COMMANDS: readonly string[] = ["obsidian-git:pull"];

/** How often the plugin looks whether a sync is due; the pace below decides whether one runs. */
export const SYNC_TICK_MS = 10_000;
/** No automatic sync for a job in its first seconds: a run takes 2 to 5 minutes. */
export const AUTO_START_MS = 90_000;
/** Until this age of a job: one sync every AUTO_FAST_MS, after it every AUTO_SLOW_MS (until the time limit). */
export const AUTO_FAST_UNTIL_MS = 6 * 60_000;
export const AUTO_FAST_MS = 30_000;
export const AUTO_SLOW_MS = 60_000;
/** At most this many automatic syncs per job: as many as the pace gives from the start until the time limit. */
export const AUTO_MAX =
  Math.ceil((AUTO_FAST_UNTIL_MS - AUTO_START_MS) / AUTO_FAST_MS) +
  Math.ceil((WAIT_MIN * 60_000 - AUTO_FAST_UNTIL_MS) / AUTO_SLOW_MS);
/** Gap between two automatic syncs (interval and return to the foreground together). */
export const AUTO_GAP_MS = 25_000;
/** Returning to the foreground syncs from this age of a job. */
export const FOREGROUND_FROM_MS = 60_000;
/** The button "Sync now": gap between two syncs. */
export const MANUAL_GAP_MS = 5_000;
/** The card says that the recipe shows up after the next sync from this age (minutes). */
export const SYNC_HINT_MIN = 3;

export type SyncTrigger = "interval" | "foreground" | "manual";
type SyncJob = Pick<Job, "id" | "since" | "processor" | "error" | "errorKey" | "device">;

export interface SyncInput {
  trigger: SyncTrigger;
  jobs: readonly SyncJob[];
  /** ID of this device (null: unknown). */
  device: string | null;
  /** The setting "Sync during an import". */
  enabled: boolean;
  /** The allowed command that exists (resolveSyncCommand), or null. */
  command: string | null;
  /** Time of the last sync that was run (0: none yet). */
  lastAt: number;
  now: number;
  /** Automatic syncs so far per job ID. */
  counts: Readonly<Record<string, number>>;
  /** The browser says there is a connection (`navigator.onLine`). */
  online: boolean;
  /** IDs of jobs whose note is already in the vault; asked only when everything cheaper allows a sync. */
  arrived: () => ReadonlySet<string>;
}

export type SyncDecision =
  | { run: true; command: string; jobs: string[] }
  | { run: false; reason: "off" | "unavailable" | "offline" | "no-job" | "too-early" | "limit" | "lock" };

/** The allowed command that exists in the app, or null. `ids` are the IDs of all commands. */
export function resolveSyncCommand(ids: readonly string[]): string | null {
  return SYNC_COMMANDS.find((c) => ids.includes(c)) ?? null;
}

/** Job that arrives through Git, is not failed and not past its time limit. */
export function syncOpen(a: SyncJob, now: number): boolean {
  // The processor test is a safeguard: today every job has Claude or GitHub as processor.
  return (a.processor === "claude" || a.processor === "github") && !jobFailed(a) && !jobTimedOut(a, now);
}

/** Pause after the last sync for a job of this age. */
export const autoEvery = (age: number) => (age < AUTO_FAST_UNTIL_MS ? AUTO_FAST_MS : AUTO_SLOW_MS);

/** Locked: the last sync is too recent (a clock that went back never locks). */
const locked = (lastAt: number, now: number, gap: number) => now >= lastAt && now - lastAt < gap;

/**
 * Does a sync run now, and for which jobs? Automatic syncs (interval, foreground) only for jobs this device started,
 * not yet arrived, within the limit and their pace; the button works for every open job.
 */
export function syncDecision(i: SyncInput): SyncDecision {
  if (!i.enabled) return { run: false, reason: "off" };
  if (!i.command) return { run: false, reason: "unavailable" };
  if (!i.online) return { run: false, reason: "offline" };
  const open = i.jobs.filter((a) => syncOpen(a, i.now));
  if (i.trigger === "manual") {
    if (!open.length) return { run: false, reason: "no-job" };
    if (locked(i.lastAt, i.now, MANUAL_GAP_MS)) return { run: false, reason: "lock" };
    return { run: true, command: i.command, jobs: [] };
  }
  const mine = open.filter((a) => i.device !== null && a.device === i.device);
  if (!mine.length) return { run: false, reason: "no-job" };
  if (locked(i.lastAt, i.now, AUTO_GAP_MS)) return { run: false, reason: "lock" };
  const arrived = i.arrived();
  const own = mine.filter((a) => !arrived.has(a.id));
  if (!own.length) return { run: false, reason: "no-job" };
  const room = own.filter((a) => (i.counts[a.id] ?? 0) < AUTO_MAX);
  if (!room.length) return { run: false, reason: "limit" };
  const due = room.filter((a) => {
    const age = i.now - a.since;
    if (i.trigger === "foreground") return age >= FOREGROUND_FROM_MS;
    return age >= AUTO_START_MS && !locked(i.lastAt, i.now, autoEvery(age));
  });
  if (!due.length) return { run: false, reason: "too-early" };
  return { run: true, command: i.command, jobs: due.map((a) => a.id) };
}

/** The card hints at the wait for the sync from SYNC_HINT_MIN minutes on. */
export const syncHintDue = (a: { since: number }, now: number) => now - a.since > SYNC_HINT_MIN * 60_000;

/** The job on whose card the button "Sync now" sits: the first open one, so it shows once. */
export const syncButtonJob = (jobs: readonly SyncJob[], now: number) => jobs.find((a) => syncOpen(a, now))?.id;

/** What the service remembers between runs: time of the last sync and automatic syncs per job. */
export interface SyncState {
  lastAt: number;
  counts: Readonly<Record<string, number>>;
}

/** State after a decision was carried out: lock and counters only if the command really ran; the button counts no job. */
export function afterRun(state: SyncState, d: SyncDecision, ran: boolean, now: number): SyncState {
  if (!d.run || !ran) return state;
  const counts = { ...state.counts };
  for (const id of d.jobs) counts[id] = (counts[id] ?? 0) + 1;
  return { lastAt: now, counts };
}

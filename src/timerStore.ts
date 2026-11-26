// The timers of the plugin as a small store: keeps the list from src/timers.ts, saves it on every change, sets ONE
// timeout per running timer (no one-second interval for ringing) and reports the ones that are over. Everything
// that touches the outside (clock, storage, timeouts, the alert) is passed in, so it runs in tests and in the preview.
import {
  addMinute,
  cancelTimer,
  due,
  isRunning,
  markRang,
  pauseTimer,
  restoreTimers,
  resumeTimer,
  startTimer,
} from "./timers";
import type { Timer } from "./timers";

/** What the UI needs from the timers. */
export interface TimerApi {
  get(): Timer[];
  subscribe(listener: () => void): () => void;
  /** Start a timer; call it from the tap that starts it (sound and notifications may need that gesture). */
  start(label: string, recipePath: string, seconds: number): void;
  pause(id: string): void;
  resume(id: string): void;
  addMinute(id: string): void;
  /** Stop a timer, also one that is ringing. */
  stop(id: string): void;
}

export interface StoreDeps {
  now(): number;
  load(): unknown;
  save(list: Timer[]): void;
  setTimer(run: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** A timer was started by the user. */
  onStart?(): void;
  /** Timers that are over now (once each); `late` is how long ago the first of them ended. */
  onDue(fired: Timer[], late: number): void;
}

/** The longest delay a timeout takes (about 24.8 days); longer ones wait in steps. */
const MAX_DELAY = 2 ** 31 - 1;

export class TimerStore implements TimerApi {
  private list: Timer[];
  private handles = new Map<string, unknown>();
  private listeners = new Set<() => void>();

  constructor(private deps: StoreDeps) {
    this.list = restoreTimers(deps.load(), deps.now());
  }

  get = () => this.list;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  /** Report what ended while nobody looked (a restart, a hidden window) and set the timeouts. Also the "look again". */
  check() {
    const now = this.deps.now();
    const fired = due(this.list, now);
    if (!fired.length) {
      this.schedule();
      return;
    }
    this.set(
      markRang(
        this.list,
        fired.map((t) => t.id),
        now,
      ),
    );
    this.deps.onDue(fired, now - Math.min(...fired.map((t) => t.endAt)));
  }

  /** Stop all timeouts (plugin unload). */
  dispose() {
    for (const h of this.handles.values()) this.deps.clearTimer(h);
    this.handles.clear();
    this.listeners.clear();
  }

  start(label: string, recipePath: string, seconds: number) {
    const now = this.deps.now();
    const id = `${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    this.deps.onStart?.();
    this.set(startTimer(this.list, { id, label, recipePath }, seconds, now));
  }
  pause = (id: string) => this.set(pauseTimer(this.list, id, this.deps.now()));
  resume = (id: string) => this.set(resumeTimer(this.list, id, this.deps.now()));
  addMinute = (id: string) => this.set(addMinute(this.list, id, this.deps.now()));
  stop = (id: string) => this.set(cancelTimer(this.list, id));

  private set(next: Timer[]) {
    if (next === this.list) return;
    this.list = next;
    this.deps.save(next);
    this.schedule();
    for (const l of [...this.listeners]) l();
  }

  /** One timeout per running timer. */
  private schedule() {
    for (const h of this.handles.values()) this.deps.clearTimer(h);
    this.handles.clear();
    const now = this.deps.now();
    for (const t of this.list.filter(isRunning))
      this.handles.set(
        t.id,
        this.deps.setTimer(() => this.check(), Math.min(MAX_DELAY, Math.max(0, t.endAt - now))),
      );
  }
}

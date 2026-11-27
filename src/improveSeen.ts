// When a proposal file was first seen on this device, kept in Obsidian's local storage (not synchronised), so the
// waiting times of src/improveService.ts survive a restart. File times are no help: a pull sets them as it likes. Small
// and bounded: at most MAX paths (200: a card that waits a day must not lose its time), the oldest go first; storage that fails only means the times start again.
import type { App } from "obsidian";

const KEY = "better-cooking-improve-seen";
/** The second use: when the note of a proposal arrived after the proposal waited (#156), so a restart keeps the grace. */
export const ARRIVED_KEY = "better-cooking-improve-arrived";
const MAX = 200;

export class SeenStore {
  private times: Record<string, number> | undefined;

  constructor(
    private app: App,
    private key = KEY,
  ) {}

  private load(): Record<string, number> {
    if (this.times) return this.times;
    this.times = {};
    try {
      const v: unknown = JSON.parse(String(this.app.loadLocalStorage(this.key) ?? "{}"));
      if (v && typeof v === "object" && !Array.isArray(v))
        for (const [k, t] of Object.entries(v)) if (typeof t === "number") this.times[k] = t;
    } catch {
      // Nothing known: the times start now.
    }
    return this.times;
  }

  private save() {
    const t = this.load();
    const keep = Object.entries(t)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX);
    this.times = Object.fromEntries(keep);
    try {
      this.app.saveLocalStorage(this.key, JSON.stringify(this.times));
    } catch {
      // A time that is not remembered is only looked at again.
    }
  }

  /** The time the path was first seen; now (and remembered) if it was not seen before. */
  first(path: string, now = Date.now()): number {
    const t = this.load();
    if (t[path] === undefined) {
      t[path] = now;
      this.save();
    }
    return t[path];
  }

  /** The time the path was first seen, without remembering it now; undefined if it never was. */
  peek(path: string): number | undefined {
    return this.load()[path];
  }

  forget(path: string) {
    const t = this.load();
    if (t[path] !== undefined) {
      delete t[path];
      this.save();
    }
  }
}

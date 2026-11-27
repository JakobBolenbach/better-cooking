// data.json of the plugin lies in the vault and is synchronised, so it changes outside of the plugin (#90). This class
// reads and writes it in one chain and merges (src/settingsMerge.ts) whenever the file differs from what this device
// last read or wrote. Without Obsidian: load, save and the settings in memory are passed in (tests/settingsSync.test.ts).
import type { Settings } from "./settings";
import { applyExternal, changedKeys } from "./settingsMerge";
import { migrateSettings } from "./migrate";
import { DEFAULTS } from "./settings";

export interface SettingsIo {
  load(): Promise<unknown>;
  save(s: Settings): Promise<void>;
  get(): Settings;
  set(s: Settings): void;
  /** The merge changed these settings in memory (language, views, settings tab are the caller's business). */
  changed(keys: string[]): void;
}

export class SettingsSync {
  /** The state of data.json this device last read or wrote: the base of the merge. */
  private base: Settings | null = null;
  /** Writes and merges run one after the other, so a save during a merge loses nothing. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private io: SettingsIo) {}

  /** The state read from data.json at load (after anything done to it in memory that is not in the file). A deep copy: the memory is changed in place at times, and the base must not follow. */
  setBase(s: Settings) {
    this.base = structuredClone(s);
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.chain.then(job, job);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** Reads the file and merges it into memory; null: nothing usable. The snapshots come after the read. */
  private async merge(onlyIfDiffers: boolean) {
    let raw: unknown;
    try {
      raw = await this.io.load();
    } catch {
      console.debug("Better Cooking: data.json could not be read");
      return null;
    }
    const local = this.io.get();
    const base = this.base ?? local;
    if (onlyIfDiffers && !changedKeys(base, { ...DEFAULTS, ...migrateSettings(raw) }).length) return null;
    const r = applyExternal(base, local, raw);
    if (!r) return null;
    this.io.set(r.settings);
    if (r.changed.length) this.io.changed(r.changed);
    return r;
  }

  /**
   * Writes the current settings (the latest state at the time it runs) to data.json. If the file changed since this
   * device last read or wrote it, it is merged first, so the write does not undo the other device's change.
   */
  write(): Promise<void> {
    return this.enqueue(async () => {
      await this.merge(true);
      const s = this.io.get();
      await this.io.save(s);
      this.base = structuredClone(s);
    });
  }

  /**
   * data.json changed by another device or program (Obsidian may also call this after the plugin's own write: then
   * nothing differs and nothing happens). Errors stay quiet: the file is read again at the next change.
   */
  onExternal(): Promise<void> {
    return this.enqueue(async () => {
      try {
        const r = await this.merge(false);
        if (!r) return;
        // This device has something the file lacks: write it, so the other devices get it too.
        if (r.behind) await this.io.save(r.settings);
        this.base = structuredClone(r.settings);
      } catch {
        console.debug("Better Cooking: data.json could not be merged");
      }
    });
  }
}

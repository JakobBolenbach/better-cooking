// A value kept on this device in Obsidian's local storage (not synchronised, not in data.json). Both calls must not throw.
import type { App } from "obsidian";

export interface LocalStore {
  load(): unknown;
  save(value: unknown): void;
}

export function localStore(app: App, key: string): LocalStore {
  return {
    load: () => app.loadLocalStorage(key) as unknown,
    save: (value) => app.saveLocalStorage(key, value),
  };
}

// Remembering the cover address of a note, so "Fetch again" loads a new image only when it changed (#63).
import type { Settings } from "./settings";

/** Remembering the address must never turn a written note into a failure (the dialog would report an error, the user retries). */
export async function rememberCoverUrl(
  plugin: { settings: Pick<Settings, "coverUrls">; save: (s: Partial<Settings>) => Promise<void> },
  path: string,
  url?: string,
): Promise<void> {
  if (!url) return;
  try {
    await plugin.save({ coverUrls: { ...plugin.settings.coverUrls, [path]: url } });
  } catch (e) {
    console.error("Better Cooking: could not remember the cover address", e);
  }
}

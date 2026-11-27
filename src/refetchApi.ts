// What the recipe page's "Fetch again" dialog calls, built from the Obsidian side (src/refetchService.ts). Kept apart
// so the wiring can be tested: the dialog's "Replace your edit" choice must reach `Refetcher.apply`.
import type { Refetcher } from "./refetchService";
import type { RefetchApi } from "./ui/refetchModal";

export function refetchApi(
  refetcher: Pick<Refetcher, "preview" | "cancel" | "apply">,
  notify: (m: string) => void,
): RefetchApi {
  return {
    preview: (path, useAi) => refetcher.preview(path, useAi),
    cancel: (path) => refetcher.cancel(path),
    apply: async (path, replace) => {
      const r = await refetcher.apply(path, replace);
      if (r.ok && r.message) notify(r.message);
      return r;
    },
  };
}

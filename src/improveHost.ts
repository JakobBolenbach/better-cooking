// What the App gets for improvement proposals: the review dialog's calls, the cards for proposals without a recipe and
// what to do with them. Wiring only; the rules are in src/improveService.ts.
import type { ImproveService } from "./improveService";
import { refetchApi } from "./refetchApi";
import type { ImproveHost } from "./ui/improveBanner";

export function improveHost(service: ImproveService, notify: (message: string) => void): ImproveHost {
  return {
    api: {
      ...refetchApi(service, notify),
      discard: async (path) => {
        const r = await service.discard(path);
        if (r.message) notify(r.message);
        return r;
      },
    },
    orphans: service.orphanList(),
    onOrphan: async (path, what) => {
      const r = await service.orphan(path, what);
      if (r.message) notify(r.message);
    },
  };
}

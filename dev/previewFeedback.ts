// Feedback on a recipe (issue #120) of the preview without Obsidian: the pretend AI answers with the example page
// (the merge is the real one). ?feedback=ki (default), claude or keine picks the way that is "set up".
import { feedbackWays, materialOf } from "../src/feedback";
import { planRefetch } from "../src/refetch";
import { DEFAULT_FORMAT } from "../src/noteFormat";
import { parseRecipe, todayIso } from "../src/parse";
import type { SchemaRecipe } from "../src/schemaorg";
import type { FeedbackApi } from "../src/ui/feedbackPanel";

export function previewFeedback(o: {
  texts: Map<string, string>;
  page: (path: string) => SchemaRecipe;
  mode: string | null;
}): FeedbackApi {
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return {
    way: (r) =>
      feedbackWays(r, { ownAi: o.mode !== "claude" && o.mode !== "keine", claude: o.mode === "claude", github: false }),
    preview: async (path) => {
      await pause(500);
      const text = o.texts.get(path)!;
      const plan = planRefetch(text, o.page(path), { format: DEFAULT_FORMAT, today: todayIso(), replace: [] });
      const feedback = materialOf(parseRecipe(path, text));
      return { ok: true as const, changes: plan.changes, via: "ai" as const, feedback, edited: plan.edited };
    },
    send: async () => {
      await pause(400);
      return { ok: true };
    },
  };
}

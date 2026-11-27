// @vitest-environment jsdom
// A first version that a processor improves (#133): the badge on its card and the line on its page.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { Card } from "../src/ui/overview";
import { ImprovingLine } from "../src/ui/improvingLine";
import { setLanguage } from "../src/i18n";
import type { Job, RecipeView } from "../src/types";

const job = (o: Partial<Job> = {}): Job => ({
  id: "rz-a-0001",
  input: "https://www.instagram.com/p/ABC123/",
  kind: "instagram",
  since: Date.now(),
  processor: "claude",
  improve: true,
  ...o,
});
const recipe = (o: object): RecipeView =>
  ({ path: "R/Brot.md", title: "Brot", status: "ausprobieren", importState: "offen", imageSrcs: [], ...o }) as never;

let root: HTMLElement;
beforeEach(() => {
  setLanguage("de");
  root = document.createElement("div");
  document.body.append(root);
});
afterEach(() => {
  render(null, root);
  root.remove();
  setLanguage("en");
});
const show = (node: preact.VNode) => act(() => void render(node, root));

describe("the card of a first version", () => {
  it("shows the badge instead of the import warning while the job is open", async () => {
    await show(<Card r={recipe({ improving: { job: job() } })} onClick={() => undefined} />);
    expect(root.querySelector(".rz-marke-verbessert")?.textContent).toContain("Wird verbessert");
    expect(root.textContent).not.toContain("noch offen");
  });
  it("shows the import warning for a first version that is no longer improved", async () => {
    await show(<Card r={recipe({ importState: "teilweise" })} onClick={() => undefined} />);
    expect(root.querySelector(".rz-marke-verbessert")).toBeNull();
    expect(root.querySelector(".rz-marke-import")?.textContent).toContain("teilweise");
  });
});

describe("the line on the page of a first version", () => {
  it("says who improves it and offers the session and Sync now", async () => {
    await show(
      <ImprovingLine
        improving={{ job: job({ session: "https://claude.ai/code/s1" }) }}
        onSyncNow={() => Promise.resolve({ ran: false, found: [] })}
      />,
    );
    expect(root.textContent).toContain("Claude verbessert dieses Rezept gerade");
    expect(root.querySelector<HTMLAnchorElement>("a")?.getAttribute("href")).toBe("https://claude.ai/code/s1");
    expect(root.textContent).toContain("Jetzt synchronisieren");
  });
  it("has no session link and no button where there is none", async () => {
    await show(<ImprovingLine improving={{ job: job() }} />);
    expect(root.querySelector("a")).toBeNull();
    expect(root.querySelector("button")).toBeNull();
  });
  it("offers Sync now only while the sync still waits for the job (not reserved, not failed, not late)", async () => {
    const run = () => Promise.resolve({ ran: false, found: [] });
    for (const o of [{ starting: "s1" as const }, { errorKey: "noImprovementArrived" as const }, { since: 1 }]) {
      await show(<ImprovingLine improving={{ job: job(o) }} onSyncNow={run} />);
      expect(root.textContent).toContain("Claude verbessert");
      expect(root.querySelector("button")).toBeNull();
    }
  });
  it("makes only the text a live region", async () => {
    await show(
      <ImprovingLine improving={{ job: job() }} onSyncNow={() => Promise.resolve({ ran: false, found: [] })} />,
    );
    const regions = root.querySelectorAll("[role=status]");
    expect(regions).toHaveLength(1);
    expect(regions[0].querySelector("button")).toBeNull();
  });
  it("shows nothing before the job is known", async () => {
    await show(<ImprovingLine improving={{}} />);
    expect(root.textContent).toBe("");
  });
});

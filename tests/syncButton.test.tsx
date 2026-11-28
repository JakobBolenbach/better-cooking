// @vitest-environment jsdom
// The button "Pull now" (#163): name and description, the visible wait, the honest result, and the sentence without Git.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { SyncButton } from "../src/ui/syncButton";
import { ImprovingLine } from "../src/ui/improvingLine";
import { setLanguage } from "../src/i18n";
import type { SyncReport } from "../src/importSync";
import type { Job } from "../src/types";

const job = (o: Partial<Job> = {}): Job => ({
  id: "rz-a-0001",
  input: "https://example.com/rezept",
  kind: "web",
  since: Date.now() - 4 * 60_000,
  processor: "claude",
  ...o,
});

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
const button = () => root.querySelector("button") as HTMLButtonElement;
const press = async () => {
  await act(() => void button().click());
};

describe("Pull now", () => {
  it("is named for what it does, with a description", async () => {
    await show(<SyncButton a={job()} run={() => Promise.resolve({ ran: true, found: [] })} />);
    expect(button().textContent).toContain("Jetzt abrufen");
    expect(button().title).toBe("Holt neue Dateien über Obsidian Git (Pull)");
    expect(button().getAttribute("aria-label")).toContain("Holt neue Dateien über Obsidian Git (Pull)");
  });

  it("is off with a spinner and a visible state while it waits, and on again after", async () => {
    let done: (r: SyncReport) => void = () => undefined;
    await show(<SyncButton a={job()} run={() => new Promise<SyncReport>((r) => (done = r))} />);
    await press();
    expect(button().disabled).toBe(true);
    expect(button().textContent).toContain("Wird abgerufen");
    expect(root.querySelector(".rz-dreht")).not.toBeNull();
    done({ ran: true, found: ["rz-a-0001"] });
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(button().disabled).toBe(false);
    expect(button().textContent).toContain("Jetzt abrufen");
    // The note is there: the notice and the changed card say it, not this line.
    expect(root.querySelector(".rz-auftrag-ergebnis")).toBeNull();
  });

  it("says that Claude has probably not finished", async () => {
    await show(<SyncButton a={job()} run={() => Promise.resolve({ ran: true, found: [] })} />);
    await press();
    expect(root.textContent).toContain("Abgerufen. Claude hat noch nichts geschickt, er arbeitet vermutlich noch.");
  });

  it("says that the GitHub Action may not be finished", async () => {
    await show(<SyncButton a={job({ processor: "github" })} run={() => Promise.resolve({ ran: true, found: [] })} />);
    await press();
    expect(root.textContent).toContain("Die Action ist vielleicht noch nicht fertig.");
  });

  it("after a recent pull it says when to try again, not that one is running", async () => {
    await show(
      <SyncButton a={job()} run={() => Promise.resolve({ ran: false, reason: "lock", retryIn: 4, found: [] })} />,
    );
    await press();
    expect(root.textContent).toContain("Gerade abgerufen, nichts Neues. Neuer Versuch in 4 s");
    expect(root.textContent).not.toContain("läuft bereits");
  });

  it("offline keeps its clear text", async () => {
    await show(<SyncButton a={job()} run={() => Promise.resolve({ ran: false, reason: "offline", found: [] })} />);
    await press();
    expect(root.textContent).toContain("Kein Netz.");
  });

  it("speaks English too", async () => {
    setLanguage("en");
    await show(<SyncButton a={job({ processor: "github" })} run={() => Promise.resolve({ ran: true, found: [] })} />);
    expect(button().textContent).toContain("Pull now");
    await press();
    expect(root.textContent).toContain("The Action may not be finished.");
  });
});

describe("without Obsidian Git", () => {
  it("hides the button and says how the recipe arrives", async () => {
    await show(<ImprovingLine improving={{ job: job() }} />);
    expect(root.querySelector("button")).toBeNull();
    expect(root.textContent).toContain("Das Rezept kommt mit deiner Synchronisierung auf dieses Gerät.");
  });
  it("says nothing of it in the first minutes", async () => {
    await show(<ImprovingLine improving={{ job: job({ since: Date.now() }) }} />);
    expect(root.textContent).not.toContain("Synchronisierung auf dieses Gerät");
  });
});

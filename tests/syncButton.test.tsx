// @vitest-environment jsdom
// The button "Pull now" (#163): name and description, the visible wait, the honest result, and the sentence without Git.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    const hint = root.querySelector(`#${button().getAttribute("aria-describedby")}`);
    expect(hint?.textContent).toBe("Holt neue Dateien über Obsidian Git (Pull)");
    expect(button().getAttribute("aria-label")).toBeNull();
  });

  it("shows 'pulling' while the command runs, then waits with a usable button", async () => {
    let done: (r: SyncReport) => void = () => undefined;
    let phase: (p: "pulling" | "waiting") => void = () => undefined;
    await show(
      <SyncButton
        a={job()}
        run={(ph) => {
          phase = ph ?? phase;
          return new Promise<SyncReport>((r) => (done = r));
        }}
      />,
    );
    await press();
    expect(button().getAttribute("aria-disabled")).toBe("true");
    expect(button().disabled).toBe(false);
    expect(button().textContent).toContain("Wird abgerufen");
    expect(root.querySelector(".rz-dreht")).not.toBeNull();
    await act(() => phase("waiting"));
    expect(button().getAttribute("aria-disabled")).toBe("false");
    expect(button().textContent).toContain("Jetzt abrufen");
    expect(root.querySelector("[role=status]")?.textContent).toContain("Warte auf das Rezept");
    expect(button().getAttribute("aria-busy")).toBe("true");
    // aria-busy is not on an ancestor of the live region.
    expect(root.querySelector("[aria-busy=true] [role=status]")).toBeNull();
    done({ ran: true, found: ["rz-a-0001"] });
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(button().getAttribute("aria-busy")).toBe("false");
    expect(root.querySelector("[role=status]")?.textContent).toBe("");
  });

  it("keeps the focus on the button while it works", async () => {
    await show(<SyncButton a={job()} run={() => new Promise<SyncReport>(() => undefined)} />);
    button().focus();
    await press();
    expect(document.activeElement).toBe(button());
  });

  it("says that the note is already there, tells a failure note and an improvement apart", async () => {
    const done = () => Promise.resolve({ ran: false, already: { done: ["rz-a-0001"], failed: [] }, found: [] });
    await show(<SyncButton a={job()} run={done} />);
    await press();
    expect(root.textContent).toContain("Die Notiz ist schon da.");
    await show(<SyncButton a={job({ improve: true })} run={done} />);
    await press();
    expect(root.textContent).toContain("Die Verbesserung ist schon da.");
    const failed = () => Promise.resolve({ ran: false, already: { done: [], failed: ["rz-a-0001"] }, found: [] });
    await show(<SyncButton a={job()} run={failed} />);
    await press();
    expect(root.textContent).toContain("Die Notiz zum gescheiterten Import ist schon da.");
  });

  it("a second press while pulling runs nothing", async () => {
    let calls = 0;
    await show(
      <SyncButton
        a={job()}
        run={() => {
          calls++;
          return new Promise<SyncReport>(() => undefined);
        }}
      />,
    );
    await press();
    await press();
    expect(calls).toBe(1);
  });

  it("waits for the improvement on the line of a first version", async () => {
    let phase: (p: "pulling" | "waiting") => void = () => undefined;
    await show(
      <SyncButton
        a={job({ improve: true })}
        run={(ph) => {
          phase = ph ?? phase;
          return new Promise<SyncReport>(() => undefined);
        }}
      />,
    );
    await press();
    await act(() => phase("waiting"));
    expect(root.querySelector("[role=status]")?.textContent).toContain("Warte auf die Verbesserung");
  });

  it("says that Claude has probably not finished", async () => {
    await show(<SyncButton a={job()} run={() => Promise.resolve({ ran: true, found: [] })} />);
    await press();
    expect(root.textContent).toContain(
      "Abruf gestartet. Noch nichts da: Claude arbeitet vermutlich noch, oder der Abruf braucht länger.",
    );
  });

  it("says that the GitHub Action may not be finished", async () => {
    await show(<SyncButton a={job({ processor: "github" })} run={() => Promise.resolve({ ran: true, found: [] })} />);
    await press();
    expect(root.textContent).toContain(
      "Die GitHub-Action ist vielleicht noch nicht fertig, oder der Abruf braucht länger.",
    );
  });

  it("after a recent pull it says when to try again, not that one is running", async () => {
    await show(
      <SyncButton a={job()} run={() => Promise.resolve({ ran: false, reason: "lock", retryIn: 4, found: [] })} />,
    );
    await press();
    expect(root.textContent).toContain("Es wurde gerade abgerufen. Versuch es in 4 s noch einmal.");
    expect(root.textContent).not.toContain("nichts Neues");
  });

  it("hides the line about the lock when a new try is possible", async () => {
    vi.useFakeTimers();
    try {
      await show(
        <SyncButton a={job()} run={() => Promise.resolve({ ran: false, reason: "lock", retryIn: 4, found: [] })} />,
      );
      await press();
      expect(root.textContent).toContain("Versuch es in 4 s");
      await act(() => void vi.advanceTimersByTime(200)); // lets the effect set its timer
      await act(() => void vi.advanceTimersByTime(4_000));
      expect(root.textContent).not.toContain("Versuch es in");
    } finally {
      vi.useRealTimers();
    }
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
    expect(root.textContent).toContain("the GitHub Action may not be finished");
  });
});

describe("without Obsidian Git", () => {
  it("hides the button and says how the recipe arrives", async () => {
    await show(<ImprovingLine improving={{ job: job() }} />);
    expect(root.querySelector("button")).toBeNull();
    expect(root.textContent).toContain("Die Verbesserung kommt mit deiner Synchronisierung auf dieses Gerät.");
  });
  it("says nothing of it in the first minutes", async () => {
    await show(<ImprovingLine improving={{ job: job({ since: Date.now() }) }} />);
    expect(root.textContent).not.toContain("kommt mit deiner Synchronisierung");
  });
});

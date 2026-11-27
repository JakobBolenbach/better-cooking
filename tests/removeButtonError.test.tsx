// @vitest-environment jsdom
// A failing removal keeps the question open and says why; reopening clears the message.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { RemoveButton } from "../src/ui/removeButton";
import { setLanguage } from "../src/i18n";

let root: HTMLElement;
beforeEach(() => {
  setLanguage("en");
  root = document.createElement("div");
  document.body.append(root);
});
afterEach(() => {
  render(null, root);
  root.remove();
});

describe("RemoveButton", () => {
  it("shows the error in the open question when onRemove throws", async () => {
    await act(
      () => void render(<RemoveButton names={["Brot"]} onRemove={() => Promise.reject(new Error("locked"))} />, root),
    );
    await act(async () => root.querySelector("button")!.click());
    const yes = root.querySelectorAll<HTMLButtonElement>("button")[0];
    await act(async () => yes.click());
    await act(async () => undefined);
    expect(root.querySelector("[role=alert]")?.textContent).toContain("locked");
    expect(root.querySelector("[role=alertdialog]")).not.toBeNull();
    expect(yes.disabled).toBe(false);
  });
});

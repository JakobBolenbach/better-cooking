// @vitest-environment jsdom
// An exception from the import must end the run and show a message (the dialog used to spin forever).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { ImportModal } from "../src/ui/jobs";
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

describe("ImportModal", () => {
  it("shows the error and stops running when onImport throws", async () => {
    const modal = (
      <ImportModal
        recipes={[]}
        jobs={[]}
        processor={null}
        onImport={() => Promise.reject(new Error("File already exists."))}
        onCloseView={() => undefined}
        onOpenNote={() => undefined}
        actions={{} as never}
      />
    );
    await act(() => void render(modal, root));
    const area = root.querySelector("textarea")!;
    await act(() => {
      area.value = "https://www.bbcgoodfood.com/recipes/banana-bread";
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const button = root.querySelector<HTMLButtonElement>(".rz-knopf-haupt")!;
    await act(async () => button.click());
    await act(async () => undefined);
    expect(root.textContent).toContain("File already exists.");
    expect(root.querySelector(".rz-dreht")).toBeNull();
    expect(button.disabled).toBe(false);
  });
});

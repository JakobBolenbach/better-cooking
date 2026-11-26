// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { h, render } from "preact";
import { Modal } from "../src/ui/shared";

describe("dialog footer (issue #56)", () => {
  it("is the last element of the dialog, outside the scrolling part", () => {
    const root = document.createElement("div");
    render(
      h(
        Modal,
        { title: "T", id: "t", onCloseView: () => {}, footer: h("button", null, "OK"), children: null },
        h("p", null, "text"),
      ),
      root,
    );
    const dialog = root.querySelector(".rz-fenster")!;
    expect(dialog.lastElementChild?.classList.contains("rz-fenster-fuss")).toBe(true);
    expect(dialog.querySelector(".rz-fenster-inhalt")?.contains(dialog.querySelector(".rz-fenster-fuss"))).toBe(false);
  });
  it("is only ever made by Modal, so no dialog can put content below its buttons", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "../src/ui");
    const users = readdirSync(dir)
      .filter((f) => f.endsWith(".tsx") && readFileSync(join(dir, f), "utf8").includes("rz-fenster-fuss"))
      .sort();
    expect(users).toEqual(["shared.tsx"]);
  });
});

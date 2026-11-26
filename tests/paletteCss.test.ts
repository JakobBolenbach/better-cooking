import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression for #43: the Obsidian palette block must beat the kitchen dark block in specificity, whatever the order.
const css = readFileSync(new URL("../src/plugin.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const selectorOf = (needle: string) =>
  css
    .split("{")
    .map((x) => x.split("}").pop()!.trim())
    .find((x) => x.startsWith(needle))!;
// Specificity (classes + attributes) of a simple selector without pseudo-classes.
const weight = (sel: string) => (sel.match(/\.[\w-]+|\[[^\]]+\]/g) ?? []).length;

describe("palette CSS", () => {
  it("Obsidian palette outranks the kitchen dark block", () => {
    const obsidian = selectorOf('.rz-root[data-rz-palette="obsidian"]');
    const dark = selectorOf('.rz-root[data-rz-theme="dunkel"]');
    expect(weight(obsidian)).toBeGreaterThan(weight(dark));
  });
});

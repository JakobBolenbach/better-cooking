import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

// Obsidian's `button:hover` would turn buttons grey; src/plugin.css gives them back what they have at rest through
// --rz-bg / --rz-shadow (comment above the reset rule). A pragmatic check: every rule of a class used on a <button>
// that sets a background or shadow at rest follows the pattern.
const css = readFileSync(new URL("../src/plugin.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const dir = new URL("../src/ui/", import.meta.url);
const source = readdirSync(dir)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => readFileSync(new URL(f, dir), "utf8"))
  .join("\n");

const buttonClasses = new Set<string>();
for (const chunk of source.split("<button").slice(1)) {
  const end = chunk.indexOf("</button");
  const part = chunk.slice(0, end < 0 ? 600 : end);
  const attr = /class=(\{[^\n]*|"[^"]*")/.exec(part)?.[1] ?? "";
  for (const c of attr.matchAll(/(?<![\w-])(rz-[\w-]+)/g)) buttonClasses.add(c[1]);
}

describe("button styles in plugin.css", () => {
  it("find the button classes", () => {
    expect(buttonClasses.has("rz-knopf")).toBe(true);
    expect(buttonClasses.has("rz-karte")).toBe(true);
  });

  it("name background and shadow at rest in --rz-bg / --rz-shadow", () => {
    const bad: string[] = [];
    let withBackground = 0;
    for (const m of css.matchAll(/(^|\})\s*([^{}@]+)\{([^{}]*)\}/g)) {
      const selector = m[2].trim();
      const body = m[3];
      if (/:(hover|active|focus|focus-visible|focus-within)\b/.test(selector)) continue;
      const last = selector.split(",").map((s) => s.trim().split(/\s+/).pop()!);
      const onButton = last.some(
        (s) => /(^|\W)button\b/.test(s) || [...s.matchAll(/\.(rz-[\w-]+)/g)].some((c) => buttonClasses.has(c[1])),
      );
      if (!onButton) continue;
      const bg = /(?:^|[\s;])background(?:-color)?:\s*([^;]+);/.exec(body);
      if (bg) withBackground++;
      if (bg && !/^var\(--rz-bg\)$/.test(bg[1].trim())) bad.push(`${selector}: background ${bg[1]}`);
      if (bg && !/--rz-bg:/.test(body)) bad.push(`${selector}: background without --rz-bg`);
      const shadow = /(?:^|[\s;])box-shadow:\s*([^;]+);/.exec(body);
      if (shadow && !/^var\(--rz-shadow\)$/.test(shadow[1].trim())) bad.push(`${selector}: box-shadow ${shadow[1]}`);
    }
    expect(withBackground).toBeGreaterThanOrEqual(8);
    expect(bad).toEqual([]);
  });
});

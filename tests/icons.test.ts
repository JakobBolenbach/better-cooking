// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { h, render } from "preact";
import { Icon, P, type IconName } from "../src/ui/icons";
import old from "./fixtures/icons-old.json";

// icons-old.json holds the markup strings from before the shapes became data.
function describeNodes(root: Element): string[] {
  return [...root.children].map((el) => {
    const attrs = [...el.attributes].map((a) => `${a.name}=${a.value}`).sort();
    return `${el.tagName.toLowerCase()} ${attrs.join(" ")}`;
  });
}

describe("icons", () => {
  const names = Object.keys(old);
  it("has the same icon names as before", () => {
    expect(Object.keys(P).sort()).toEqual([...names].sort());
  });
  it.each(names)("renders %s like the old markup", (name) => {
    const host = document.createElement("div");
    render(h(Icon, { n: name as IconName }), host);
    const svg = host.querySelector("svg")!;
    const markup = `<svg xmlns="http://www.w3.org/2000/svg">${(old as Record<string, string>)[name]}</svg>`;
    const ref = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
    expect(describeNodes(svg)).toEqual(describeNodes(ref));
    expect(svg.children.length).toBeGreaterThan(0);
  });
});

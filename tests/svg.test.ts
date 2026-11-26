// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sanitizeSvg as sanitizeSvgNode } from "../src/ui/svg";

/** Markup of the sanitized node ("" for input that is not SVG). */
const sanitizeSvg = (input: string) => sanitizeSvgNode(input)?.outerHTML ?? "";

const svg = (inner: string, attr = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" width="300" height="100"${attr}>${inner}</svg>`;

describe("sanitizeSvg", () => {
  it("keeps drawing elements, classes and viewBox, removes width and height", () => {
    const off = sanitizeSvg(svg('<g class="phase"><rect x="1" y="1" width="5" height="2"/><text>Teig</text></g>'));
    expect(off).toContain('class="phase"');
    expect(off).toContain("<rect");
    expect(off).toContain("Teig");
    expect(off).toContain('viewBox="0 0 10 10"');
    expect(off).not.toMatch(/<svg[^>]*\swidth=/);
    expect(off).not.toMatch(/<svg[^>]*\sheight=/);
  });

  it("removes event attributes, also without quotes", () => {
    const off = sanitizeSvg(svg('<rect onclick="alert(1)"/>', " onload=alert(1)"));
    expect(off).not.toMatch(/onload|onclick|alert/);
  });

  it("removes image, use, a, script, style, foreignObject, animate and set", () => {
    const off = sanitizeSvg(
      svg(
        '<image xlink:href="x" onerror="alert(1)"/><use href="#a"/><a href="javascript:alert(1)"><rect/></a>' +
          "<script>alert(1)</script><style>*{}</style><foreignObject><div/></foreignObject>" +
          '<animate attributeName="href" to="javascript:alert(1)"/><set attributeName="onclick" to="alert(1)"/>',
      ),
    );
    expect(off).not.toMatch(/image|<use|<a[\s>]|script|style|foreignObject|animate|<set|alert|javascript/i);
  });

  it("removes references and styles with external URLs, keeps internal references", () => {
    const off = sanitizeSvg(
      svg('<rect style="fill:url(https://x.test/a)"/><rect fill="url(#verlauf)"/><path href="https://x.test"/>'),
    );
    expect(off).not.toContain("x.test");
    expect(off).toContain('fill="url(#verlauf)"');
  });

  it("returns nothing for input that is not SVG", () => {
    expect(sanitizeSvg("<html><script>alert(1)</script></html>")).toBe("");
    expect(sanitizeSvg("kein xml <")).toBe("");
    expect(sanitizeSvgNode("kein xml <")).toBeNull();
  });
});

describe("sanitizeSvg as a node", () => {
  it("returns an SVG element without script elements and event attributes", () => {
    const node = sanitizeSvgNode(svg('<script>alert(1)</script><rect onclick="alert(1)" class="a"/>', ' onload="x()"'));
    expect(node?.localName).toBe("svg");
    expect(node?.querySelector("script")).toBeNull();
    expect(node?.querySelector("rect")?.getAttribute("onclick")).toBeNull();
    expect(node?.querySelector("rect")?.getAttribute("class")).toBe("a");
    expect(node?.getAttribute("onload")).toBeNull();
  });
});

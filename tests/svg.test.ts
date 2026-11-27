// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sanitizeSvg as sanitizeSvgNode } from "../src/ui/svg";

/** Markup of the sanitized node ("" for input that is not SVG). */
const sanitizeSvg = (input: string) => sanitizeSvgNode(input)?.outerHTML ?? "";

/** For hostile input that must still give a graphic: the output is not empty and starts with <svg. */
const sanitized = (input: string) => {
  const off = sanitizeSvg(input);
  expect(off.startsWith("<svg")).toBe(true);
  return off;
};

const svg = (inner: string, attr = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" width="300" height="100"${attr}>${inner}</svg>`;

describe("sanitizeSvg", () => {
  it("keeps drawing elements, classes and viewBox, removes width and height", () => {
    const off = sanitized(svg('<g class="phase ink"><rect x="1" y="1" width="5" height="2"/><text>Teig</text></g>'));
    expect(off).toContain('class="ink"');
    expect(off).toContain("<rect");
    expect(off).toContain("Teig");
    expect(off).toContain('viewBox="0 0 10 10"');
    expect(off).not.toMatch(/<svg[^>]*\swidth=/);
    expect(off).not.toMatch(/<svg[^>]*\sheight=/);
  });

  it("removes event attributes on the root and on elements", () => {
    const off = sanitized(svg('<rect onclick="alert(1)"/>', ' onload="alert(1)"'));
    expect(off).not.toMatch(/onload|onclick|alert/);
  });

  it("gives nothing for malformed markup such as attributes without quotes", () => {
    expect(sanitizeSvgNode(svg("<rect onclick=alert(1)/>"))).toBeNull();
  });

  it("removes image, use, a, script, style, foreignObject, animate and set", () => {
    const off = sanitized(
      svg(
        '<image xlink:href="x" onerror="alert(1)"/><use href="#a"/><a href="javascript:alert(1)"><rect/></a>' +
          "<script>alert(1)</script><style>*{}</style><foreignObject><div/></foreignObject>" +
          '<animate attributeName="href" to="javascript:alert(1)"/><set attributeName="onclick" to="alert(1)"/>',
      ),
    );
    expect(off).not.toMatch(/image|<use|<a[\s>]|script|style|foreignObject|animate|<set|alert|javascript/i);
  });

  it("removes references and styles with external URLs, keeps internal references", () => {
    const off = sanitized(
      svg('<rect style="fill:url(https://x.test/a)"/><rect fill="url(#verlauf)"/><path href="https://x.test"/>'),
    );
    expect(off).not.toContain("x.test");
    expect(off).toMatch(/fill="url\(#rz-svg-\d+-verlauf\)"/);
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
    expect(node?.querySelector("rect")?.getAttribute("class")).toBeNull();
    expect(node?.getAttribute("onload")).toBeNull();
  });
});

describe("sanitizeSvg allow-list", () => {
  const XLINK = 'xmlns:x="http://www.w3.org/1999/xlink"';

  it("removes style attributes, also with escaped url( and image-set", () => {
    for (const style of [
      "fill:u\\rl(https://x.test/a)",
      "fill:u\\72l(https://x.test/a)",
      "background:image-set('https://x.test/a' 1x)",
      "background:-webkit-image-set(url(https://x.test/a) 1x)",
      "fill:red",
    ]) {
      const off = sanitized(svg(`<rect style="${style}" class="aktiv"/>`));
      expect(off).not.toMatch(/style|x\.test|image-set/);
      expect(off).toContain('class="aktiv"');
    }
  });

  it("removes paint attributes with anything but a color, none, currentColor or a local url(#id)", () => {
    const off = sanitized(
      svg(
        '<rect id="a" fill="u\\rl(https://x.test/a)"/><rect id="b" fill="image-set(x 1x)"/><rect id="c" stroke="url(#g) red"/>' +
          '<rect id="d" fill="#00b49b" stroke="rgb(1, 2, 3)"/><rect id="e" fill="none" stroke="currentColor"/>' +
          '<rect id="f" fill="url(\'#g\')"/>',
      ),
    );
    expect(off).not.toMatch(/x\.test|image-set|url\(#g\) red/);
    expect(off).toContain('fill="#00b49b"');
    expect(off).toContain('stroke="rgb(1, 2, 3)"');
    expect(off).toContain('fill="none" stroke="currentColor"');
    expect(off).toMatch(/url\('#rz-svg-\d+-g'\)/);
  });

  it("removes links with an own namespace prefix and other attributes outside the list", () => {
    const off = sanitized(
      svg('<rect x:href="https://x.test" data-x="1" filter="url(#f)" tabindex="0" x="1"/>', ` ${XLINK}`),
    );
    expect(off).not.toMatch(/href|x\.test|data-x|filter|tabindex|xmlns:x/);
    expect(off).toContain('x="1"');
  });

  it("removes elements in a foreign namespace with their children", () => {
    const off = sanitized(svg('<foo xmlns="http://evil.test/ns"><rect id="in"/></foo><rect id="out"/>'));
    expect(off).not.toMatch(/foo|evil|id="in"/);
    expect(off).toMatch(/id="rz-svg-\d+-out"/);
  });

  it("removes attributes in a foreign namespace, keeps xmlns and aria", () => {
    const off = sanitized(svg('<rect xmlns:e="http://evil.test/ns" e:x="1" aria-label="Teig" role="img"/>'));
    expect(off).not.toMatch(/evil|e:x/);
    expect(off).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(off).toContain('aria-label="Teig"');
    expect(off).toContain('role="img"');
  });

  it("keeps only classes of the palette, tokenwise, and none on the root", () => {
    const off = sanitized(
      svg('<rect class="rz-fenster-grund aktiv"/><rect class="rz-root"/>', ' class="rz-fenster-grund grund"'),
    );
    expect(off).not.toMatch(/rz-fenster|rz-root/);
    expect(off).toContain('class="aktiv"');
    expect(off).not.toMatch(/^<svg[^>]*class=/);
  });

  it("prefixes ids per graphic and rewrites local references", () => {
    const one = sanitized(svg('<defs><linearGradient id="g"/></defs><rect fill="url(#g)"/>'));
    const two = sanitized(svg('<defs><linearGradient id="g"/></defs>'));
    const id = (t: string) => /id="(rz-svg-\d+-g)"/.exec(t)?.[1];
    expect(id(one)).toBeTruthy();
    expect(id(one)).not.toBe(id(two));
    expect(one).toContain(`fill="url(#${id(one)})"`);
  });

  it("keeps only aria-label and aria-hidden of the aria attributes", () => {
    const off = sanitized(svg('<rect aria-label="a" aria-hidden="true" aria-live="polite" aria-owns="x"/>'));
    expect(off).toContain('aria-label="a"');
    expect(off).toContain('aria-hidden="true"');
    expect(off).not.toMatch(/aria-live|aria-owns/);
  });

  it("removes comments, processing instructions and CDATA, keeps text", () => {
    const off = sanitized(
      svg('<!-- c --><?xml-stylesheet href="https://x.test/a.css"?><text><![CDATA[cdata]]>Teig</text>'),
    );
    expect(off).not.toMatch(/<!--|xml-stylesheet|x\.test|cdata/);
    expect(off).toContain("Teig");
  });

  it("rejects input with DOCTYPE or ENTITY", () => {
    expect(sanitizeSvgNode('<!DOCTYPE svg [<!ENTITY a "b">]>' + svg("<text>&a;</text>"))).toBeNull();
    expect(sanitizeSvgNode("<!doctype svg>" + svg(""))).toBeNull();
    expect(sanitizeSvgNode(svg('<!ENTITY a "b">'))).toBeNull();
  });

  it("keeps the text 'metadata:' and similar words", () => {
    expect(sanitized(svg("<text>metadata: data: javascript: url(x)</text>"))).toContain(
      "metadata: data: javascript: url(x)",
    );
  });

  it("keeps a graphic in the style of the timeline generator (classes, text, lines, title)", () => {
    const off = sanitized(
      svg(
        "<style>.grund{fill:#f5f8f7}@media (prefers-color-scheme: dark){.grund{fill:#1e292d}}</style>" +
          '<title>Ablauf</title><rect class="grund" width="480" height="558" rx="14"/>' +
          '<text x="20" y="30" class="brandink" font-size="11" font-weight="600" letter-spacing="1.4">ABLAUF</text>' +
          '<line class="linie" x1="34.0" y1="126" x2="34.0" y2="146" stroke-width="1"/>' +
          '<g class="phase"><rect class="aktiv" x="1" y="1" width="5" height="2" rx="3"/>' +
          '<text x="9" text-anchor="middle" class="zahl">3 Std.</text></g>',
        ' role="img" aria-label="Pizzateig: Ablauf"',
      ),
    );
    expect(off).not.toContain("<style");
    for (const part of [
      'class="grund"',
      'font-size="11"',
      'letter-spacing="1.4"',
      'x1="34.0"',
      'rx="3"',
      'text-anchor="middle"',
      "<title>Ablauf</title>",
      'aria-label="Pizzateig: Ablauf"',
      'viewBox="0 0 10 10"',
    ])
      expect(off).toContain(part);
  });
});

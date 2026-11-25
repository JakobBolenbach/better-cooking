// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { bereinigeSvg } from "../src/ui/svg";

const svg = (innen: string, attr = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" width="300" height="100"${attr}>${innen}</svg>`;

describe("bereinigeSvg", () => {
  it("behält Zeichenelemente, Klassen und viewBox, entfernt Breite und Höhe", () => {
    const aus = bereinigeSvg(svg('<g class="phase"><rect x="1" y="1" width="5" height="2"/><text>Teig</text></g>'));
    expect(aus).toContain('class="phase"');
    expect(aus).toContain("<rect");
    expect(aus).toContain("Teig");
    expect(aus).toContain('viewBox="0 0 10 10"');
    expect(aus).not.toMatch(/<svg[^>]*\swidth=/);
    expect(aus).not.toMatch(/<svg[^>]*\sheight=/);
  });

  it("entfernt Ereignis-Attribute auch ohne Anführungszeichen", () => {
    const aus = bereinigeSvg(svg('<rect onclick="alert(1)"/>', " onload=alert(1)"));
    expect(aus).not.toMatch(/onload|onclick|alert/);
  });

  it("entfernt image, use, a, script, style, foreignObject, animate und set", () => {
    const aus = bereinigeSvg(
      svg(
        '<image xlink:href="x" onerror="alert(1)"/><use href="#a"/><a href="javascript:alert(1)"><rect/></a>' +
          "<script>alert(1)</script><style>*{}</style><foreignObject><div/></foreignObject>" +
          '<animate attributeName="href" to="javascript:alert(1)"/><set attributeName="onclick" to="alert(1)"/>',
      ),
    );
    expect(aus).not.toMatch(/image|<use|<a[\s>]|script|style|foreignObject|animate|<set|alert|javascript/i);
  });

  it("entfernt Verweise und Stile mit externen URLs, lässt interne Verweise stehen", () => {
    const aus = bereinigeSvg(
      svg('<rect style="fill:url(https://x.test/a)"/><rect fill="url(#verlauf)"/><path href="https://x.test"/>'),
    );
    expect(aus).not.toContain("x.test");
    expect(aus).toContain('fill="url(#verlauf)"');
  });

  it("liefert nichts für Eingaben, die kein SVG sind", () => {
    expect(bereinigeSvg("<html><script>alert(1)</script></html>")).toBe("");
    expect(bereinigeSvg("kein xml <")).toBe("");
  });
});

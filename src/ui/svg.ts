// Bereinigt die Ablaufgrafik (SVG aus einem Import) vor dem Einbetten ins DOM.
// Importierte Inhalte sind nicht vertrauenswürdig (SECURITY.md): erlaubt sind nur Zeichenelemente und
// Attribute ohne Skript, Verweise oder externe Ressourcen. Getestet in tests/svg.test.ts.

const ELEMENTE = new Set([
  "svg",
  "g",
  "defs",
  "title",
  "desc",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "lineargradient",
  "radialgradient",
  "stop",
  "marker",
  "clippath",
  "mask",
  "pattern",
]);

/** Attribute, die auf eine Ressource zeigen oder Code ausführen könnten. */
const VERBOTEN = /^(on|href$|xlink:href$|src$|xmlns:xlink$|formaction$|action$)/i;

/** Werte, die Code oder externe Inhalte nachladen (auch in style und Präsentationsattributen). */
const BOESER_WERT = /javascript:|data:|vbscript:|url\(\s*['"]?\s*(?!#)|@import|expression\(/i;

/**
 * Gibt das bereinigte SVG als Markup zurück, ohne feste Breite und Höhe (die Größe setzt rezepte.css).
 * Ist die Eingabe kein SVG, kommt ein leerer String zurück.
 */
export function bereinigeSvg(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const wurzel = doc.documentElement;
  if (!wurzel || wurzel.localName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) return "";
  saeubere(wurzel);
  wurzel.removeAttribute("width");
  wurzel.removeAttribute("height");
  return new XMLSerializer().serializeToString(wurzel);
}

function saeubere(el: Element): void {
  for (const kind of Array.from(el.children)) {
    if (!ELEMENTE.has(kind.localName.toLowerCase())) kind.remove();
    else saeubere(kind);
  }
  for (const a of Array.from(el.attributes)) {
    if (VERBOTEN.test(a.name) || BOESER_WERT.test(a.value)) el.removeAttribute(a.name);
  }
}

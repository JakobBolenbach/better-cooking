// Bereinigt die Ablaufgrafik (SVG aus einem Import) vor dem Einbetten ins DOM.
// Importierte Inhalte sind nicht vertrauenswürdig (SECURITY.md): erlaubt sind nur Zeichenelemente und
// Attribute ohne Skript, Verweise oder externe Ressourcen. Getestet in tests/svg.test.ts.

const ELEMENTS = new Set([
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
const FORBIDDEN = /^(on|href$|xlink:href$|src$|xmlns:xlink$|formaction$|action$)/i;

/** Werte, die Code oder externe Inhalte nachladen (auch in style und Präsentationsattributen). */
const HOSTILE_VALUE = /javascript:|data:|vbscript:|url\(\s*['"]?\s*(?!#)|@import|expression\(/i;

/**
 * Gibt das bereinigte SVG als Markup zurück, ohne feste Breite und Höhe (die Größe setzt plugin.css).
 * Ist die Eingabe kein SVG, kommt ein leerer String zurück.
 */
export function sanitizeSvg(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.localName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) return "";
  clean(root);
  root.removeAttribute("width");
  root.removeAttribute("height");
  return new XMLSerializer().serializeToString(root);
}

function clean(el: Element): void {
  for (const kind of Array.from(el.children)) {
    if (!ELEMENTS.has(kind.localName.toLowerCase())) kind.remove();
    else clean(kind);
  }
  for (const a of Array.from(el.attributes)) {
    if (FORBIDDEN.test(a.name) || HOSTILE_VALUE.test(a.value)) el.removeAttribute(a.name);
  }
}

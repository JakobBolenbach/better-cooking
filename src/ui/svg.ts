// Sanitizes the timeline graphic (SVG from an import) before it is embedded into the DOM.
// Imported content is untrusted (SECURITY.md): only drawing elements and
// attributes without script, references or external resources are allowed. Tested in tests/svg.test.ts.

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

/** Attributes that point to a resource or could run code. */
const FORBIDDEN = /^(on|href$|xlink:href$|src$|xmlns:xlink$|formaction$|action$)/i;

/** Values that load code or external content (also in style and presentation attributes). */
const HOSTILE_VALUE = /javascript:|data:|vbscript:|url\(\s*['"]?\s*(?!#)|@import|expression\(/i;

/**
 * Returns the sanitized SVG as a node (of its own parsed document; adopt it with importNode into the target window), without fixed width and height
 * (plugin.css sets the size). If the input is not SVG, null comes back.
 */
export function sanitizeSvg(svg: string): Element | null {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.localName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) return null;
  clean(root);
  root.removeAttribute("width");
  root.removeAttribute("height");
  return root;
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

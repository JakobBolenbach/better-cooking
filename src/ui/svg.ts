// Sanitizes the timeline graphic (SVG from an import) before it is embedded into the DOM.
// Imported content is untrusted (SECURITY.md): only drawing elements and
// attributes (allow-lists, no style) without script, references or external resources are allowed. Tested in tests/svg.test.ts.

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

const SVG_NS = "http://www.w3.org/2000/svg";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

/** Allow-list of attributes (lowercase): geometry and presentation only, nothing that points to a resource or runs code. */
const ATTRIBUTES = new Set(
  (
    "x y x1 x2 y1 y2 cx cy r rx ry width height d points viewbox transform class id " +
    "fill stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-miterlimit " +
    "opacity fill-opacity stroke-opacity fill-rule clip-rule font-size font-weight font-family font-style " +
    "letter-spacing text-anchor dominant-baseline preserveaspectratio role aria-label aria-hidden xmlns " +
    "offset stop-color stop-opacity gradientunits gradienttransform fx fy " +
    "clip-path mask marker-start marker-mid marker-end markerwidth markerheight markerunits orient refx refy " +
    "patternunits patterntransform clippathunits maskunits"
  ).split(" "),
);

/** Classes of the palette in plugin.css (docs/recipe-format.md); all others are dropped so a graphic cannot borrow the plugin's own styles. */
const CLASSES = new Set(
  "grund ink soft muted brandink linie spur aktiv warten vorbereiten ofen trenn serif zahl".split(" "),
);

/** Ids get a prefix per graphic, so they cannot collide with ids of the plugin's page. */
let counter = 0;
const SAFE_ID = /^[\w.:-]+$/;

/** Attributes that take a paint or a reference: only colors, none, currentColor and a local url(#id). */
const PAINT = new Set(["fill", "stroke", "stop-color"]);
const REFERENCE = new Set(["clip-path", "mask", "marker-start", "marker-mid", "marker-end"]);
const LOCAL_URL = /^url\(\s*(['"]?)#[\w.:-]+\1\s*\)$/;
const COLOR = /^(none|currentcolor|transparent|#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl)a?\([\d\s.,%/-]+\))$/i;

function allowed(name: string, value: string): boolean {
  const v = value.trim();
  if (PAINT.has(name)) return COLOR.test(v) || LOCAL_URL.test(v);
  if (REFERENCE.has(name)) return v === "none" || LOCAL_URL.test(v);
  return true;
}

/**
 * Returns the sanitized SVG as a node (of its own parsed document; adopt it with importNode into the target window), without fixed width and height
 * (plugin.css sets the size). If the input is not SVG, null comes back.
 */
export function sanitizeSvg(svg: string): Element | null {
  if (/<!(doctype|entity)/i.test(svg)) return null;
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (
    !root ||
    root.namespaceURI !== SVG_NS ||
    root.localName !== "svg" ||
    doc.getElementsByTagName("parsererror").length
  )
    return null;
  clean(root, `rz-svg-${++counter}-`);
  root.removeAttribute("width");
  root.removeAttribute("height");
  root.removeAttribute("class");
  return root;
}

function clean(el: Element, prefix: string): void {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) continue;
    const kind = node as Element;
    if (node.nodeType !== 1 || kind.namespaceURI !== SVG_NS || !ELEMENTS.has(kind.localName.toLowerCase()))
      node.remove();
    else clean(kind, prefix);
  }
  for (const a of Array.from(el.attributes)) {
    const name = a.name.toLowerCase();
    const plain = a.namespaceURI === null && ATTRIBUTES.has(name) && allowed(name, a.value);
    const xmlns = a.namespaceURI === XMLNS_NS && a.name === "xmlns" && a.value === SVG_NS;
    if (!plain && !xmlns) el.removeAttributeNode(a);
    else if (name === "class") {
      const kept = a.value.split(/\s+/).filter((c) => CLASSES.has(c));
      if (kept.length) a.value = kept.join(" ");
      else el.removeAttributeNode(a);
    } else if (name === "id") {
      if (SAFE_ID.test(a.value)) a.value = prefix + a.value;
      else el.removeAttributeNode(a);
    } else if (PAINT.has(name) || REFERENCE.has(name)) {
      a.value = a.value.trim().replace(/^url\(\s*(['"]?)#/, `url($1#${prefix}`);
    }
  }
}

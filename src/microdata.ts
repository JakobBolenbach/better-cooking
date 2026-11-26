// schema.org Recipe as microdata (itemscope/itemprop in the HTML) for pages without JSON-LD.
// Turns the item into the same object shape as JSON-LD, so recipeFromSchema reads and sanitizes it.
// Uses the browser's DOMParser (in Obsidian and in tests with jsdom); scripts are never run by DOMParser.
// Tested in tests/microdata.test.ts.

type Value = string | Item;
interface Item {
  "@type": string;
  [prop: string]: Value | Value[];
}

/** Value of a property element by the microdata rules (meta content, img src, a href, time datetime …). */
function valueOf(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const attr = (name: string) => el.getAttribute(name) ?? "";
  if (tag === "meta") return attr("content");
  if (["img", "audio", "video", "source", "embed", "iframe", "track"].includes(tag)) return attr("src");
  if (["a", "link", "area"].includes(tag)) return attr("href");
  if (tag === "object") return attr("data");
  if (tag === "time") return attr("datetime") || (el.textContent ?? "");
  if (tag === "data" || tag === "meter") return attr("value");
  if (el.hasAttribute("content")) return attr("content");
  return el.textContent ?? "";
}

/** The properties of one itemscope element; nested items become objects. */
function readItem(scope: Element, depth = 0): Item {
  const type = (scope.getAttribute("itemtype") ?? "").split(/\s+/)[0].replace(/^https?:\/\/schema\.org\//i, "");
  const item: Item = { "@type": type };
  const add = (name: string, v: Value) => {
    const old = item[name];
    if (old === undefined) item[name] = v;
    else item[name] = Array.isArray(old) ? [...old, v] : [old, v];
  };
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const props = (child.getAttribute("itemprop") ?? "").split(/\s+/).filter(Boolean);
      const nested = child.hasAttribute("itemscope");
      if (props.length) {
        const v: Value = nested && depth < 5 ? readItem(child, depth + 1) : valueOf(child);
        for (const p of props) add(p, v);
      }
      // Properties inside a nested item belong to that item.
      if (!nested) walk(child);
    }
  };
  walk(scope);
  return item;
}

/** The first schema.org Recipe in the page's microdata, or null. */
export function findRecipeMicrodata(html: string): Record<string, unknown> | null {
  if (!/itemtype\s*=\s*["']?https?:\/\/schema\.org\/Recipe/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const scope = Array.from(doc.querySelectorAll("[itemscope][itemtype]")).find((el) =>
    /schema\.org\/Recipe\b/i.test(el.getAttribute("itemtype") ?? ""),
  );
  if (!scope) return null;
  const r = readItem(scope) as Record<string, unknown>;
  // Old vocabulary: "ingredients" instead of "recipeIngredient".
  if (!r.recipeIngredient && r.ingredients) r.recipeIngredient = r.ingredients;
  r["@type"] = "Recipe";
  return r;
}

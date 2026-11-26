// Share a recipe with people who do not use Obsidian (issue #9): as plain text for messages and as a
// self-contained HTML page for printing or saving as PDF, both for the servings shown.
// Pure functions without Obsidian, tested in tests/share.test.ts.

import { servingsText, scaleLine } from "./quantities";
import { isEquipment } from "./cooking";
import { tr } from "./i18n";
import type { Recipe } from "./types";

type Shared = Pick<
  Recipe,
  "title" | "description" | "servings" | "source" | "author" | "ingredients" | "steps" | "tips" | "timeTotal"
>;

const line = (z: string, factor: number, equipment: boolean) =>
  equipment || factor === 1
    ? z
    : scaleLine(z, factor)
        .map((p) => p.text)
        .join("");

/** Plain text for a message: title, servings, ingredients, numbered steps, tips, source. */
export function recipeText(r: Shared, factor = 1): string {
  const out = [r.title.toUpperCase()];
  const servings = r.servings && servingsText(r.servings, factor);
  if (r.description) out.push("", r.description);
  out.push("", `${tr("ingredients")}${servings ? ` (${servings})` : ""}`);
  for (const g of r.ingredients) {
    if (g.title) out.push(`${g.title}:`);
    for (const z of g.ingredients) out.push(`- ${line(z, factor, isEquipment(g.title))}`);
  }
  if (r.steps.length) {
    out.push("", tr("preparation"));
    r.steps.forEach((s, i) => out.push(`${i + 1}. ${s.title ? `${s.title}: ` : ""}${s.text}`));
  }
  if (r.tips.length) out.push("", tr("tips"), ...r.tips.map((t) => `- ${t}`));
  if (r.source?.startsWith("http")) out.push("", `${tr("source")}: ${r.source}`);
  return out.join("\n");
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * A self-contained page for printing (desktop: print dialog, "Save as PDF"). All text is escaped;
 * the only link is the source if it is http(s). `image`: optional data: URI of the cover image.
 */
export function recipeHtml(r: Shared, factor = 1, image?: string): string {
  const servings = r.servings && servingsText(r.servings, factor);
  const groups = r.ingredients
    .map(
      (g) =>
        (g.title ? `<h3>${esc(g.title)}</h3>` : "") +
        `<ul>${g.ingredients.map((z) => `<li>${esc(line(z, factor, isEquipment(g.title)))}</li>`).join("")}</ul>`,
    )
    .join("");
  const steps = r.steps.map((s) => `<li>${s.title ? `<b>${esc(s.title)}:</b> ` : ""}${esc(s.text)}</li>`).join("");
  const source = r.source?.match(/^https?:\/\//)
    ? `<p class="quelle">${esc(tr("source"))}: <a href="${esc(r.source)}">${esc(r.source)}</a>${r.author ? `, ${esc(r.author)}` : ""}</p>`
    : "";
  const img = image?.startsWith("data:image/") ? `<img src="${esc(image)}" alt="">` : "";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(r.title)}</title>
<style>
body{font:11pt/1.5 Georgia,"Times New Roman",serif;color:#222;max-width:42em;margin:2em auto;padding:0 1em}
h1{font-size:22pt;margin:0 0 .3em}h2{font-size:14pt;margin:1.4em 0 .4em}h3{font-size:11pt;margin:.8em 0 .2em}
img{max-width:100%;max-height:9cm;object-fit:cover;border-radius:6px;margin:.5em 0}
.leise,.quelle{color:#555}ul,ol{padding-left:1.4em}li{margin:.2em 0}
@media print{body{margin:0}a{color:inherit}}
</style></head><body>
<h1>${esc(r.title)}</h1>
${img}
${r.description ? `<p>${esc(r.description)}</p>` : ""}
${servings ? `<p class="leise">${esc(servings)}</p>` : ""}
<h2>${esc(tr("ingredients"))}</h2>${groups}
${steps ? `<h2>${esc(tr("preparation"))}</h2><ol>${steps}</ol>` : ""}
${r.tips.length ? `<h2>${esc(tr("tips"))}</h2><ul>${r.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
${source}
</body></html>`;
}

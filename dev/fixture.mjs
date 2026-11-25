// Baut dev/fixture.json für die Vorschau: Rezepte aus tests/fixtures oder aus einem eigenen Ordner
// (REZEPTE_ORDNER=/pfad/zu/Rezepte node dev/fixture.mjs). Bilder werden aus <Ordner>/Bilder gelesen, falls vorhanden.
import fs from "node:fs";
import path from "node:path";

const here = import.meta.dirname;
const dir = path.resolve(process.env.REZEPTE_ORDNER ?? path.join(here, "../tests/fixtures"));
const out = [];
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".md") || f === "AGENTS.md" || f === "README.md") continue;
  const p = path.join(dir, f);
  out.push({
    path: `Recipes/${f}`,
    text: fs.readFileSync(p, "utf8"),
    mtime: Math.round(fs.statSync(p).mtimeMs),
  });
}
const imagesDir = path.join(dir, "Bilder");
const images = fs.existsSync(imagesDir) ? fs.readdirSync(imagesDir) : [];
const svg = Object.fromEntries(
  images.filter((b) => b.endsWith(".svg")).map((b) => [b, fs.readFileSync(path.join(imagesDir, b), "utf8")]),
);
const imagesUrl = path.relative(here, imagesDir).split(path.sep).join("/");
fs.writeFileSync(path.join(here, "fixture.json"), JSON.stringify({ recipes: out, images, svg, imagesUrl }));
console.log(`fixture.json: ${out.length} Rezepte, ${images.length} Bilder aus ${dir}`);

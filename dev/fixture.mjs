// Builds dev/fixture.json for the preview: recipes from tests/fixtures or from a folder of your own
// (REZEPTE_ORDNER=/path/to/Recipes node dev/fixture.mjs). Images are read from <folder>/Bilder if present.
import fs from "node:fs";
import path from "node:path";

const here = import.meta.dirname;
const dir = path.resolve(process.env.REZEPTE_ORDNER ?? path.join(here, "../tests/fixtures"));
const read = (folder) => {
  if (!fs.existsSync(folder)) return [];
  const list = [];
  for (const f of fs.readdirSync(folder)) {
    if (!f.endsWith(".md") || f === "AGENTS.md" || f === "README.md") continue;
    const p = path.join(folder, f);
    list.push({ path: `Recipes/${f}`, text: fs.readFileSync(p, "utf8"), mtime: Math.round(fs.statSync(p).mtimeMs) });
  }
  return list;
};
const out = read(dir);
// English example recipes for the preview with lang=en (only with the built-in fixtures).
const outEn = process.env.REZEPTE_ORDNER ? [] : read(path.join(dir, "en"));
const imagesDir = path.join(dir, "Bilder");
const images = fs.existsSync(imagesDir) ? fs.readdirSync(imagesDir) : [];
const svg = Object.fromEntries(
  images.filter((b) => b.endsWith(".svg")).map((b) => [b, fs.readFileSync(path.join(imagesDir, b), "utf8")]),
);
const imagesUrl = path.relative(here, imagesDir).split(path.sep).join("/");
fs.writeFileSync(
  path.join(here, "fixture.json"),
  JSON.stringify({ recipes: out, recipesEn: outEn, images, svg, imagesUrl }),
);
console.log(`fixture.json: ${out.length} recipes (${outEn.length} English), ${images.length} images from ${dir}`);

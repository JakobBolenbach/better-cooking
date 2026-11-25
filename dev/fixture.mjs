// Baut dev/fixture.json für die Vorschau: Rezepte aus tests/fixtures oder aus einem eigenen Ordner
// (REZEPTE_ORDNER=/pfad/zu/Rezepte node dev/fixture.mjs). Bilder werden aus <Ordner>/Bilder gelesen, falls vorhanden.
import fs from "node:fs";
import path from "node:path";

const hier = import.meta.dirname;
const ordner = path.resolve(process.env.REZEPTE_ORDNER ?? path.join(hier, "../tests/fixtures"));
const out = [];
for (const f of fs.readdirSync(ordner)) {
  if (!f.endsWith(".md") || f === "AGENTS.md" || f === "README.md") continue;
  const p = path.join(ordner, f);
  out.push({
    pfad: `Recipes/${f}`,
    text: fs.readFileSync(p, "utf8"),
    mtime: Math.round(fs.statSync(p).mtimeMs),
  });
}
const bilderOrdner = path.join(ordner, "Bilder");
const bilder = fs.existsSync(bilderOrdner) ? fs.readdirSync(bilderOrdner) : [];
const svg = Object.fromEntries(
  bilder.filter((b) => b.endsWith(".svg")).map((b) => [b, fs.readFileSync(path.join(bilderOrdner, b), "utf8")]),
);
const bilderUrl = path.relative(hier, bilderOrdner).split(path.sep).join("/");
fs.writeFileSync(path.join(hier, "fixture.json"), JSON.stringify({ rezepte: out, bilder, svg, bilderUrl }));
console.log(`fixture.json: ${out.length} Rezepte, ${bilder.length} Bilder aus ${ordner}`);

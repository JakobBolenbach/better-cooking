// Erzeugt styles.css: Schriften Source Serif 4 und IBM Plex Sans aus den @fontsource-Paketen (SIL OFL 1.1,
// siehe THIRD_PARTY_NOTICES.md) als data:-URIs, weil Obsidian relative Pfade in Plugin-Styles nicht auflöst,
// plus src/rezepte.css. styles.css ist erzeugt und wird nicht eingecheckt.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const paketOrdner = (name) => path.dirname(require.resolve(`${name}/package.json`));

const SCHRIFTEN = [
  ["Source Serif 4", "@fontsource/source-serif-4", "source-serif-4", [400, 600, 700]],
  ["IBM Plex Sans", "@fontsource/ibm-plex-sans", "ibm-plex-sans", [400, 500, 600, 700]],
];

const faces = [];
for (const [familie, paket, kurz, gewichte] of SCHRIFTEN) {
  const ordner = path.join(paketOrdner(paket), "files");
  for (const gewicht of gewichte) {
    const f = path.join(ordner, `${kurz}-latin-${gewicht}-normal.woff2`);
    if (!fs.existsSync(f)) {
      console.error(`Schrift fehlt: ${f}`);
      process.exit(1);
    }
    const b64 = fs.readFileSync(f).toString("base64");
    faces.push(
      `@font-face {\n  font-family: "${familie}";\n  font-style: normal;\n  font-weight: ${gewicht};\n  font-display: swap;\n  src: url(data:font/woff2;base64,${b64}) format("woff2");\n}`,
    );
  }
}
const eigen = fs.readFileSync(path.join(root, "src/rezepte.css"), "utf8");
const kopf = [
  "/* Better Cooking. Erzeugt von scripts/build-styles.mjs, nicht von Hand ändern.",
  "   Eingebettete Schriften: Source Serif 4 und IBM Plex Sans, beide unter der SIL Open Font License 1.1;",
  "   Hinweise und Lizenztexte: https://github.com/JakobBolenbach/better-cooking/blob/main/THIRD_PARTY_NOTICES.md */",
].join("\n");
const css = [kopf, ...faces, eigen].join("\n\n");
fs.writeFileSync(path.join(root, "styles.css"), css);
console.log(`styles.css geschrieben (${Math.round(css.length / 1024)} KB, ${faces.length} Schriftschnitte)`);

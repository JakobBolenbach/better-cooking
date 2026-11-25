// Erzeugt styles.css: Schriften Source Serif 4 und IBM Plex Sans aus den @fontsource-Paketen (SIL OFL 1.1,
// siehe THIRD_PARTY_NOTICES.md) als data:-URIs, weil Obsidian relative Pfade in Plugin-Styles nicht auflöst,
// plus src/plugin.css. styles.css ist erzeugt und wird nicht eingecheckt.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const packageDir = (name) => path.dirname(require.resolve(`${name}/package.json`));

const FONTS = [
  ["Source Serif 4", "@fontsource/source-serif-4", "source-serif-4", [400, 600, 700]],
  ["IBM Plex Sans", "@fontsource/ibm-plex-sans", "ibm-plex-sans", [400, 500, 600, 700]],
];

const faces = [];
for (const [family, pkg, short, weights] of FONTS) {
  const dir = path.join(packageDir(pkg), "files");
  for (const weight of weights) {
    const f = path.join(dir, `${short}-latin-${weight}-normal.woff2`);
    if (!fs.existsSync(f)) {
      console.error(`Schrift fehlt: ${f}`);
      process.exit(1);
    }
    const b64 = fs.readFileSync(f).toString("base64");
    faces.push(
      `@font-face {\n  font-family: "${family}";\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url(data:font/woff2;base64,${b64}) format("woff2");\n}`,
    );
  }
}
const own = fs.readFileSync(path.join(root, "src/plugin.css"), "utf8");
const header = [
  "/* Better Cooking. Erzeugt von scripts/build-styles.mjs, nicht von Hand ändern.",
  "   Eingebettete Schriften: Source Serif 4 und IBM Plex Sans, beide unter der SIL Open Font License 1.1;",
  "   Hinweise und Lizenztexte: https://github.com/JakobBolenbach/better-cooking/blob/main/THIRD_PARTY_NOTICES.md */",
].join("\n");
const css = [header, ...faces, own].join("\n\n");
fs.writeFileSync(path.join(root, "styles.css"), css);
console.log(`styles.css geschrieben (${Math.round(css.length / 1024)} KB, ${faces.length} Schriftschnitte)`);

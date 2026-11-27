// Builds the plugin (main.js) or the preview without Obsidian (dev/preview.js).
// Usage: node esbuild.config.mjs [production|preview]   without an argument: watch mode
import esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";

const mode = process.argv[2] ?? "watch";

// Notices of the bundled libraries. Their licenses require the copyright and permission notice in copies;
// the libraries carry no legal comments of their own, so the banner is built from the verbatim license texts in licenses/.
const text = (file) => readFileSync(new URL(`licenses/${file}`, import.meta.url), "utf8").trim();
const NOTICES = [
  "Better Cooking bundles third-party components. Full list: THIRD_PARTY_NOTICES.md in the repository.",
  "",
  "Preact (MIT)",
  text("MIT-Preact.txt"),
  "",
  "MiniSearch (MIT)",
  text("MIT-MiniSearch.txt"),
  "",
  "Icon paths from Lucide in the icons of the interface (src/ui/icons.tsx) and the app icon (src/view.ts); license of Lucide, with the MIT license of the parts derived from Feather:",
  text("Lucide-ISC-and-MIT.txt"),
].join("\n");

const shared = {
  bundle: true,
  jsx: "automatic",
  jsxImportSource: "preact",
  target: "es2020",
  logLevel: "info",
  legalComments: "eof",
  // Development code (self-reload, src/development.ts) only outside release builds.
  define: { __DEV__: JSON.stringify(mode !== "production") },
};

if (mode === "preview") {
  await esbuild.build({
    ...shared,
    entryPoints: ["dev/preview.tsx"],
    outfile: "dev/preview.js",
    format: "iife",
    sourcemap: false,
  });
} else {
  const ctx = await esbuild.context({
    ...shared,
    entryPoints: ["src/main.ts"],
    outfile: "main.js",
    format: "cjs",
    external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtinModules],
    banner: { js: `/*! ${NOTICES.replaceAll("*/", "* /")} */` },
    sourcemap: mode === "production" ? false : "inline",
    minify: mode === "production",
    treeShaking: true,
  });
  if (mode === "production") {
    await ctx.rebuild();
    await ctx.dispose();
  } else {
    await ctx.watch();
  }
}

// Builds the plugin (main.js) or the preview without Obsidian (dev/preview.js).
// Usage: node esbuild.config.mjs [production|preview]   without an argument: watch mode
import esbuild from "esbuild";
import { builtinModules } from "node:module";

const mode = process.argv[2] ?? "watch";

// Notices of the bundled libraries. Their licenses require the copyright and permission notice in copies;
// the libraries carry no legal comments of their own, so the banner is written here. Keep in sync with THIRD_PARTY_NOTICES.md.
const MIT_PERMISSION =
  'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), ' +
  "to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, " +
  "and to permit persons to whom the Software is furnished to do so, subject to the following conditions: " +
  "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. " +
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. ' +
  "IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.";
const NOTICES = [
  "Better Cooking bundles third-party components. Full list: THIRD_PARTY_NOTICES.md in the repository.",
  "",
  "Preact (MIT), Copyright (c) 2015-present Jason Miller",
  "MiniSearch (MIT), Copyright 2022 Luca Ongaro",
  MIT_PERMISSION,
  "",
  "Lucide icon paths (ISC), Copyright (c) 2026 Lucide Icons and Contributors",
  "Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.",
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

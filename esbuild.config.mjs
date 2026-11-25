// Builds the plugin (main.js) or the preview without Obsidian (dev/preview.js).
// Usage: node esbuild.config.mjs [production|preview]   without an argument: watch mode
import esbuild from "esbuild";
import { builtinModules } from "node:module";

const mode = process.argv[2] ?? "watch";

const shared = {
  bundle: true,
  jsx: "automatic",
  jsxImportSource: "preact",
  target: "es2020",
  logLevel: "info",
  legalComments: "none",
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

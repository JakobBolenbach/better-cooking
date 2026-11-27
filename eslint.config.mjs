// ESLint mit den Regeln von Obsidian (eslint-plugin-obsidianmd, recommended). Dieselben Regeln nutzt das
// automatische Review im Obsidian Community Directory; was hier grün ist, besteht dort die Code-Prüfung.
import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  // Build-Ergebnisse und Node-Skripte sind kein Plugin-Code und stehen nicht in tsconfig.json.
  globalIgnores([
    "node_modules",
    "main.js",
    "styles.css",
    "dev/preview.js",
    "esbuild.config.mjs",
    "vitest.config.mjs",
    "scripts/**",
    "dev/fixture.mjs",
  ]),
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.mjs"],
        },
      },
    },
  },
  {
    // Die Vorschau läuft im normalen Browser ohne Obsidian: dort gibt es weder activeDocument noch Popout-Fenster.
    files: ["dev/**"],
    rules: {
      "obsidianmd/prefer-active-doc": "off",
      "obsidianmd/prefer-window-timers": "off",
      "obsidianmd/rule-custom-message": "off",
    },
  },
]);

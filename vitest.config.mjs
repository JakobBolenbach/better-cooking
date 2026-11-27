// Tests run without Obsidian: the "obsidian" import resolves to a stub that a test can replace with vi.mock.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { obsidian: fileURLToPath(new URL("./tests/stubs/obsidian.ts", import.meta.url)) } },
});

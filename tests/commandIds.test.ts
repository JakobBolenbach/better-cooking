import { describe, expect, it } from "vitest";
import { registerCommands } from "../src/commands";

describe("registerCommands", () => {
  it("registers unique command IDs in lowercase kebab-case without the plugin ID, including open-recipes and import-recipe", () => {
    const ids: string[] = [];
    registerCommands({ addCommand: (c: { id: string }) => ids.push(c.id) } as never);
    expect(ids.length).toBeGreaterThan(5);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(ids).toEqual(expect.arrayContaining(["open-recipes", "import-recipe"]));
    expect(ids.some((id) => id.includes("better-cooking"))).toBe(false);
  });
});

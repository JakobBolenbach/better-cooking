import { describe, expect, it } from "vitest";
import type { Setting } from "obsidian";
import { definitionRender } from "../src/settingsDefinition";

describe("definitionRender (#117)", () => {
  it("returns nothing, even if the row's render returns something", () => {
    const row = { render: (() => ({ addDropdown: true })) as unknown as (s: Setting) => void };
    expect(definitionRender(row)({} as Setting)).toBeUndefined();
  });

  it("still renders the row", () => {
    let called = 0;
    definitionRender({ render: () => void called++ })({} as Setting);
    expect(called).toBe(1);
  });
});

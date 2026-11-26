import { describe, expect, it } from "vitest";
import { hangingEnd, indentOf } from "../src/hanging";

const entry = (l: string) => /^\s*- \[/.test(l);

describe("hanging lines", () => {
  it("measures indentation", () => {
    expect(indentOf("- a")).toBe(0);
    expect(indentOf("    x")).toBe(4);
  });

  it("takes the lines indented deeper than the entry", () => {
    const lines = ["- [ ] a", "  note", "    more", "- [ ] b"];
    expect(hangingEnd(lines, 0, entry)).toBe(3);
  });

  it("stops at an empty line, at a line that is not indented deeper and at an entry line of any depth", () => {
    expect(hangingEnd(["- [ ] a", "", "  late"], 0, entry)).toBe(1);
    expect(hangingEnd(["- [ ] a", "text"], 0, entry)).toBe(1);
    expect(hangingEnd(["  - [ ] a", "  same", "    deeper"], 0, entry)).toBe(1);
    expect(hangingEnd(["- [ ] a", "  note", "  - [ ] nested"], 0, entry)).toBe(2);
  });

  it("is the entry alone at the end of the text", () => {
    expect(hangingEnd(["- [ ] a"], 0, entry)).toBe(1);
  });
});

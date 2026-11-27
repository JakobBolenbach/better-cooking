// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { setCssVar } from "../src/cssProps";

describe("setCssVar", () => {
  it("sets the variable with style.setProperty where setCssProps does not exist", () => {
    const el = document.createElement("div");
    setCssVar(el, "--rz-x", "4px");
    expect(el.style.getPropertyValue("--rz-x")).toBe("4px");
  });

  it("uses setCssProps of Obsidian when it exists", () => {
    const el = document.createElement("div");
    const spy = vi.fn((props: Record<string, string>) => {
      for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v);
    });
    el.setCssProps = spy;
    setCssVar(el, "--rz-x", "4px");
    expect(spy).toHaveBeenCalledWith({ "--rz-x": "4px" });
    expect(el.style.getPropertyValue("--rz-x")).toBe("4px");
  });

  it("removes the variable with an empty value", () => {
    const el = document.createElement("div");
    setCssVar(el, "--rz-x", "4px");
    setCssVar(el, "--rz-x", "");
    expect(el.style.getPropertyValue("--rz-x")).toBe("");
    expect(el.getAttribute("style") ?? "").not.toContain("--rz-x");
  });

  it("writes nothing when the value is unchanged", () => {
    const el = document.createElement("div");
    el.style.setProperty("--rz-x", "4px");
    const spy = vi.fn();
    el.setCssProps = spy;
    setCssVar(el, "--rz-x", "4px");
    expect(spy).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import { refetchApi } from "../src/refetchApi";

describe("refetchApi", () => {
  it("hands the parts the user chose to replace on to the refetcher, and the result to the notice", async () => {
    const apply = vi.fn(async () => ({ ok: true, message: "Aktualisiert" }));
    const notify = vi.fn();
    const api = refetchApi({ preview: vi.fn(), cancel: vi.fn(), apply }, notify);
    const r = await api.apply("Recipes/A.md", ["ingredients", "title"]);
    expect(apply).toHaveBeenCalledWith("Recipes/A.md", ["ingredients", "title"]);
    expect(r.ok).toBe(true);
    expect(notify).toHaveBeenCalledWith("Aktualisiert");
  });

  it("shows no notice for a failure and passes preview and cancel through", async () => {
    const preview = vi.fn(async () => ({ ok: false as const, message: "x" }));
    const cancel = vi.fn();
    const notify = vi.fn();
    const api = refetchApi({ preview, cancel, apply: async () => ({ ok: false, message: "nein" }) }, notify);
    await api.apply("a", []);
    await api.preview("a", true);
    api.cancel("a");
    expect(notify).not.toHaveBeenCalled();
    expect(preview).toHaveBeenCalledWith("a", true);
    expect(cancel).toHaveBeenCalledWith("a");
  });
});

describe("the view", () => {
  it("builds the dialog's api with refetchApi, so apply gets the parts to replace", async () => {
    const { readFile } = await import("node:fs/promises");
    const view = await readFile(new URL("../src/view.ts", import.meta.url), "utf8");
    expect(view).toMatch(/refetch: refetchApi\(p\.refetcher,/);
  });
});

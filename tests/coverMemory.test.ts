import { describe, expect, it, vi } from "vitest";
import { rememberCoverUrl } from "../src/coverMemory";

describe("rememberCoverUrl", () => {
  it("saves the address under the path of the note", async () => {
    const save = vi.fn(async () => undefined);
    await rememberCoverUrl({ settings: { coverUrls: { a: "1" } }, save }, "R/B.md", "https://e.org/x.jpg");
    expect(save).toHaveBeenCalledWith({ coverUrls: { a: "1", "R/B.md": "https://e.org/x.jpg" } });
  });
  it("never throws, so a written note is not reported as failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const save = vi.fn(async () => Promise.reject(new Error("disk")));
    await expect(rememberCoverUrl({ settings: { coverUrls: {} }, save }, "R/B.md", "u")).resolves.toBeUndefined();
  });
  it("does nothing without an address", async () => {
    const save = vi.fn(async () => undefined);
    await rememberCoverUrl({ settings: { coverUrls: {} }, save }, "R/B.md");
    expect(save).not.toHaveBeenCalled();
  });
});

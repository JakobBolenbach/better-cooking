import { describe, expect, it } from "vitest";
import { NoteSync } from "../src/noteSync";

describe("NoteSync", () => {
  it("lets only the newest read set the state", () => {
    const s = new NoteSync();
    const first = s.startRead();
    const second = s.startRead();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it("drops a read that started before or while a write ran", () => {
    const s = new NoteSync();
    const before = s.startRead();
    const write = s.startEdit();
    const during = s.startRead();
    expect(write()).toBe(true);
    expect(before()).toBe(false);
    expect(during()).toBe(false);
    expect(s.startRead()()).toBe(true);
  });

  it("only the latest of two writes sets the state, but both count as done", () => {
    const s = new NoteSync();
    const a = s.startEdit();
    const b = s.startEdit();
    expect(a()).toBe(false);
    expect(b()).toBe(true);
    expect(s.startRead()()).toBe(true);
  });

  it("lets a read after a failed or overtaken write count, so the view can read once more", () => {
    const s = new NoteSync();
    const failed = s.startEdit();
    expect(failed()).toBe(true); // the caller saw the failure itself
    expect(s.startRead()()).toBe(true);
    const a = s.startEdit();
    const b = s.startEdit();
    expect(a()).toBe(false); // overtaken: the caller reads again
    expect(b()).toBe(true);
    expect(s.startRead()()).toBe(true);
  });
});

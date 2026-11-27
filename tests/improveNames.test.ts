// Free names in the improvement flow when the vault has the same name in another case (Windows, macOS).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("./stubs/obsidianFake"));
vi.mock("../src/notice", () => import("./stubs/obsidianFake"));

import { notices } from "./stubs/obsidianFake";
import { setLanguage } from "../src/i18n";
import { COVER, FOLDER, NOTE, PROPOSAL, firstVersion, proposalText, setup } from "./improveFake";

beforeEach(() => {
  notices.length = 0;
  setLanguage("de");
  vi.stubGlobal("window", { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const keysWith = (s: ReturnType<typeof setup>, part: string) => [...s.store.keys()].filter((k) => k.includes(part));

describe("backups of a refetch or improvement", () => {
  it("go into an existing folder in another spelling and take the next number for a name in another case", async () => {
    const plain = setup({ [NOTE]: firstVersion(), [PROPOSAL]: proposalText() });
    await plain.service.handle(PROPOSAL);
    const [made] = keysWith(plain, "/Vorversionen/");
    const name = made.split("/").pop()!;

    const s = setup({
      [NOTE]: firstVersion(),
      [PROPOSAL]: proposalText(),
      [`${FOLDER}/vorversionen/${name.toLowerCase()}`]: "old",
    });
    await s.service.handle(PROPOSAL);
    expect(keysWith(s, "/Vorversionen/")).toEqual([]);
    expect(keysWith(s, "/vorversionen/")).toHaveLength(2);
    expect(keysWith(s, "/vorversionen/").some((k) => k.endsWith(" 2.md"))).toBe(true);
  });
});

describe("a proposal saved as a new recipe", () => {
  const orphan = async (s: ReturnType<typeof setup>) => {
    await s.service.handle(PROPOSAL);
    vi.setSystemTime(Date.now() + 3 * 60_000);
    await s.service.handle(PROPOSAL);
    return s.service.orphan(PROPOSAL, "save");
  };

  it("takes the next number when the name exists in another case, and finds the images folder in any spelling", async () => {
    const s = setup({
      [PROPOSAL]: proposalText(),
      [`${FOLDER}/rote linsensuppe.md`]: "x",
      [COVER]: "img",
      [`${FOLDER}/bilder/Other.jpg`]: "y",
    });
    const r = await orphan(s);
    expect(r).toMatchObject({ ok: true });
    expect(s.store.has(`${FOLDER}/Rote Linsensuppe 2.md`)).toBe(true);
    expect(s.store.has(`${FOLDER}/Rote Linsensuppe.md`)).toBe(false);
  });
});

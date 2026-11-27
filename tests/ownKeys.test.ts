import { describe, expect, it } from "vitest";
import { hasOwn, isSafeKey, ownValue } from "../src/ownKeys";

describe("ownKeys", () => {
  it("rejects the keys that change prototypes", () => {
    for (const k of ["__proto__", "constructor", "prototype"]) expect(isSafeKey(k)).toBe(false);
    expect(isSafeKey("folder")).toBe(true);
  });
  it("reads own properties only", () => {
    const o = JSON.parse('{"a":1,"__proto__":{"b":2}}') as Record<string, unknown>;
    expect(hasOwn(o, "a")).toBe(true);
    expect(hasOwn(o, "toString")).toBe(false);
    expect(ownValue(o, "a")).toBe(1);
    expect(ownValue(o, "constructor")).toBeUndefined();
  });
});

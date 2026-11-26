import { describe, expect, it, vi } from "vitest";
import { WakeLock, type Sentinel } from "../src/wakeLock";

function setup(visible = true) {
  const made: (Sentinel & { release: ReturnType<typeof vi.fn>; fire: () => void })[] = [];
  let hidden = !visible;
  const request = vi.fn(async () => {
    let onRelease = () => {};
    const s = {
      release: vi.fn(async () => {}),
      addEventListener: (_t: "release", f: () => void) => (onRelease = f),
      fire: () => onRelease(),
    };
    made.push(s);
    return s;
  });
  const lock = new WakeLock(request, () => !hidden);
  return { lock, request, made, setHidden: (h: boolean) => (hidden = h) };
}

describe("wake lock", () => {
  it("is held while any reason holds and released with the last one", async () => {
    const { lock, request, made } = setup();
    expect(await lock.hold("cooking", true)).toBe(true);
    await lock.hold("timer", true);
    expect(request).toHaveBeenCalledOnce();
    await lock.hold("cooking", false);
    expect(lock.held).toBe(true);
    expect(await lock.hold("timer", false)).toBe(false);
    expect(made[0].release).toHaveBeenCalledOnce();
  });

  it("asks again when the browser released it (page hidden) and the page is back", async () => {
    const { lock, request, made, setHidden } = setup();
    await lock.hold("cooking", true);
    setHidden(true);
    made[0].fire();
    expect(lock.held).toBe(false);
    await lock.refresh();
    expect(request).toHaveBeenCalledOnce();
    setHidden(false);
    expect(await lock.refresh()).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("makes no second request for two quick holds", async () => {
    const { lock, request } = setup();
    await Promise.all([lock.hold("a", true), lock.hold("b", true)]);
    expect(request).toHaveBeenCalledOnce();
  });

  it("answers false where the device cannot", async () => {
    const lock = new WakeLock(
      async () => null,
      () => true,
    );
    expect(await lock.hold("cooking", true)).toBe(false);
    const broken = new WakeLock(
      () => Promise.reject(new Error("denied")),
      () => true,
    );
    expect(await broken.hold("cooking", true)).toBe(false);
  });
});

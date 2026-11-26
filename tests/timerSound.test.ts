// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chime, MAX_RING_MS, REPEAT_MS, gainFor } from "../src/timerSound";

let created = 0;
let oscillators = 0;
let vibrate = vi.fn();
const fakeContext = () => {
  const param = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), value: 0 };
  return {
    state: "suspended",
    currentTime: 0,
    destination: {},
    resume: vi.fn(function (this: { state: string }) {
      this.state = "running";
      return Promise.resolve();
    }),
    close: vi.fn(() => Promise.resolve()),
    createGain: () => ({ gain: param, connect: (n: unknown) => n }),
    createOscillator: () => {
      oscillators++;
      return { frequency: { value: 0 }, connect: (n: unknown) => n, start: vi.fn(), stop: vi.fn() };
    },
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  created = 0;
  oscillators = 0;
  vi.stubGlobal("AudioContext", function () {
    created++;
    return fakeContext();
  });
  Object.assign(window, { AudioContext: globalThis.AudioContext });
  vibrate = vi.fn();
  Object.assign(navigator, { vibrate });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("timer volume", () => {
  it("maps the four steps to rising gains, off is silent", () => {
    expect(gainFor("off")).toBe(0);
    expect(gainFor("low")).toBeLessThan(gainFor("normal"));
    expect(gainFor("normal")).toBeLessThan(gainFor("loud"));
  });
});

describe("chime", () => {
  it("makes one audio context when prepared and wakes it", () => {
    const c = new Chime();
    c.prepare();
    c.prepare();
    expect(created).toBe(1);
  });

  it("plays at once, repeats until stopped and stops after two minutes", () => {
    const c = new Chime();
    c.prepare();
    c.start("normal");
    expect(oscillators).toBe(2);
    expect(vibrate).toHaveBeenCalledWith([300, 150, 300]);
    vi.advanceTimersByTime(REPEAT_MS);
    expect(oscillators).toBe(4);
    vi.advanceTimersByTime(MAX_RING_MS);
    expect(c.playing).toBe(false);
    const n = oscillators;
    vi.advanceTimersByTime(REPEAT_MS * 3);
    expect(oscillators).toBe(n);
  });

  it("stops on request and does not start twice", () => {
    const c = new Chime();
    c.start("loud");
    c.start("loud");
    expect(oscillators).toBe(2);
    c.stop();
    expect(c.playing).toBe(false);
    vi.advanceTimersByTime(REPEAT_MS * 2);
    expect(oscillators).toBe(2);
  });

  it("stays silent at volume off but still vibrates", () => {
    const c = new Chime();
    c.start("off");
    expect(oscillators).toBe(0);
    expect(vibrate).toHaveBeenCalled();
    c.stop();
  });
});

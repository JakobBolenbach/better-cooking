// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../src/i18n";

const platform = vi.hoisted(() => ({ isDesktopApp: true, isMobile: false }));
const notices = vi.hoisted(
  () => [] as { text: string; duration?: number; messageEl: HTMLElement; containerEl: HTMLElement; hide: () => void }[],
);

vi.mock("obsidian", () => {
  class Notice {
    messageEl: HTMLElement & {
      createSpan: (o: { text: string }) => void;
      createEl: (t: string, o: { text: string }) => HTMLElement;
    };
    containerEl = document.createElement("div");
    text = "";
    constructor(
      message: string,
      public duration?: number,
    ) {
      // Obsidian adds these helpers to every element.
      const el = Object.assign(document.createElement("div"), {
        createSpan: (o: { text: string }) =>
          void el.append(Object.assign(document.createElement("span"), { textContent: o.text })),
        createEl: (t: string, o: { text: string }) =>
          el.appendChild(Object.assign(document.createElement(t), { textContent: o.text })),
      });
      this.messageEl = el;
      this.containerEl.append(el);
      this.text = message;
      notices.push(this);
    }
    hide() {}
  }
  return { Notice, Platform: platform };
});

const { TimerService } = await import("../src/timerService");

const T0 = 10_000_000;
let storage: Record<string, unknown>;
let vibrate: ReturnType<typeof vi.fn>;
let lockRequests: number;
let lockReleases: number;
let status: HTMLElement;
const saveMock = vi.fn(async (_: unknown) => undefined);
const openMock = vi.fn(async (_: unknown) => undefined);

function plugin() {
  status = Object.assign(document.createElement("div"), {
    addClass: () => undefined,
    hide: () => undefined,
    show: () => undefined,
    setText: (t: string) => void (status.textContent = t),
  });
  const p = {
    app: {
      loadLocalStorage: (k: string) => storage[k] ?? null,
      saveLocalStorage: (k: string, v: unknown) =>
        void (v === null ? delete storage[k] : (storage[k] = JSON.parse(JSON.stringify(v)))),
      workspace: { onLayoutReady: (f: () => void) => f() },
    },
    settings: { timerPhoneHintSeen: false },
    save: saveMock,
    open: openMock,
    addStatusBarItem: () => status,
    registerDomEvent: (t: EventTarget, type: string, f: EventListener, o?: boolean) => t.addEventListener(type, f, o),
    registerInterval: (n: number) => n,
  };
  return p as unknown as ConstructorParameters<typeof TimerService>[0] & typeof p;
}

class FakeNotification {
  static permission = "granted";
  static requestPermission = vi.fn(async () => "granted");
  static made: FakeNotification[] = [];
  onclick: (() => void) | null = null;
  close = vi.fn();
  constructor(
    public title: string,
    public options: { body: string; requireInteraction: boolean; tag: string },
  ) {
    FakeNotification.made.push(this);
  }
}

beforeEach(() => {
  setLanguage("en");
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  storage = {};
  notices.length = 0;
  saveMock.mockClear();
  openMock.mockClear();
  platform.isDesktopApp = true;
  platform.isMobile = false;
  vibrate = vi.fn();
  Object.assign(navigator, { vibrate });
  lockRequests = 0;
  lockReleases = 0;
  Object.assign(navigator, {
    wakeLock: {
      request: async () => {
        lockRequests++;
        return { release: async () => void lockReleases++ };
      },
    },
  });
  FakeNotification.permission = "granted";
  FakeNotification.requestPermission.mockClear();
  FakeNotification.made = [];
  vi.stubGlobal("Notification", FakeNotification);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const flush = () => vi.advanceTimersByTimeAsync(0);

describe("timer service: alert", () => {
  it("notice without timeout, with Stop; Stop stops the timer and the gong", async () => {
    const s = new TimerService(plugin());
    s.start();
    s.store.start("Boil", "Recipes/Pasta.md", 60, "Pasta");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.store.get()[0].rang).toBeDefined();
    const n = notices.at(-1)!;
    expect(n.duration).toBe(0);
    expect(n.messageEl.textContent).toContain("Timer done: Boil (Pasta)");
    expect(vibrate).toHaveBeenCalledWith([300, 150, 300]);
    n.messageEl.querySelector("button")!.click();
    expect(s.store.get()).toEqual([]);
    expect(vibrate).toHaveBeenLastCalledWith(0);
    s.stop();
  });

  it("hiding the notice, by its hide or by a click anywhere on it, stops that timer", async () => {
    const s = new TimerService(plugin());
    s.start();
    s.store.start("a", "p.md", 10);
    s.store.start("b", "p.md", 10);
    await vi.advanceTimersByTimeAsync(10_000);
    const [na, nb] = notices.slice(-2);
    na.hide();
    expect(s.store.get().map((t) => t.label)).toEqual(["b"]);
    nb.containerEl.click();
    expect(s.store.get()).toEqual([]);
    s.stop();
  });

  it("shows a system notification only when allowed; a click opens the recipe", async () => {
    const pl = plugin();
    const s = new TimerService(pl);
    s.start();
    s.store.start("Boil", "Recipes/Pasta.md", 5);
    await vi.advanceTimersByTimeAsync(5000);
    expect(FakeNotification.made).toHaveLength(1);
    expect(FakeNotification.made[0].options.requireInteraction).toBe(true);
    FakeNotification.made[0].onclick?.();
    expect(openMock).toHaveBeenCalledWith({ recipe: "Recipes/Pasta.md" });
    s.stop();
    FakeNotification.permission = "denied";
    const s2 = new TimerService(plugin());
    s2.start();
    s2.store.start("x", "p.md", 5);
    await vi.advanceTimersByTimeAsync(5000);
    expect(FakeNotification.made).toHaveLength(1);
    s2.stop();
  });

  it("asks for permission only while it is undecided, and never on a phone", () => {
    const s = new TimerService(plugin());
    s.start();
    FakeNotification.permission = "default";
    s.store.start("a", "p.md", 60);
    expect(FakeNotification.requestPermission).toHaveBeenCalledOnce();
    FakeNotification.permission = "granted";
    s.store.start("b", "p.md", 60);
    expect(FakeNotification.requestPermission).toHaveBeenCalledOnce();
    platform.isDesktopApp = false;
    platform.isMobile = true;
    FakeNotification.permission = "default";
    s.store.start("c", "p.md", 60);
    expect(FakeNotification.requestPermission).toHaveBeenCalledOnce();
    s.stop();
  });

  it("says once on a phone that the timer rings only while Obsidian is open", () => {
    platform.isDesktopApp = false;
    platform.isMobile = true;
    const pl = plugin();
    const s = new TimerService(pl);
    s.start();
    s.store.start("a", "p.md", 60);
    expect(notices.at(-1)!.text).toContain("only rings while Obsidian is open");
    expect(saveMock).toHaveBeenCalledWith({ timerPhoneHintSeen: true });
    s.stop();
  });
});

describe("timer service: found late", () => {
  const stored = (over: Record<string, unknown>) => ({
    id: "a",
    label: "Boil",
    recipePath: "Recipes/Pasta.md",
    recipeTitle: "Pasta",
    endAt: T0 - 5 * 60_000,
    ...over,
  });

  it("a timer that ended a few minutes ago rings at once", async () => {
    storage["better-cooking-timers"] = [stored({})];
    const s = new TimerService(plugin());
    s.start();
    expect(vibrate).toHaveBeenCalledWith([300, 150, 300]);
    expect(FakeNotification.made).toHaveLength(1);
    expect(notices.at(-1)!.messageEl.textContent).toContain("ended 5 min ago");
    s.stop();
  });

  it("one that ended more than 15 minutes ago only gets a notice, with hours", async () => {
    storage["better-cooking-timers"] = [stored({ endAt: T0 - 135 * 60_000 })];
    const s = new TimerService(plugin());
    s.start();
    expect(vibrate).not.toHaveBeenCalled();
    expect(FakeNotification.made).toHaveLength(0);
    expect(notices).toHaveLength(1);
    expect(notices[0].messageEl.textContent).toContain("Timer expired: Boil (Pasta, ended 2 h 15 min ago)");
    expect(s.store.get()[0].rang).toBeDefined();
    s.stop();
  });

  it("one that was already over when the plugin loaded is announced without a gong, and does not hold the screen", async () => {
    platform.isDesktopApp = false;
    platform.isMobile = true;
    storage["better-cooking-timers"] = [stored({ endAt: T0 - 3 * 60_000, rang: T0 - 3 * 60_000 })];
    const s = new TimerService(plugin());
    s.start();
    await flush();
    expect(vibrate).not.toHaveBeenCalled();
    expect(FakeNotification.made).toHaveLength(0);
    expect(notices).toHaveLength(1);
    expect(notices[0].messageEl.textContent).toContain("Timer expired: Boil");
    expect(lockRequests).toBe(0);
    s.stop();
  });

  it("checks every second after standby while timers exist, and not otherwise", async () => {
    const s = new TimerService(plugin());
    s.start();
    expect(vi.getTimerCount()).toBe(0);
    s.store.start("a", "p.md", 60);
    expect(vi.getTimerCount()).toBe(2); // the timeout and the one second check
    // Standby: the clock jumps, the timeout is lost.
    vi.setSystemTime(T0 + 120_000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.store.get()[0].rang).toBeDefined();
    s.store.stop(s.store.get()[0].id);
    expect(vi.getTimerCount()).toBe(0);
    s.stop();
  });
});

describe("timer service: screen", () => {
  it("on a phone a running timer holds the screen, the gong holds it while it plays, stopping lets go", async () => {
    platform.isDesktopApp = false;
    platform.isMobile = true;
    const s = new TimerService(plugin());
    s.start();
    s.store.start("a", "p.md", 30);
    await flush();
    expect(lockRequests).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(s.wake.held).toBe(true); // the gong plays
    s.store.stop(s.store.get()[0].id);
    await flush();
    expect(lockReleases).toBe(1);
    expect(s.wake.held).toBe(false);
    s.stop();
  });

  it("on the desktop a timer does not hold the screen", async () => {
    const s = new TimerService(plugin());
    s.start();
    s.store.start("a", "p.md", 30);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(lockRequests).toBe(0);
    s.stop();
  });

  it("keeps the volume per device in local storage, normal by default", () => {
    const s = new TimerService(plugin());
    expect(s.volume()).toBe("normal");
    s.setVolume("loud");
    expect(storage["better-cooking-timer-volume"]).toBe("loud");
    expect(s.volume()).toBe("loud");
    storage["better-cooking-timer-volume"] = "deafening";
    expect(s.volume()).toBe("normal");
  });
});

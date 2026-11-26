// The timers of the plugin, alive as long as Obsidian runs (not tied to the view): the store with its saved list, the
// alerts when one ends (notice, system notification on the desktop, gong, vibration), the status bar entry and the
// screen that stays on. Texts: src/strings; the model: src/timers.ts; the UI subscribes to `store`.
import { Notice, Platform } from "obsidian";
import type BetterCookingPlugin from "./main";
import { timer as clock } from "./cooking";
import { tr } from "./i18n";
import { Chime } from "./timerSound";
import { TimerStore } from "./timerStore";
import { isRinging, isRunning, remaining, sortTimers, type Timer } from "./timers";
import { WakeLock } from "./wakeLock";

/** Key in Obsidian's local storage: per device, not synchronised, not part of data.json. */
const STORAGE_KEY = "better-cooking-timers";

/** Recipe name for texts: the note name (the timer only knows the path). */
const recipeName = (path: string) => (path.split("/").pop() ?? path).replace(/\.md$/i, "");

const notificationApi = (): typeof Notification | undefined =>
  typeof Notification === "undefined" ? undefined : Notification;

export class TimerService {
  readonly store: TimerStore;
  /** Screen on: cooking mode (src/main.ts keepAwake) and running timers. */
  readonly wake = new WakeLock();
  private chime = new Chime();
  private notices = new Map<string, Notice>();
  private alerts = new Map<string, Notification>();
  private status: HTMLElement | null = null;

  constructor(private plugin: BetterCookingPlugin) {
    const app = plugin.app;
    this.store = new TimerStore({
      now: () => Date.now(),
      load: (): unknown => app.loadLocalStorage(STORAGE_KEY) as unknown,
      save: (list) => app.saveLocalStorage(STORAGE_KEY, list.length ? list : null),
      setTimer: (run, ms) => window.setTimeout(run, ms),
      clearTimer: (h) => window.clearTimeout(h as number),
      onStart: () => this.onStart(),
      onDue: (fired, late) => this.onDue(fired, late),
    });
  }

  /** Call once at load. */
  start() {
    const p = this.plugin;
    if (Platform.isDesktopApp) {
      this.status = p.addStatusBarItem();
      this.status.addClass("mod-clickable");
      this.status.addEventListener("click", () => void p.open());
    }
    this.store.subscribe(() => this.changed());
    // A hidden window may have throttled or missed timeouts, and the browser dropped the screen lock: look again.
    p.registerDomEvent(window.document, "visibilitychange", () => {
      if (window.document.visibilityState === "hidden") return;
      void this.wake.refresh();
      this.store.check();
      this.paintStatus();
    });
    p.registerInterval(window.setInterval(() => this.paintStatus(), 1000));
    // Timers that ended while Obsidian was closed are reported once the workspace is there.
    p.app.workspace.onLayoutReady(() => this.store.check());
    this.changed();
  }

  /** Call at unload. */
  stop() {
    this.store.dispose();
    this.chime.close();
    void this.wake.hold("timer", false);
    for (const n of this.notices.values()) n.hide();
    for (const n of this.alerts.values()) n.close();
    this.notices.clear();
    this.alerts.clear();
  }

  /** One gong at the chosen volume (settings), unless a timer is ringing anyway. */
  testSound() {
    this.chime.prepare();
    if (this.chime.playing) return;
    this.chime.start(this.plugin.settings.timerVolume);
    window.setTimeout(() => {
      if (!this.store.get().some(isRinging)) this.chime.stop();
    }, 1500);
  }

  /** The user started a timer: this tap may unlock sound (iOS) and ask for permission to notify. */
  private onStart() {
    this.chime.prepare();
    const n = notificationApi();
    if (Platform.isDesktopApp && n?.permission === "default")
      void Promise.resolve(n.requestPermission()).catch(() => undefined);
    if (Platform.isMobile && !this.plugin.settings.timerPhoneHintSeen) {
      new Notice(tr("timerPhoneHint"), 12_000);
      void this.plugin.save({ timerPhoneHintSeen: true });
    }
  }

  private onDue(fired: Timer[], late: number) {
    this.chime.start(this.plugin.settings.timerVolume);
    for (const t of fired) {
      this.notice(t, late);
      this.systemNotification(t, late);
    }
  }

  private text(t: Timer, late: number) {
    const min = Math.round(late / 60_000);
    const recipe = recipeName(t.recipePath);
    return {
      title: tr("timerOverTitle", { label: t.label }),
      body: min >= 1 ? tr("timerOverLate", { recipe, min }) : tr("timerOverBody", { recipe }),
    };
  }

  /** A notice that stays until it is clicked away, with a Stop button. */
  private notice(t: Timer, late: number) {
    const { title, body } = this.text(t, late);
    const notice = new Notice("", 0);
    notice.messageEl.createSpan({ text: `${title} (${body}) ` });
    notice.messageEl
      .createEl("button", { text: tr("timerStop") })
      .addEventListener("click", () => this.store.stop(t.id));
    this.notices.set(t.id, notice);
  }

  /** Desktop only, and only if the user allowed it (asked when the first timer was started). */
  private systemNotification(t: Timer, late: number) {
    const n = notificationApi();
    if (!Platform.isDesktopApp || n?.permission !== "granted") return;
    try {
      const { title, body } = this.text(t, late);
      const alert = new n(title, { body, requireInteraction: true, tag: t.id });
      alert.onclick = () => {
        window.focus();
        void this.plugin.open({ recipe: t.recipePath });
      };
      this.alerts.set(t.id, alert);
    } catch {
      /* the notice is there anyway */
    }
  }

  /** After every change of the list: sound, screen, alerts that are no longer needed, status bar. */
  private changed() {
    const list = this.store.get();
    const ringing = new Set(list.filter(isRinging).map((t) => t.id));
    if (!ringing.size) this.chime.stop();
    void this.wake.hold(
      "timer",
      list.some((t) => isRunning(t) || isRinging(t)),
    );
    for (const [id, n] of this.notices) {
      if (ringing.has(id)) continue;
      n.hide();
      this.notices.delete(id);
    }
    for (const [id, n] of this.alerts) {
      if (ringing.has(id)) continue;
      n.close();
      this.alerts.delete(id);
    }
    this.paintStatus();
  }

  /** The next timer in the status bar (desktop). */
  private paintStatus() {
    const el = this.status;
    if (!el) return;
    const list = this.store.get();
    if (!list.length) return el.hide();
    const now = Date.now();
    const [first, ...others] = sortTimers(list, now);
    const text = isRinging(first)
      ? tr("timerStatusOver", { label: first.label })
      : others.length
        ? tr("timerStatusMore", { time: clock(remaining(first, now) / 1000), label: first.label, n: others.length })
        : tr("timerStatus", { time: clock(remaining(first, now) / 1000), label: first.label });
    el.show();
    if (el.textContent !== text) el.setText(text);
  }
}

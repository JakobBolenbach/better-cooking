// The timers of the plugin, alive as long as Obsidian runs (not tied to the view): the store with its saved list, the
// alerts when one ends (notice, system notification on the desktop, gong, vibration), the status bar entry and the
// screen that stays on. Texts: src/strings; the model: src/timers.ts; the UI subscribes to `store`.
import { Notice, Platform } from "obsidian";
import type BetterCookingPlugin from "./main";
import { timer as clock } from "./cooking";
import { tr } from "./i18n";
import { noticeWithAction } from "./notice";
import { noteName } from "./parse";
import { Chime, DEFAULT_VOLUME, isVolume, type TimerVolume } from "./timerSound";
import { TimerStore } from "./timerStore";
import {
  QUIET_AFTER,
  due,
  isRinging,
  isRunning,
  remaining,
  screenWanted,
  sortTimers,
  splitAgo,
  type Timer,
} from "./timers";
import { WakeLock } from "./wakeLock";

/** Keys in Obsidian's local storage: per device, not synchronised, not part of data.json. */
const STORAGE_KEY = "better-cooking-timers";
const VOLUME_KEY = "better-cooking-timer-volume";

const notificationApi = (): typeof Notification | undefined =>
  typeof Notification === "undefined" ? undefined : Notification;

export class TimerService {
  readonly store: TimerStore;
  /** Screen on: cooking mode (src/main.ts keepAwake) and, on a phone, running timers and the gong. */
  readonly wake = new WakeLock();
  private chime = new Chime(() => {
    this.syncWake();
    this.restAudio(true);
  });
  private notices = new Map<string, Notice>();
  private alerts = new Map<string, Notification>();
  private status: HTMLElement | null = null;
  private tick: number | undefined;

  constructor(private plugin: BetterCookingPlugin) {
    const app = plugin.app;
    this.store = new TimerStore({
      now: () => Date.now(),
      load: (): unknown => app.loadLocalStorage(STORAGE_KEY) as unknown,
      save: (list) => app.saveLocalStorage(STORAGE_KEY, list.length ? list : null),
      setTimer: (run, ms) => window.setTimeout(run, ms),
      clearTimer: (h) => window.clearTimeout(h as number),
      onStart: () => this.onStart(),
      onDue: (fired, now) => this.onDue(fired, now),
    });
  }

  /** Volume of the gong; per device (a phone may be loud and the desktop quiet). */
  volume(): TimerVolume {
    const v: unknown = this.plugin.app.loadLocalStorage(VOLUME_KEY);
    return isVolume(v) ? v : DEFAULT_VOLUME;
  }
  setVolume(v: TimerVolume) {
    this.plugin.app.saveLocalStorage(VOLUME_KEY, v);
  }

  /** Call once at load. */
  start() {
    const p = this.plugin;
    if (Platform.isDesktopApp) {
      this.status = p.addStatusBarItem();
      this.status.addClass("mod-clickable");
      // Only opens the view; stopping a timer is done in the notice, the timer list or the notification.
      this.status.addEventListener("click", () => void p.open());
    }
    this.store.subscribe(() => this.changed());
    // A hidden window may have throttled or missed timeouts, and the browser dropped the screen lock: look again.
    const lookAgain = () => {
      if (window.document.visibilityState === "hidden") return;
      void this.wake.refresh();
      this.store.check();
      this.paintStatus();
    };
    p.registerDomEvent(window.document, "visibilitychange", lookAgain);
    p.registerDomEvent(window, "focus", lookAgain);
    // The first tap in the view after the audio context rested: iOS plays only from a context woken in a gesture.
    p.registerDomEvent(window.document, "pointerdown", () => this.store.get().length && this.chime.prepare(), true);
    // Timers that ended while Obsidian was closed are reported once the workspace is there.
    p.app.workspace.onLayoutReady(() => {
      this.store.check();
      this.announceRestored();
    });
    this.changed();
  }

  /** Call at unload. */
  stop() {
    this.store.dispose();
    this.chime.close();
    void this.wake.hold("timer", false);
    if (this.tick !== undefined) window.clearInterval(this.tick);
    this.tick = undefined;
    const notices = [...this.notices.values()];
    this.notices.clear();
    for (const n of notices) n.hide();
    for (const n of this.alerts.values()) n.close();
    this.alerts.clear();
  }

  /** One gong at the chosen volume (settings), whatever else rings. */
  testSound() {
    this.chime.once(this.volume());
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

  /** Timers that just ended. One found long after its end (standby, restart) only gets a notice: no gong, no system alert. */
  private onDue(fired: Timer[], now: number) {
    const loud = fired.filter((t) => now - t.endAt <= QUIET_AFTER);
    if (loud.length) this.chime.start(this.volume());
    for (const t of fired) {
      const late = now - t.endAt;
      this.notice(t, late, late > QUIET_AFTER);
      if (loud.includes(t)) this.systemNotification(t, late);
    }
    this.syncWake();
  }

  /** Timers that were already over when the plugin loaded (and nobody stopped): say so once, without a gong. */
  private announceRestored() {
    const now = Date.now();
    for (const t of this.store.get()) if (isRinging(t) && !this.notices.has(t.id)) this.notice(t, now - t.endAt, true);
  }

  private text(t: Timer, late: number, expired: boolean) {
    const { h, min } = splitAgo(late);
    const ago = h ? tr("timerAgoHours", { h, min }) : tr("timerAgoMin", { min });
    const recipe = t.recipeTitle ?? noteName(t.recipePath);
    return {
      title: tr(expired ? "timerExpiredTitle" : "timerOverTitle", { label: t.label }),
      body: late >= 60_000 ? tr("timerOverLate", { recipe, ago }) : tr("timerOverBody", { recipe }),
    };
  }

  /** A notice that stays until it is clicked away; clicking it away (or its Stop button) stops that timer. */
  private notice(t: Timer, late: number, expired: boolean) {
    const { title, body } = this.text(t, late, expired);
    const notice = noticeWithAction(
      `${title} (${body})`,
      { label: tr("timerStop"), run: () => this.store.stop(t.id) },
      0,
    );
    this.notices.set(t.id, notice);
    const gone = () => {
      if (this.notices.get(t.id) !== notice) return;
      this.notices.delete(t.id);
      this.store.stop(t.id);
    };
    // Hiding is what a click anywhere on the notice does; both ways lead here.
    const hide = notice.hide.bind(notice);
    notice.hide = () => {
      hide();
      gone();
    };
    notice.containerEl.addEventListener("click", gone);
  }

  /** Desktop only, and only if the user allowed it (asked when the first timer was started). */
  private systemNotification(t: Timer, late: number) {
    const n = notificationApi();
    if (!Platform.isDesktopApp || n?.permission !== "granted") return;
    try {
      const { title, body } = this.text(t, late, false);
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

  /**
   * The audio context rests only when nothing is left that will ring: no running timer and no gong. A timer that is
   * over counts as about to ring (its gong starts right after the list changed) unless the gong ended (`gongEnded`).
   */
  private restAudio(gongEnded = false) {
    const list = this.store.get();
    if (this.chime.playing || list.some(isRunning) || (!gongEnded && list.some(isRinging))) return;
    this.chime.rest();
  }

  private syncWake() {
    void this.wake.hold("timer", screenWanted(this.store.get(), Platform.isMobile, this.chime.playing));
  }

  /** After every change of the list: sound, screen, alerts that are no longer needed, the check, status bar. */
  private changed() {
    const list = this.store.get();
    const ringing = new Set(list.filter(isRinging).map((t) => t.id));
    if (!ringing.size) this.chime.stop();
    this.syncWake();
    this.restAudio();
    for (const [id, n] of [...this.notices]) {
      if (ringing.has(id)) continue;
      this.notices.delete(id);
      n.hide();
    }
    for (const [id, n] of [...this.alerts]) {
      if (ringing.has(id)) continue;
      this.alerts.delete(id);
      n.close();
    }
    // One second check, only while a timer runs: after standby its timeout may be late or lost.
    const running = list.some(isRunning);
    if (running && this.tick === undefined) this.tick = window.setInterval(() => this.everySecond(), 1000);
    if (!running && this.tick !== undefined) {
      window.clearInterval(this.tick);
      this.tick = undefined;
    }
    this.paintStatus();
  }

  private everySecond() {
    if (due(this.store.get(), Date.now()).length) this.store.check();
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
    const time = clock(remaining(first, now) / 1000);
    const text = isRinging(first)
      ? tr("timerStatusOver", { label: first.label })
      : others.length
        ? tr("timerStatusMore", { time, label: first.label, n: others.length })
        : tr("timerStatus", { time, label: first.label });
    el.show();
    if (el.textContent !== text) el.setText(text);
  }
}

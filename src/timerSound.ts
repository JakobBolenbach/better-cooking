// The signal of a timer that is over: a short gong made with WebAudio (no sound file), repeated every few seconds
// until the user stops it, for two minutes at most; on phones with vibration where the device has it.

export type TimerVolume = "off" | "low" | "normal" | "loud";
export const TIMER_VOLUMES: readonly TimerVolume[] = ["off", "low", "normal", "loud"];
export const DEFAULT_VOLUME: TimerVolume = "normal";

const GAIN: Record<TimerVolume, number> = { off: 0, low: 0.08, normal: 0.25, loud: 0.6 };
export const gainFor = (v: TimerVolume): number => GAIN[v] ?? GAIN[DEFAULT_VOLUME];
export const isVolume = (v: unknown): v is TimerVolume => TIMER_VOLUMES.includes(v as TimerVolume);

export const REPEAT_MS = 4000;
export const MAX_RING_MS = 120_000;

type Ctx = AudioContext;
const contextClass = (): (new () => Ctx) | undefined =>
  window.AudioContext ?? (window as unknown as { webkitAudioContext?: new () => Ctx }).webkitAudioContext;

export class Chime {
  private ctx: Ctx | null = null;
  private loop: number | undefined;
  private stopAt = 0;

  /** `onStop` is called when the repeated gong ends, also by itself after two minutes. */
  constructor(private onStop?: () => void) {}

  /** Create or wake the audio context. Call it from a tap (iOS plays nothing from a context made later, outside one). */
  prepare() {
    try {
      const Ctx = contextClass();
      if (!Ctx) return;
      this.ctx ??= new Ctx();
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => undefined);
    } catch {
      /* without sound */
    }
  }

  get playing() {
    return this.loop !== undefined;
  }

  /**
   * Gong now and again every few seconds until `stop()` or two minutes. Called again while it plays (another timer
   * ended): one more gong now and two minutes from now.
   */
  start(volume: TimerVolume) {
    this.stopAt = Date.now() + MAX_RING_MS;
    this.gong(gainFor(volume), true);
    if (this.playing) return;
    this.loop = window.setInterval(() => {
      if (Date.now() >= this.stopAt) return this.stop();
      this.gong(gainFor(volume), true);
    }, REPEAT_MS);
  }

  /** One gong, nothing else: the test in the settings. Independent of the repeated gong. */
  once(volume: TimerVolume) {
    this.gong(gainFor(volume), false);
  }

  /** Stop the repeated gong (if it plays). */
  stop() {
    const was = this.playing;
    if (this.loop !== undefined) window.clearInterval(this.loop);
    this.loop = undefined;
    try {
      navigator.vibrate?.(0);
    } catch {
      /* no vibration */
    }
    if (was) this.onStop?.();
  }

  /** Let the audio context rest, so an idle one does not keep the audio session busy; `prepare()` wakes it again. */
  rest() {
    if (this.ctx?.state === "running") void this.ctx.suspend().catch(() => undefined);
  }

  /** Free the audio context (plugin unload). */
  close() {
    this.onStop = undefined;
    this.stop();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  /** One gong: two sine tones (660 and 880 Hz) that fade out; with vibration, if the device can. */
  private gong(gain: number, vibrate: boolean) {
    try {
      if (vibrate) navigator.vibrate?.([300, 150, 300]);
    } catch {
      /* no vibration */
    }
    if (gain <= 0) return;
    this.prepare();
    const ctx = this.ctx;
    if (!ctx) return;
    [660, 880].forEach((hz, i) => {
      const at = ctx.currentTime + i * 0.35;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 1.2);
      o.connect(g).connect(ctx.destination);
      o.start(at);
      o.stop(at + 1.25);
    });
  }
}

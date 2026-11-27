// Keeps the screen on while something needs it (cooking mode, a running timer). The browser releases the lock whenever
// the page is hidden, so it is requested again when the page is visible again (`refresh`).

export interface Sentinel {
  release(): Promise<void>;
  addEventListener?(type: "release", f: () => void): void;
}

/** Ask the device for the lock (Screen Wake Lock API); null if it cannot. */
export async function requestScreenLock(): Promise<Sentinel | null> {
  const wl = (navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<Sentinel> } }).wakeLock;
  if (!wl) return null;
  return wl.request("screen");
}

export class WakeLock {
  private reasons = new Set<string>();
  private sentinel: Sentinel | null = null;
  private busy: Promise<unknown> = Promise.resolve();

  constructor(
    private request: () => Promise<Sentinel | null> = requestScreenLock,
    private visible: () => boolean = () => window.document.visibilityState !== "hidden",
  ) {}

  /** Keep the screen on (or stop doing so) for one reason; true if the screen stays on now. */
  hold(reason: string, on: boolean): Promise<boolean> {
    if (on === this.reasons.has(reason)) return this.sync();
    if (on) this.reasons.add(reason);
    else this.reasons.delete(reason);
    return this.sync();
  }

  /** The page came back to the front: the browser let go of the lock meanwhile, ask again. */
  refresh(): Promise<boolean> {
    return this.sync();
  }

  get held() {
    return this.sentinel !== null;
  }

  /** One change at a time, so two quick calls never leave a lock nobody releases. */
  private sync(): Promise<boolean> {
    const run = this.busy.then(() => this.apply());
    this.busy = run.catch(() => undefined);
    return run;
  }

  private async apply(): Promise<boolean> {
    try {
      if (!this.reasons.size) {
        const old = this.sentinel;
        this.sentinel = null;
        await old?.release();
        return false;
      }
      if (this.sentinel || !this.visible()) return this.sentinel !== null;
      const s = await this.request();
      if (!s) return false;
      s.addEventListener?.("release", () => {
        if (this.sentinel === s) this.sentinel = null;
      });
      this.sentinel = s;
      return true;
    } catch {
      return false;
    }
  }
}

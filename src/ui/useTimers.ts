// Timers in the App: follows the store of the plugin (src/timerStore.ts), and ticks once a second for the display
// while one is running and the view is visible. The alert itself does not depend on this tick.
import { useEffect, useState } from "preact/hooks";
import type { TimerApi } from "../timerStore";
import { isPaused, isRunning, sortTimers } from "../timers";

export function useTimers(api: TimerApi) {
  const [list, setList] = useState(api.get);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const read = () => {
      setList(api.get());
      setNow(Date.now());
    };
    read();
    return api.subscribe(read);
  }, [api]);

  const running = list.some(isRunning);
  useEffect(() => {
    if (!running) return;
    const doc = window.document;
    let t: number | undefined;
    const stop = () => {
      if (t !== undefined) window.clearInterval(t);
      t = undefined;
    };
    const go = () => {
      stop();
      setNow(Date.now());
      if (doc.visibilityState !== "hidden") t = window.setInterval(() => setNow(Date.now()), 1000);
    };
    go();
    doc.addEventListener("visibilitychange", go);
    return () => {
      stop();
      doc.removeEventListener("visibilitychange", go);
    };
  }, [running]);

  return {
    timers: sortTimers(list, now),
    now,
    start: (label: string, recipePath: string, seconds: number) => api.start(label, recipePath, seconds),
    toggle: (id: string) => {
      const t = list.find((x) => x.id === id);
      if (t) (isPaused(t) ? api.resume : api.pause)(id);
    },
    plusMinute: api.addMinute,
    stop: api.stop,
  };
}

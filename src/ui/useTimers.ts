// Timers of the App: state, the one-second tick while one runs, the "done" hint and the actions of the timer bar.
import { useEffect, useState } from "preact/hooks";
import type { TimerEngine } from "./shared";
import { ring } from "./cookingMode";
import { tr } from "../i18n";

export function useTimers(onHint: (text: string) => void) {
  const [timers, setTimers] = useState<TimerEngine[]>([]);
  const [now, setNow] = useState(Date.now());

  // Once per second, only while one is running.
  useEffect(() => {
    if (!timers.some((u) => !u.done && u.rest === undefined)) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [timers]);
  useEffect(() => {
    const done = timers.filter((u) => !u.done && u.rest === undefined && u.end <= now);
    if (!done.length) return;
    setTimers((old) => old.map((u) => (done.some((f) => f.id === u.id) ? { ...u, done: true } : u)));
    for (const f of done) {
      onHint(tr("timerDone", { title: f.title, recipe: f.recipe }));
      ring();
    }
  }, [now]);

  const start = (title: string, recipe: string, sec: number) => {
    setTimers((u) => [...u, { id: Date.now() + Math.random(), title, recipe, end: Date.now() + sec * 1000 }]);
    setNow(Date.now());
  };
  const pause = (id: number) =>
    setTimers((u) =>
      u.map((x) =>
        x.id !== id
          ? x
          : x.rest !== undefined
            ? { ...x, end: Date.now() + x.rest, rest: undefined }
            : { ...x, rest: Math.max(0, x.end - Date.now()) },
      ),
    );
  const dismiss = (id: number) => setTimers((u) => u.filter((x) => x.id !== id));
  return { timers, now, start, pause, dismiss };
}

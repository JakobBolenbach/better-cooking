// Small building blocks shared by several parts of the UI: text with highlighting, stars, images, modals, hooks.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Status } from "../types";
import { Icon, type IconName } from "./icons";
import { sanitizeSvg } from "./svg";
import { tr, type Key } from "../i18n";
import { scrollDelta } from "../bottomInset";

export type List = "alle" | "bewaehrt" | "ausprobieren" | "zuletzt" | "verworfen" | `kat:${string}`;

export interface TimerEngine {
  id: number;
  title: string;
  recipe: string;
  /** End in ms (running) or remaining time in ms (paused). */
  end: number;
  rest?: number;
  done?: boolean;
}

const STATUS_KEY: Record<Status, Key> = {
  ausprobieren: "statusToTry",
  bewaehrt: "statusProven",
  verworfen: "statusDiscarded",
};
/** Status in the UI language. */
export const statusLabel = (s: Status): string => tr(STATUS_KEY[s]);

const IMPORT_STATE_KEY: Record<string, Key> = {
  fertig: "importStateDone",
  teilweise: "importStatePartial",
  fehler: "importStateError",
};
/** Import state from the frontmatter (fertig, teilweise, fehler) in the UI language; unknown values as they are. */
export const importStateLabel = (v?: string): string =>
  v && IMPORT_STATE_KEY[v] ? tr(IMPORT_STATE_KEY[v]) : (v ?? "");

// ---------------------------------------------------------------- small building blocks

/** Inline Markdown: **bold**, [text](URL), `code`. Everything else stays text (no HTML). */
export function Inline({ text }: { text: string }) {
  const parts: ComponentChildren[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|`([^`]+)`/g;
  let pos = 0;
  let k = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > pos) parts.push(text.slice(pos, m.index));
    if (m[1]) parts.push(<strong key={k++}>{m[1]}</strong>);
    else if (m[2])
      parts.push(
        <a key={k++} href={m[3]} target="_blank" rel="noopener">
          {m[2]}
        </a>,
      );
    else if (m[4]) parts.push(<code key={k++}>{m[4]}</code>);
    pos = m.index + m[0].length;
  }
  if (pos < text.length) parts.push(text.slice(pos));
  return <>{parts}</>;
}

export function timeShort(min?: number): string | undefined {
  if (!min) return undefined;
  if (min < 60) return tr("minutes", { m: min });
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? tr("hoursMinutes", { h, m: r }) : tr("hours", { h });
}

export function Stars({
  value,
  onValue,
  large,
}: {
  value?: number;
  onValue?: (n: number | null) => void;
  large?: boolean;
}) {
  const w = Math.round(value ?? 0);
  if (!onValue) {
    if (!w) return null;
    return (
      <span class="rz-sterne" aria-label={tr("starsOf5", { n: w })}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Icon key={i} n="stern" large={large ? 18 : 13} className={i <= w ? "an" : ""} />
        ))}
      </span>
    );
  }
  return (
    <span class="rz-sterne rz-sterne-wahl" role="radiogroup" aria-label={tr("rating")}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={i === w}
          aria-label={tr("nOf5", { n: i })}
          class={i <= w ? "an" : ""}
          onClick={() => onValue(i === w ? null : i)}
        >
          <Icon n="stern" large={large ? 24 : 20} />
        </button>
      ))}
    </span>
  );
}

export function StatusBadge({ s }: { s: Status }) {
  const ic: Record<Status, IconName> = { bewaehrt: "siegel", ausprobieren: "kolben", verworfen: "daumen" };
  return (
    <span class={`rz-marke rz-marke-${s}`}>
      <Icon n={ic[s]} large={13} />
      {statusLabel(s)}
    </span>
  );
}

/**
 * Timeline graphic as embedded SVG. The file's styles (for the note in Obsidian) are removed;
 * plugin.css colors the classes with the kitchen palette, so the graphic follows the plugin's light/dark mode and fonts.
 * The file comes from an import and is untrusted: sanitizeSvg keeps only drawing elements.
 */
export function Timeline({ svg }: { svg: string }) {
  const html = useMemo(() => sanitizeSvg(svg), [svg]);
  return <div class="rz-ablauf" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Image({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div class={`rz-bild-leer ${className ?? ""}`} aria-hidden="true">
        <Icon n="besteck" large={28} />
      </div>
    );
  }
  return <img class={className} src={src} alt={alt} loading="lazy" decoding="async" onError={() => setBroken(true)} />;
}

// ---------------------------------------------------------------- Modals

/** Dialog (bottom sheet on narrow views). `footer` holds the action buttons; it is rendered outside the scrolling part,
 *  so it is always the last element and nothing can lie below it. */
export function Modal({
  title,
  onCloseView,
  children,
  footer,
  id,
}: {
  title: string;
  onCloseView: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  id: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const doc = el.ownerDocument;
    const opener = doc.activeElement as HTMLElement | null;
    // Text field first (pasting), otherwise the modal itself: no focus ring on a button nobody chose.
    (el.querySelector<HTMLElement>("textarea, input[type=text]") ?? el).focus({ preventScroll: true });
    // On-screen keyboard: once it has slid in and src/insets.ts has made room, bring the focused field into the
    // visible part of the dialog by moving the dialog's own scroll position (the page behind stays put).
    const win = doc.defaultView;
    let timer: number | undefined;
    const keep = () => {
      win?.clearTimeout(timer);
      timer = win?.setTimeout(() => {
        const active = el?.ownerDocument.activeElement;
        const area = body.current;
        if (!el || !area || !active || !area.contains(active) || !win) return;
        if (!(parseFloat(win.getComputedStyle(el).getPropertyValue("--rz-tastatur")) > 0)) return;
        area.scrollTop += scrollDelta(active.getBoundingClientRect(), area.getBoundingClientRect());
      }, 120);
    };
    el.addEventListener("focusin", keep);
    win?.visualViewport?.addEventListener("resize", keep);
    // However the modal closes (Esc, X, background), the focus goes back to what opened it, else to the
    // app. That keeps it inside the view, so Obsidian's key scope of the view stays active.
    return () => {
      win?.clearTimeout(timer);
      el.removeEventListener("focusin", keep);
      win?.visualViewport?.removeEventListener("resize", keep);
      const active = doc.activeElement;
      if (active && active !== doc.body && !el.contains(active)) return; // the user moved on
      const app = el.closest<HTMLElement>(".rz-app");
      // Only an opener inside this app counts (a command from an editor in another leaf opens it from outside).
      const back = opener && app?.contains(opener) && opener.isConnected && !el.contains(opener) ? opener : null;
      (back ?? app)?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div
      class="rz-fenster-grund"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCloseView();
      }}
    >
      <div class="rz-fenster" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref} tabIndex={-1}>
        <div class={`rz-fenster-inhalt${footer ? " mit-fuss" : ""}`} ref={body}>
          <div class="rz-fenster-kopf">
            <h2 id={id} class="rz-h2">
              {title}
            </h2>
            <button type="button" class="rz-symbol" aria-label={tr("close")} onClick={onCloseView}>
              <Icon n="x" large={20} />
            </button>
          </div>
          {children}
        </div>
        {footer && <div class="rz-fenster-fuss">{footer}</div>}
      </div>
    </div>
  );
}

/** Re-renders every 30 s, so cards show "dauert länger" without new data. */
export function useTick(ms = 30_000): number {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    const i = window.setInterval(() => setT(Date.now()), ms);
    return () => window.clearInterval(i);
  }, [ms]);
  return t;
}

/** Back by swiping from the left edge (narrow layout), follows the finger. */
export function useSwipeBack(back: () => void) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current?.closest(".rz-detail-ebene") as HTMLElement | null;
    const detail = ref.current;
    if (!el || !detail) return;
    let start: { x: number; y: number; t: number; id: number } | null = null;
    let dx = 0;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || e.clientX - el.getBoundingClientRect().left > 28) return;
      start = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      dx = 0;
    };
    const moved = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      dx = Math.max(0, e.clientX - start.x);
      if (dx > 8 && Math.abs(e.clientY - start.y) < dx) {
        el.classList.add("rz-zieht");
        el.style.transform = `translateX(${dx}px)`;
      }
    };
    const onRelease = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const v = dx / Math.max(1, performance.now() - start.t);
      el.classList.remove("rz-zieht");
      el.style.transform = "";
      if (dx > el.clientWidth * 0.33 || (dx > 40 && v > 0.5)) back();
      start = null;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", moved);
    el.addEventListener("pointerup", onRelease);
    el.addEventListener("pointercancel", onRelease);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", moved);
      el.removeEventListener("pointerup", onRelease);
      el.removeEventListener("pointercancel", onRelease);
    };
  }, []);
  return { ref };
}

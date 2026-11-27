// Fetching recipes: import modal, running jobs as cards and their buttons.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useEffect, useMemo, useState } from "preact/hooks";
import { detectSource, findDuplicate, type Kind } from "../source";
import type { SocialRoute } from "../socialFlow";
import type { Job, RecipeView } from "../types";
import { jobError, processorName, jobFailed, jobState, SLOW_MIN, type ActiveProcessor } from "../processor";
import { Image, Modal, useTick } from "./shared";
import { Icon, type IconName } from "./icons";
import { locale, tr } from "../i18n";
import { syncButtonJob, syncHintDue, type SyncReport } from "../importSync";
import type { SyncProp } from "./syncButton";
import { JobButtons } from "./jobButtons";

/** "Sync now" for a card: the hint on every card, the button only on the first running one (issue #82). */
export const syncProp = (jobs: Job[], a: Job, run?: () => Promise<SyncReport>): SyncProp | undefined =>
  run ? { run, button: syncButtonJob(jobs, Date.now()) === a.id } : undefined;

export function JobCard(p: {
  a: Job;
  onDismiss: () => void;
  onRetry: () => Promise<void>;
  /** "Remove" on a job with a failure note: trashes the note and drops the job (after the question in the card). */
  onRemoveFailed?: () => void;
  sync?: SyncProp;
}) {
  const { a, onDismiss, onRetry, onRemoveFailed, sync } = p;
  const kind = detectSource(a.input);
  const now = useTick();
  const state = jobState(a, now);
  const title = state === "fehler" ? tr("jobFailed") : state === "langsam" ? tr("jobSlow") : tr("jobRunning");
  return (
    <div
      class={`rz-karte rz-karte-auftrag${state === "fehler" ? " fehler" : ""}${state === "langsam" ? " langsam" : ""}`}
      role="status"
    >
      <span class="rz-karte-bild rz-auftrag-bild">
        {state === "fehler" ? <Icon n="warnung" large={28} /> : <Icon n="lader" large={28} className="rz-dreht" />}
      </span>
      <span class="rz-karte-text">
        <span class="rz-karte-titel">{title}</span>
        <span class="rz-karte-meta">
          <span>{kind.label}</span>
          <span>{a.processor === "claude" ? "Claude" : "GitHub"}</span>
          <span>
            {tr("since", {
              time: new Date(a.since).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }),
            })}
          </span>
        </span>
        {state === "fehler" && <span class="rz-karte-grund">{jobError(a)}</span>}
        {state === "langsam" && <span class="rz-karte-grund">{tr("slowHint", { n: SLOW_MIN })}</span>}
        {state === "laeuft" && sync && syncHintDue(a, now) && (
          <span class="rz-karte-grund">{tr("waitingForSync", { processor: processorName(a.processor) })}</span>
        )}
        <JobButtons a={a} onRetry={onRetry} onRemove={a.failedNote ? onRemoveFailed : undefined} sync={sync} />
      </span>
      {!(a.failedNote && onRemoveFailed) && (
        <button type="button" class="rz-karte-weg" aria-label={tr("removeJob")} onClick={onDismiss}>
          <Icon n="x" large={14} />
        </button>
      )}
    </div>
  );
}

export function ImportModal(p: {
  recipes: RecipeView[];
  jobs: Job[];
  processor: ActiveProcessor | null;
  status?: { short: string; long: string; notReady?: string };
  /** The way for a social media link; without it social media counts as needing the processor. */
  route?: (kind: Kind) => SocialRoute | null;
  onImport: (input: string) => Promise<{ ok: boolean; message?: string }>;
  onCloseView: () => void;
  onOpenNote: (path: string) => void;
  onJobGone: (id: string) => void;
  onRetry: (id: string) => Promise<void>;
  onSyncNow?: () => Promise<SyncReport>;
  onRemoveFailed?: (id: string) => void;
  /** Reports whether the user has typed something (the page does not change over it without a word). */
  onDirty?: (dirty: boolean) => void;
}) {
  const [input, setInput] = useState("");
  useEffect(() => {
    p.onDirty?.(!!input.trim());
  }, [input]);
  useEffect(() => () => p.onDirty?.(false), []);
  const [anyway, setAnyway] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const e = useMemo(() => detectSource(input), [input]);
  const duplicate = useMemo(() => findDuplicate(e, p.recipes), [e, p.recipes]);
  const openEquals = p.jobs.find((a) => !jobFailed(a) && a.key && a.key === e.key);
  // Recipe websites and social media posts are read in the plugin; pasted text too when no processor is set up
  // (offline rules, #15). Only Claude or GitHub chosen on purpose take a social media link as a job.
  const route = p.route?.(e.kind) ?? null;
  const via = route ? (route.via === "processor" ? route.processor : null) : p.processor;
  const local = route?.via === "local" ? route : null;
  const facebook = route?.via === "facebook";
  const offlineText = e.kind === "text" && !via;
  const direct = e.kind === "webseite" || offlineText || !!local;
  const locked = e.kind === "leer" || running || (!via && !direct) || (!!duplicate && !anyway) || !!openEquals;
  const NEEDS: Record<string, string> = { schema: tr("needSchema"), apify: tr("needApify"), ki: tr("needAi") };
  const ICON: Record<string, IconName> = {
    instagram: "bild",
    tiktok: "bild",
    youtube: "play",
    facebook: "bild",
    pinterest: "bild",
    webseite: "link",
    text: "notiz",
  };
  const submit = async () => {
    if (locked) return;
    setRunning(true);
    setMessage(null);
    const r = await p.onImport(input.trim());
    setRunning(false);
    if (r.ok) {
      setMessage({
        ok: true,
        text: r.message ?? tr("jobOnItsWay"),
      });
      setInput("");
      setAnyway(false);
    } else setMessage({ ok: false, text: r.message ?? tr("failed") });
  };
  return (
    <Modal
      title={tr("fetchRecipe")}
      onCloseView={p.onCloseView}
      id="rz-import-titel"
      footer={
        <>
          <button type="button" class="rz-knopf" onClick={p.onCloseView}>
            {tr("close")}
          </button>
          <button type="button" class="rz-knopf rz-knopf-haupt" disabled={locked} onClick={() => void submit()}>
            {running ? <Icon n="lader" large={16} className="rz-dreht" /> : <Icon n="funken" large={16} />}
            {tr("fetch")}
          </button>
        </>
      }
    >
      <label class="rz-feld">
        <span class="rz-feld-name">{tr("linkOrText")}</span>
        <textarea
          rows={input.includes("\n") ? 6 : 2}
          placeholder={tr("importPlaceholder")}
          value={input}
          onInput={(ev) => {
            setInput((ev.target as HTMLTextAreaElement).value);
            setAnyway(false);
            setMessage(null);
          }}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) void submit();
          }}
        />
      </label>

      {e.kind !== "leer" && (
        <div class="rz-erkennung" aria-live="polite">
          <span class="rz-erkennung-icon">
            <Icon n={ICON[e.kind] ?? "link"} />
          </span>
          <div>
            <p class="rz-erkennung-art">{tr("detected", { label: e.label })}</p>
            <p class="rz-leise">
              {offlineText
                ? [tr("procTextOffline"), p.status?.notReady].filter(Boolean).join(" ")
                : facebook
                  ? tr("socialFacebook")
                  : local && e.kind !== "pinterest"
                    ? [tr(local.ai ? "procSocialLocalAi" : "procSocialLocal"), p.status?.notReady]
                        .filter(Boolean)
                        .join(" ")
                    : e.processor}
            </p>
            <p class="rz-erkennung-braucht">
              {(offlineText || local || facebook ? [] : e.needs).map((b) => (
                <span key={b} class="rz-pille">
                  {b === "ki" && <Icon n="funken" large={12} />}
                  {NEEDS[b]}
                </span>
              ))}
              <span class="rz-pille rz-pille-weg">
                {direct
                  ? `${local?.ai ? tr("viaPluginAi") : tr("viaPlugin")}${local?.fallback ? tr("viaFallback", { processor: processorName(local.fallback) }) : ""}`
                  : via === "claude"
                    ? tr("viaClaude")
                    : via === "github"
                      ? tr("viaGithub")
                      : via === "ai"
                        ? tr("viaAi")
                        : (p.status?.short ?? tr("viaNone"))}
              </span>
            </p>
          </div>
        </div>
      )}

      {duplicate && (
        <div class="rz-dublette" role="alert">
          <Image src={duplicate.imageSrc} alt="" className="rz-dublette-bild" />
          <div>
            <p class="rz-erkennung-art">{tr("alreadySaved", { title: duplicate.title })}</p>
            <p class="rz-leise">{tr("sameSource")}</p>
            <div class="rz-zeile">
              <button type="button" class="rz-knopf rz-knopf-klein" onClick={() => p.onOpenNote(duplicate.path)}>
                {tr("open")}
              </button>
              <label class="rz-haken-zeile">
                <input
                  type="checkbox"
                  checked={anyway}
                  onChange={(ev) => setAnyway((ev.target as HTMLInputElement).checked)}
                />
                {tr("fetchAnyway")}
              </label>
            </div>
          </div>
        </div>
      )}
      {openEquals && <p class="rz-hinweis">{tr("alreadyFetching")}</p>}
      {!via && e.kind !== "leer" && !direct && !facebook && (
        <p class="rz-hinweis rz-hinweis-warn">
          <Icon n="warnung" large={16} />
          {p.status?.long ?? tr("noProcessorHint")}
        </p>
      )}
      {message && <p class={`rz-hinweis${message.ok ? " rz-hinweis-ok" : " rz-hinweis-warn"}`}>{message.text}</p>}

      {p.jobs.length > 0 && (
        <div class="rz-auftraege">
          <h3 class="rz-gruppe-titel">{tr("jobs")}</h3>
          <ul>
            {p.jobs.map((a) => (
              <li key={a.id} class={jobFailed(a) ? "fehler" : ""}>
                {jobFailed(a) ? <Icon n="warnung" large={16} /> : <Icon n="lader" large={16} className="rz-dreht" />}
                <span class="rz-auftrag-text">
                  <span>
                    {detectSource(a.input).label} · {a.processor === "claude" ? "Claude" : "GitHub"} ·{" "}
                    {tr("since", {
                      time: new Date(a.since).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }),
                    })}
                  </span>
                  {jobFailed(a) && <span class="rz-leise">{jobError(a)}</span>}
                  <JobButtons
                    a={a}
                    onRetry={() => p.onRetry(a.id)}
                    onRemove={a.failedNote && p.onRemoveFailed ? () => p.onRemoveFailed?.(a.id) : undefined}
                    sync={syncProp(p.jobs, a, p.onSyncNow)}
                  />
                </span>
                {!(a.failedNote && p.onRemoveFailed) && (
                  <button
                    type="button"
                    class="rz-symbol"
                    aria-label={tr("removeJob")}
                    onClick={() => p.onJobGone(a.id)}
                  >
                    <Icon n="x" large={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

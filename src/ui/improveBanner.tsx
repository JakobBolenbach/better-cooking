// Improvement proposals in the UI (ADR 0007): the banner on a recipe page that has a proposal waiting for a look, and the
// cards for proposals whose recipe is gone. Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useState } from "preact/hooks";
import { tr } from "../i18n";
import { failedText } from "../failedText";
import { Icon } from "./icons";
import type { RefetchApi } from "./refetchModal";
import type { Orphan } from "../improve";

/** The review dialog's calls: the same as "Fetch again", fed with the proposal, plus "Discard". */
export type ImproveApi = RefetchApi & { discard: (path: string) => Promise<{ ok: boolean; message?: string }> };

/** What the host gives the App for improvement proposals. */
export interface ImproveHost {
  api: ImproveApi;
  orphans: Orphan[];
  onOrphan: (path: string, what: "save" | "discard") => void | Promise<void>;
}

/** "Verbesserte Fassung bereit [Ansehen]" under the title of a recipe whose proposal needs a look. */
export function ImproveBanner(p: { onView?: () => void }) {
  // Without `onView` another device is to apply it: only a hint.
  return (
    <p class="rz-hinweis rz-hinweis-ok rz-verbesserung" role="status">
      <Icon n="funken" large={16} />
      <span>{tr(p.onView ? "improveBanner" : "improveWaiting")}</span>
      {p.onView && (
        <button type="button" class="rz-knopf rz-knopf-klein" onClick={p.onView}>
          {tr("improveView")}
        </button>
      )}
    </p>
  );
}

const CARD = {
  orphan: { title: "improveOrphanTitle", hint: "improveOrphanHint" },
  invalid: { title: "improveInvalidTitle", hint: "improveInvalidHint" },
  claimed: { title: "improveClaimedTitle", hint: "improveClaimedHint" },
  waiting: { title: "improveSyncingTitle", hint: "improveSyncingHint" },
  unexpected: { title: "improveUnexpectedTitle", hint: "improveUnexpectedHint" },
} as const;

/**
 * A proposal without a recipe: save it as a new recipe or discard it; an invalid one, one whose job ID a note carries
 * and one that waits for another device or that its recipe does not expect any more (#156, with a link to the note of
 * the same source) can only be discarded.
 */
export function OrphanCard(p: {
  o: Orphan;
  onAct: (what: "save" | "discard") => void | Promise<void>;
  onOpen?: (path: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const act = async (what: "save" | "discard") => {
    setBusy(true);
    setError(undefined);
    try {
      await p.onAct(what);
    } catch (e) {
      setError(failedText(e));
    } finally {
      setBusy(false);
    }
  };
  // A proposal that waits for another device, or that its recipe does not expect any more, is no error: a neutral card.
  const calm = p.o.kind === "waiting" || p.o.kind === "unexpected";
  return (
    <div class={`rz-karte rz-karte-auftrag${calm ? " rz-karte-ruhig" : " fehler"}`}>
      <span class="rz-karte-bild rz-auftrag-bild">
        <Icon n={calm ? "uhr" : "warnung"} large={28} />
      </span>
      <span class="rz-karte-text">
        <span class="rz-karte-titel">{tr(CARD[p.o.kind].title)}</span>
        <span class="rz-karte-meta">
          <span>{p.o.title}</span>
        </span>
        <span class="rz-karte-grund">{tr(CARD[p.o.kind].hint, { note: p.o.note?.title ?? p.o.title })}</span>
        {error && (
          <span class="rz-karte-grund" role="alert">
            {error}
          </span>
        )}
        <span class="rz-auftrag-knoepfe">
          {p.o.note && p.onOpen && (
            <button type="button" class="rz-knopf rz-knopf-klein" onClick={() => p.onOpen?.(p.o.note!.path)}>
              {tr("improveSyncingOpen", { title: p.o.note.title })}
            </button>
          )}
          {p.o.kind === "orphan" && (
            <button type="button" class="rz-knopf rz-knopf-klein" disabled={busy} onClick={() => void act("save")}>
              {tr("improveOrphanSave")}
            </button>
          )}
          <button type="button" class="rz-knopf rz-knopf-klein" disabled={busy} onClick={() => void act("discard")}>
            <Icon n="x" large={14} />
            {tr("improveOrphanDiscard")}
          </button>
        </span>
      </span>
    </div>
  );
}

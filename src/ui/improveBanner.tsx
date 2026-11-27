// Improvement proposals in the UI (ADR 0007): the banner on a recipe page that has a proposal waiting for a look, and the
// cards for proposals whose recipe is gone. Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import { useState } from "preact/hooks";
import { tr } from "../i18n";
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
} as const;

/** A proposal without a recipe: save it as a new recipe or discard it; an invalid one can only be discarded. */
export function OrphanCard(p: { o: Orphan; onAct: (what: "save" | "discard") => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const act = async (what: "save" | "discard") => {
    setBusy(true);
    try {
      await p.onAct(what);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="rz-karte rz-karte-auftrag fehler" role="status">
      <span class="rz-karte-bild rz-auftrag-bild">
        <Icon n="warnung" large={28} />
      </span>
      <span class="rz-karte-text">
        <span class="rz-karte-titel">{tr(CARD[p.o.kind].title)}</span>
        <span class="rz-karte-meta">
          <span>{p.o.title}</span>
        </span>
        <span class="rz-karte-grund">{tr(CARD[p.o.kind].hint)}</span>
        <span class="rz-auftrag-knoepfe">
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

// The line on the page of a first version that a processor still improves (ADR 0007, #133): spinner, what is going on,
// "Sync now" (the same button as on an import card) and "View run" if the processor gave a session link.
// Part of the UI from src/ui/App.tsx (Preact), without Obsidian.
import type { RecipeView } from "../types";
import { jobFailed, processorName } from "../processor";
import type { SyncReport } from "../importSync";
import { tr } from "../i18n";
import { Icon } from "./icons";
import { SyncButton } from "./syncButton";

export function ImprovingLine(p: {
  improving: NonNullable<RecipeView["improving"]>;
  onSyncNow?: () => Promise<SyncReport>;
}) {
  const { job } = p.improving;
  // Between writing the note and remembering the job (a moment) there is nothing to say or to press yet.
  if (!job) return null;
  return (
    <div class="rz-hinweis rz-verbessert" role="status">
      <Icon n="lader" large={16} className="rz-dreht" />
      <span class="rz-verbessert-text">
        <span>{tr("improvingLine", { processor: processorName(job.processor) })}</span>
        <span class="rz-auftrag-knoepfe">
          {job.session && (
            <a class="rz-knopf rz-knopf-klein" href={job.session} target="_blank" rel="noopener">
              <Icon n="extern" large={14} />
              {tr("viewRun")}
            </a>
          )}
          {p.onSyncNow && !jobFailed(job) && <SyncButton a={job} run={p.onSyncNow} />}
        </span>
      </span>
    </div>
  );
}

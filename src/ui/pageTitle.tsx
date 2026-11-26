// Title row of a page besides the overview: back (narrow layout), the title and the small button for the note behind it.
import { Icon } from "./icons";
import { tr } from "../i18n";

export function PageTitle(p: { title: string; noteLabel: string; onBack: () => void; onOpenNote: () => void }) {
  return (
    <header class="rz-ue-kopf">
      <div class="rz-ue-titelzeile">
        <button type="button" class="rz-symbol rz-nur-schmal" aria-label={tr("back")} onClick={p.onBack}>
          <Icon n="links" large={22} />
        </button>
        <h1 id="rz-titel" class="rz-ue-titel rz-ek-titel" tabIndex={-1}>
          {p.title}
        </h1>
        <button
          type="button"
          class="rz-knopf rz-knopf-klein rz-ek-notiz"
          aria-label={p.noteLabel}
          onClick={p.onOpenNote}
        >
          <Icon n="notiz" large={15} />
          <span class="rz-ek-notiz-text">{p.noteLabel}</span>
        </button>
      </div>
    </header>
  );
}

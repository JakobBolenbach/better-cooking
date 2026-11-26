// Meal plan page: a placeholder until the week view (issue #65) replaces it.
import { Icon } from "./icons";
import { tr } from "../i18n";

export function PlanPage(p: { onOpenNote: () => void; onBack: () => void }) {
  return (
    <div class="rz-uebersicht rz-einkauf">
      <header class="rz-ue-kopf">
        <div class="rz-ue-titelzeile">
          <button type="button" class="rz-symbol rz-nur-schmal" aria-label={tr("back")} onClick={p.onBack}>
            <Icon n="links" large={22} />
          </button>
          <h1 id="rz-titel" class="rz-ue-titel rz-ek-titel">
            {tr("pagePlan")}
          </h1>
        </div>
      </header>
      <div class="rz-leer">
        <span class="rz-leer-icon">
          <Icon n="kalender" large={30} />
        </span>
        <p>{tr("planPageSoon")}</p>
        <button type="button" class="rz-knopf rz-knopf-klein" onClick={p.onOpenNote}>
          <Icon n="notiz" large={15} />
          {tr("openMealPlan")}
        </button>
      </div>
    </div>
  );
}

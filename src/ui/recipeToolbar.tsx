// Top bar of the recipe page (back, translate, share, note, cook) and the language switch (issue #10).
import { Icon } from "./icons";
import { tr } from "../i18n";
import type { RecipeView } from "../types";

export function RecipeToolbar(p: {
  r: RecipeView;
  scrolled: boolean;
  onBack: () => void;
  onTranslate?: () => void;
  onShare: () => void;
  onOpenNote: () => void;
  onCook: () => void;
}) {
  const { r, scrolled } = p;
  return (
    <div class={`rz-detail-leiste${scrolled ? " gescrollt" : ""}`}>
      <button type="button" class="rz-zurueck" onClick={p.onBack}>
        <Icon n="links" large={20} />
        <span>{tr("appName")}</span>
      </button>
      <span class="rz-leiste-titel" aria-hidden="true">
        {r.title}
      </span>
      <div class="rz-leiste-aktionen">
        {p.onTranslate && (
          <button type="button" class="rz-symbol" aria-label={tr("translate")} onClick={p.onTranslate}>
            <Icon n="sprache" />
          </button>
        )}
        <button type="button" class="rz-symbol" aria-label={tr("share")} onClick={p.onShare}>
          <Icon n="teilen" />
        </button>
        <button type="button" class="rz-symbol" aria-label={tr("openInObsidian")} onClick={p.onOpenNote}>
          <Icon n="notiz" />
        </button>
        {r.steps.length > 0 && (
          <button type="button" class="rz-knopf rz-knopf-haupt rz-knopf-klein" onClick={p.onCook}>
            <Icon n="flamme" large={16} />
            {tr("cook")}
          </button>
        )}
      </div>
    </div>
  );
}

export function LanguageSwitch(p: {
  r: RecipeView;
  languages: { path: string; label: string }[];
  onOpen: (path: string) => void;
}) {
  const { r } = p;
  if (p.languages.length < 2) return null;
  return (
    <div class="rz-sprachen" role="group" aria-label={tr("translateLanguage")}>
      {p.languages.map((l) => (
        <button
          key={l.path}
          type="button"
          class={`rz-sprache${l.path === r.path ? " aktiv" : ""}`}
          aria-pressed={l.path === r.path}
          onClick={() => p.onOpen(l.path)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

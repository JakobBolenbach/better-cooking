// Header of the recipe page: image, category, language switch, title, description, key facts, source and hints.
import { scaledResult } from "../quantities";
import type { RecipeView } from "../types";
import { Image, Inline, timeShort, importStateLabel } from "./shared";
import { Icon } from "./icons";
import { LanguageSwitch } from "./recipeToolbar";
import { hostOf } from "../source";
import { tr } from "../i18n";
import { findingsText } from "../importCheck";
import { ImproveBanner } from "./improveBanner";

export function RecipeHero(p: {
  r: RecipeView;
  faktor: number;
  languages?: { path: string; label: string }[];
  onOpen: (path: string) => void;
  /** A proposal for an improved version waits for a look (ADR 0007). */
  improve?: { onClick?: () => void };
}) {
  const { r } = p;
  const host = r.source ? hostOf(r.source) : undefined;
  return (
    <header class="rz-held">
      <div class="rz-held-bild">
        <Image src={r.imageSrc} alt={r.title} />
      </div>
      <div class="rz-held-text">
        {r.category && <span class="rz-oberzeile">{r.category}</span>}
        {p.languages && <LanguageSwitch r={r} languages={p.languages} onOpen={p.onOpen} />}
        <h1 id="rz-rezept-titel" class="rz-rezept-titel">
          {r.title}
        </h1>
        {r.description && (
          <p class="rz-beschreibung">
            <Inline text={r.description} />
          </p>
        )}
        <ul class="rz-fakten">
          {r.timeTotal && (
            <li>
              <Icon n="uhr" />
              <span>
                <b>{timeShort(r.timeTotal)}</b> {tr("total")}
              </span>
            </li>
          )}
          {r.timeActive && (
            <li>
              <Icon n="besteck" />
              <span>
                <b>{timeShort(r.timeActive)}</b> {tr("active")}
              </span>
            </li>
          )}
          {r.result && (
            <li>
              <Icon n="personen" />
              <span>
                <b>{scaledResult(r.result, r.servings, p.faktor)}</b>
              </span>
            </li>
          )}
        </ul>
        {(r.author || r.source) && (
          <p class="rz-quelle">
            {r.author && <span>{r.author}</span>}
            {r.source && (
              <a href={r.source} target="_blank" rel="noopener">
                <Icon n="extern" large={14} />
                {host ?? tr("source")}
              </a>
            )}
          </p>
        )}
        {r.importState && r.importState !== "fertig" && (
          <p class="rz-hinweis rz-hinweis-warn">
            <Icon n="warnung" large={16} />
            {tr("importState", { state: importStateLabel(r.importState) })}
            {r.importError ? `: ${r.importError}` : ""}
          </p>
        )}
        {p.improve && <ImproveBanner onView={p.improve.onClick} />}
        {r.findings && (
          <p class="rz-hinweis rz-hinweis-warn">
            <Icon n="warnung" large={16} />
            {tr("findingsHint", { what: findingsText(r.findings) })}
          </p>
        )}
      </div>
    </header>
  );
}

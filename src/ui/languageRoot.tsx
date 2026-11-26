// Mounts its children again when the interface language changes (issue #77), so state that was computed with texts of the
// old language (sidebar counts, memoized lists, amounts) is built again in the new one.
import type { ComponentChildren } from "preact";
import { Fragment } from "preact";
import { language } from "../i18n";

export function LanguageRoot(p: { children: ComponentChildren }) {
  return <Fragment key={language()}>{p.children}</Fragment>;
}

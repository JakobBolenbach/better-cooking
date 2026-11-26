// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { h, render } from "preact";
import { useMemo, useState } from "preact/hooks";
import { LanguageRoot } from "../src/ui/languageRoot";
import { language, setLanguage, tr } from "../src/i18n";

afterEach(() => setLanguage("en"));

/** Like the sidebar: a text computed once (memo) and some state. */
function Probe() {
  const label = useMemo(() => tr("pageShopping"), []);
  const [n, setN] = useState(0);
  return h("button", { onClick: () => setN(n + 1) }, `${label} ${n}`);
}

describe("language change at run time (#77)", () => {
  it("builds the app again in the new language", () => {
    const root = document.createElement("div");
    setLanguage("en");
    render(h(LanguageRoot, null, h(Probe, null)), root);
    expect(root.textContent).toBe("Shopping list 0");
    (root.firstChild as HTMLButtonElement).click();
    setLanguage("de");
    expect(language()).toBe("de");
    render(h(LanguageRoot, null, h(Probe, null)), root);
    expect(root.textContent).toBe("Einkaufsliste 0");
  });
});

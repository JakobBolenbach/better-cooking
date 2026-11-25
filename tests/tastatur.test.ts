// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { istEingabefeld, tasteFuerAnsicht } from "../src/ui/tastatur";

function aufbau(sichtbar: boolean) {
  document.body.replaceChildren();
  const notiz = document.body.appendChild(document.createElement("div"));
  const editor = notiz.appendChild(document.createElement("div"));
  editor.setAttribute("contenteditable", "true");
  const wurzel = document.body.appendChild(document.createElement("div"));
  const suche = wurzel.appendChild(document.createElement("input"));
  wurzel.getClientRects = () => (sichtbar ? [{}] : []) as unknown as DOMRectList;
  return { wurzel, editor, suche };
}

describe("Tastatur", () => {
  it("ignoriert Tasten im Editor einer normalen Notiz", () => {
    const { wurzel, editor } = aufbau(true);
    expect(tasteFuerAnsicht(editor, wurzel)).toBe(false);
  });

  it("nimmt Tasten aus der eigenen Ansicht", () => {
    const { wurzel, suche } = aufbau(true);
    expect(tasteFuerAnsicht(suche, wurzel)).toBe(true);
  });

  it("nimmt Tasten ohne Fokus nur, wenn die Ansicht sichtbar ist", () => {
    expect(tasteFuerAnsicht(document.body, aufbau(true).wurzel)).toBe(true);
    expect(tasteFuerAnsicht(document.body, aufbau(false).wurzel)).toBe(false);
  });

  it("erkennt contenteditable als Eingabefeld", () => {
    const { editor, suche } = aufbau(true);
    expect(istEingabefeld(editor)).toBe(true);
    expect(istEingabefeld(suche)).toBe(true);
    expect(istEingabefeld(document.body)).toBe(false);
  });
});

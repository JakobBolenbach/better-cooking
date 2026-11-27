// German interface strings of feedback on a recipe (issue #120); added to src/strings/de.ts by src/i18n.ts.

export const feedbackDe = {
  feedbackMenu: "Etwas falsch? Mit Hinweis neu holen",
  feedbackTitle: "Mit Hinweis neu holen",
  feedbackLabel: "Was ist falsch?",
  feedbackPlaceholder: "z. B. „Der Ofen muss auf 200 °C, nicht auf 180 °C.“",
  feedbackCounter: "{n} von {max} Zeichen",
  feedbackAi: "Mit meiner KI neu lesen",
  feedbackAiReading: "Wird gelesen …",
  feedbackIntroPage:
    "Dein Hinweis geht zusammen mit dem Text von {host} und dem Rezept, wie es jetzt ist, an deine eigene KI. Sie darf Angaben aus deinem Hinweis übernehmen, etwa eine Temperatur. Danach siehst du, was sich ändern würde. Geschrieben wird erst nach „Aktualisieren“, und die alte Fassung wird gesichert.",
  feedbackIntroCaption:
    "Dein Hinweis geht zusammen mit der Beschreibung des Beitrags (sie wird noch einmal gelesen) und dem Rezept, wie es jetzt ist, an deine eigene KI. Sie darf Angaben aus deinem Hinweis übernehmen. Geschrieben wird erst nach „Aktualisieren“, und die alte Fassung wird gesichert.",
  feedbackIntroNote:
    "Deine KI überarbeitet den Text der Notiz. Dein Hinweis geht zusammen mit dem Rezept, wie es jetzt ist, an sie, und sie darf Angaben daraus übernehmen. Geschrieben wird erst nach „Aktualisieren“, und die alte Fassung wird gesichert.",
  feedbackViaPage: "Neu gelesen aus dem Text der Seite, mit deinem Hinweis.",
  feedbackViaCaption: "Neu gelesen aus der Beschreibung des Beitrags, mit deinem Hinweis.",
  feedbackViaNote: "Die Quelle ließ sich nicht lesen oder es gibt keine: deine KI hat den Text der Notiz überarbeitet.",
  feedbackSend: "An {name} senden",
  feedbackSending: "Wird gesendet …",
  feedbackProcessorIntro:
    "Dein Hinweis geht zusammen mit dem Rezept an {name}. Die Verbesserung kommt später als Vorschlag und wird wie andere Verbesserungen eingearbeitet oder zur Prüfung angezeigt. Was du von Hand geändert hast, bleibt.",
  feedbackSent: "Hinweis an {name} gesendet. Die Verbesserung kommt später.",
  feedbackNone: "Feedback braucht deine eigene KI oder einen Verarbeiter.",
  feedbackNoneHint:
    "Richte in den Einstellungen deine eigene KI, Claude oder die GitHub-Aktion ein. Bis dahin kannst du das Rezept von Hand bearbeiten.",
  feedbackEditByHand: "Von Hand bearbeiten",
  feedbackEmpty: "Schreibe zuerst, was falsch ist.",
  feedbackOff: "Bei Übersetzungen und alten Fassungen gibt es keinen Hinweis. Hole das Original neu.",
  feedbackRunning: "Für dieses Rezept läuft schon eine Verbesserung.",
  feedbackChanged: "Die Notiz wurde währenddessen geändert. Bitte noch einmal versuchen.",
} as const;

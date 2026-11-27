// German strings of the improvement proposals (ADR 0007, src/improve.ts), merged into the dictionary of src/strings/de.ts.

export const improveDe = {
  importStateOpen: "noch offen",
  improveBanner: "Verbesserte Fassung bereit",
  improveView: "Ansehen",
  improveTitle: "Verbesserte Fassung",
  improveIntro:
    "Der Import hat eine verbesserte Fassung geliefert. Hier siehst du, was sich ändern würde. Status, Bewertung, Versuche, eigene Notizen und Abschnitte bleiben. Vor dem Schreiben wird die aktuelle Fassung im Unterordner Vorversionen gesichert.",
  improveReview:
    "Du hast Teile dieses Rezepts selbst bearbeitet, deshalb wurde die Verbesserung nicht automatisch übernommen.",
  improveVia: "Verbesserte Fassung vom Import.",
  improveApply: "Übernehmen",
  improveApplying: "Wird übernommen …",
  improved: "Verbessert: {title}",
  improvedUndone: "Verbesserung zurückgenommen.",
  improvedUndoStale: "Die Notiz wurde inzwischen geändert, deshalb wurde nichts zurückgenommen.",
  improveFailedNotice: "Verbesserung gescheitert: {why}. Die erste Fassung bleibt.",
  improveFailedNoReason: "kein Grund genannt",
  improveGone: "Die verbesserte Fassung oder das Rezept gibt es nicht mehr.",
  improveChangedMeanwhile: "Die Notiz wurde währenddessen geändert. Die Änderungen werden neu berechnet.",
  improveApplyFailed: "Übernehmen gescheitert: {error}",
  improveOrphansHeading: "Verbesserungen ohne Rezept",
  improveOrphanTitle: "Rezept nicht gefunden",
  improveOrphanHint: "Zu dieser verbesserten Fassung gibt es kein Rezept mehr in der Sammlung.",
  improveOrphanSave: "Als neues Rezept speichern",
  improveOrphanDiscard: "Verwerfen",
  improveOrphanSaved: "Gespeichert: {title}",
  improveOrphanDiscarded: "Verbesserung verworfen.",
  noImprovementArrived:
    "Es ist keine Verbesserung angekommen. Läuft dein Prozessor nach dem Vertrag 0.9? Die erste Fassung bleibt.",
  github422Improve:
    "Der Workflow kennt die Eingabe „verbessern“ nicht. Aktualisiere deinen Workflow auf den Vertrag 0.9.",
} as const;

// German strings of the improvement proposals (ADR 0007, src/improve.ts), merged into the dictionary of src/strings/de.ts.

export const improveDe = {
  refetchPartState: "Import-Status",
  refetchPartTimeline: "Ablauf-Grafik (fehlt in der Notiz)",
  improveWaiting: "Eine verbesserte Fassung ist da. Sie wird auf dem Gerät übernommen, das den Import gestartet hat.",
  improveDiscard: "Verwerfen",
  improveNewText: "Neuer Text",
  improveStale: "Die Verbesserung läuft nicht mehr. Es bleibt bei der ersten Fassung.",
  improveClaimedTitle: "Verbesserung nicht eingearbeitet",
  improveClaimedHint:
    "Ein Rezept trägt die Auftrags-ID dieser Verbesserung, wartet aber nicht auf sie. Sie wird nicht eingearbeitet und nicht als neues Rezept gespeichert. Du kannst sie verwerfen.",
  improveInvalidTitle: "Ungültiger Vorschlag",
  improveInvalidHint:
    "Dateiname und Job-ID stimmen nicht überein oder die ID ist ungültig. Die Datei wurde nicht angewendet.",
  importStateOpen: "noch offen",
  firstVersionSaved: "Erste Fassung von „{title}“ gespeichert. {processor} verbessert sie in ein paar Minuten.",
  firstVersionNoJob:
    "Erste Fassung von „{title}“ gespeichert. {processor} konnte nicht beauftragt werden: {why} Es bleibt bei dieser Fassung.",
  procRunAlways:
    "Liest das Plugin ein Rezept aus dem Beitrag, verbessert {processor} es danach (ein Lauf, der Kontingent oder Kosten verbrauchen kann). Steht das Rezept auf einer verlinkten Rezeptseite, wird diese ohne Lauf gespeichert. Lässt sich der Beitrag nicht lesen, geht er an {processor}.",
  procRunPartial:
    "Ist das Ergebnis unvollständig (nur Zutaten oder nur Schritte), verbessert {processor} es danach (ein Lauf, der Kontingent oder Kosten verbrauchen kann). Ein vollständiges wird ohne Lauf gespeichert. Lässt sich der Beitrag nicht lesen oder steht kein Rezept darin, geht er an {processor}.",
  translateFirstVersion:
    "Dieses Rezept wird gerade verbessert. Die Übersetzung zeigt die erste Fassung und ändert sich mit der Verbesserung nicht.",
  improveUnsure:
    "Es ist unklar, ob {processor} den Auftrag bekommen hat: {why} Das Rezept steht auf „offen“. Kommt nichts, kannst du es nach der Wartezeit erneut versuchen.",
  improveCrashed: "Obsidian wurde dabei beendet.",
  improveRetryAsk: "Verbesserung durch {processor} nicht gestartet.",
  improveRetryFailed: "Neuer Versuch gescheitert.",
  improveRetryChanged: "Die Notiz wurde inzwischen geändert, deshalb wurde nichts neu gestartet.",
  viaThen: ", danach {processor}",
  improveNotStarted: "Die Verbesserung wurde nicht gestartet: {why}",
  improvingBadge: "Wird verbessert",
  improvingLine: "{processor} verbessert dieses Rezept gerade. Du kannst es schon nutzen und bearbeiten.",
  improveBanner: "Verbesserte Fassung bereit",
  improveView: "Ansehen",
  improveTitle: "Verbesserte Fassung",
  improveIntro:
    "Der Import hat eine verbesserte Fassung geliefert. Hier siehst du, was sich ändern würde. Status, Bewertung, Versuche, eigene Notizen und Abschnitte bleiben. Vor dem Schreiben wird die aktuelle Fassung im Unterordner Vorversionen gesichert.",
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
  improveOrphansHeading: "Verbesserungen ohne zugeordnetes Rezept",
  improveOrphanTitle: "Rezept nicht gefunden",
  improveOrphanHint: "Zu dieser verbesserten Fassung gibt es kein Rezept mehr in der Sammlung.",
  improveOrphanSave: "Als neues Rezept speichern",
  improveOrphanDiscard: "Verwerfen",
  improveOrphanSaved: "Gespeichert: {title}",
  improveOrphanDiscarded: "Verbesserung verworfen.",
  improveSyncingTitle: "Wartet auf ein anderes Gerät",
  improveSyncingHint:
    "Die Notiz zu dieser verbesserten Fassung ist hier noch nicht angekommen, vermutlich wegen der Synchronisierung eines anderen Geräts. Verwerfen entfernt den Vorschlag auf allen Geräten, auch auf dem, das ihn erwartet.",
  improveUnexpectedTitle: "Nicht mehr erwartet",
  improveUnexpectedHint:
    "Gehört zu „{note}“, das ihn nicht mehr erwartet. Verwerfen entfernt den Vorschlag auf allen Geräten.",
  improveNoSave: "Dieser Vorschlag wird nicht als neues Rezept gespeichert.",
  improveSyncingOpen: "Rezept „{title}“ öffnen",
  noImprovementArrived:
    "Es ist keine Verbesserung angekommen. Läuft dein Prozessor nach dem Vertrag 0.9? Die erste Fassung bleibt.",
  github422Improve:
    "Der Workflow kennt die Eingabe „verbessern“ oder „hinweis“ nicht. Aktualisiere deinen Workflow auf den Vertrag 0.9.",
} as const;

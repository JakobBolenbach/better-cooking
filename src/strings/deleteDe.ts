// German interface strings of "Delete recipe" (issue #119) and the recipe menu; added to src/strings/de.ts by src/i18n.ts.

export const deleteDe = {
  moreActions: "Weitere Aktionen",
  deleteRecipe: "Rezept löschen",
  deleteTitle: "Rezept löschen?",
  deleteIntro: "Das wird gelöscht:",
  deleteNoteItem: "Die Notiz „{title}“",
  deleteImagesItem: "Bilder, die keine andere Notiz verwendet:",
  deleteBackupsOne: "1 ältere Version in „Vorversionen“",
  deleteBackupsMany: "{n} ältere Versionen in „Vorversionen“",
  deleteTranslations: "Auch die Übersetzungen löschen:",
  deletePlanItem: "Aus dem Wochenplan, heute und später:",
  deleteShopping:
    "Offene Einträge auf der Einkaufsliste bleiben. Die Mengen pro Rezept werden dort nicht mehr angezeigt.",
  deleteDiscardedHint:
    "Möchtest du gewarnt werden, wenn du diesen Link später noch einmal importierst? Setze das Rezept dann stattdessen auf „Verworfen“.",
  deleteDiscardInstead: "Auf „Verworfen“ setzen",
  deleteTrashHint: "Je nach Obsidian-Einstellung landen die Dateien im Papierkorb.",
  deleteReading: "Wird gelesen …",
  deleteMove: "In den Papierkorb",
  deleteRunning: "Wird gelöscht …",
  deleteGone: "Die Notiz gibt es nicht mehr.",
  deleteNotRecipe: "Das ist keine Rezeptnotiz im Rezeptordner.",
  deleteDone: "In den Papierkorb verschoben: {title}",
  deleteDoneMore: "In den Papierkorb verschoben: {title} (+ {n} Dateien)",
  deleteFailedNote: "„{title}“ konnte nicht gelöscht werden, nichts wurde verändert: {error}",
  deleteLeft: "„{title}“ ist gelöscht. Nicht erledigt: {left}",
  deleteLeftPlan: "Einträge im Wochenplan",
} as const;

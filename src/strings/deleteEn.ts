// English interface strings of "Delete recipe" (issue #119): every key of the German ones, checked by the type.
import type { deleteDe } from "./deleteDe";

export const deleteEn: Record<keyof typeof deleteDe, string> = {
  moreActions: "More actions",
  deleteRecipe: "Delete recipe",
  deleteTitle: "Delete recipe?",
  deleteIntro: "This will be deleted:",
  deleteNoteItem: "The note “{title}”",
  deleteImagesItem: "Images that no other note uses:",
  deleteBackupsOne: "1 older version in “Vorversionen”",
  deleteBackupsMany: "{n} older versions in “Vorversionen”",
  deleteTranslations: "Delete the translations too:",
  deletePlanItem: "From the meal plan, today and later:",
  deleteShopping: "Open items on the shopping list stay. The amounts per recipe are no longer shown there.",
  deleteDiscardedHint: "Want a warning when you import this link again later? Set the recipe to “Discarded” instead.",
  deleteDiscardInstead: "Set to “Discarded”",
  deleteTrashHint: "Depending on your Obsidian settings, the files go to the trash.",
  deleteReading: "Reading …",
  deleteMove: "Move to trash",
  deleteRunning: "Deleting …",
  deleteGone: "The note no longer exists.",
  deleteNotRecipe: "This is not a recipe note in the recipe folder.",
  deleteDone: "Moved to trash: {title}",
  deleteDoneMore: "Moved to trash: {title} (+ {n} files)",
  deleteFailedNote: "“{title}” could not be deleted, nothing was changed: {error}",
  deleteLeft: "“{title}” is deleted. Not done: {left}",
  deleteLeftPlan: "entries in the meal plan",
};

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
  deletePlanItem: "From the meal plan, today and later (with the notes below them):",
  deleteShopping: "Open items on the shopping list stay. The amounts per recipe are no longer shown there.",
  deleteImagesKept: "The images stay, because Obsidian does not know the links of your vault for sure yet.",
  deleteCacheLate: "Obsidian is still reading the notes; translations and older versions may not all be found.",
  deleteDiscardedHintNoSource:
    "You can set the recipe to “Discarded” instead. It stays and is only listed under “Discarded”.",
  deleteDiscardedHint: "Want a warning when you import this link again later? Set the recipe to “Discarded” instead.",
  deleteDiscardInstead: "Set to “Discarded”",
  deleteTrashHint:
    "Whether the files go to the trash or are deleted for good is set by the Obsidian setting “Deleted files”. Removed meal plan entries cannot be restored.",
  deleteReading: "Reading …",
  deleteMove: "Delete",
  deleteRunning: "Deleting …",
  deleteGone: "The note no longer exists.",
  deleteNotRecipe: "This is not a recipe note in the recipe folder.",
  deleteDone: "Deleted: {title}",
  deleteDoneOne: "Deleted: {title} (+ 1 file)",
  deleteDoneMore: "Deleted: {title} (+ {n} files)",
  deleteFailedNote: "“{title}” could not be deleted, nothing was changed: {error}",
  deleteLeft: "“{title}” is deleted. Not done: {left}",
  deleteLeftPlan: "entries in the meal plan",
};

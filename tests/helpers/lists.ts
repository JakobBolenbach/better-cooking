// Shared by the tests of the shopping list: a list note as the plugin writes it.
import { addToList as add } from "../../src/shopping";
export { itemsOfAdds } from "../../src/listRecipes";
import type { Item } from "../../src/shopping";

export const addToList = (text: string, items: Item[]) => add(text, items, "Einkaufsliste", [], "de");

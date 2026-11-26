// What is open on the shopping list page: the question about a recipe and the details of an item. It lives in the App
// because both are layers for Esc (src/ui/keyboard.ts).
import { useState } from "preact/hooks";

export function useShoppingUi() {
  const [ask, setAsk] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  return {
    ask,
    setAsk,
    openRow,
    setOpenRow,
  };
}
export type ShoppingUi = ReturnType<typeof useShoppingUi>;

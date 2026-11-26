import { describe, expect, it } from "vitest";
import { itemFromLine } from "../src/shopping";
import { recipeShares } from "../src/shoppingShares";

const brot = { recipe: "A", groups: [{ ingredients: ["200 g Mehl", "1 EL Mehl zum Bestäuben", "Salz"] }], factor: 1 };
const kuchen = { recipe: "B", groups: [{ ingredients: ["0,3 kg Mehl, gesiebt", "2 Eier"] }], factor: 2 };

describe("amounts per recipe (#66)", () => {
  const line = { ...itemFromLine("1,1 kg Mehl", undefined), recipes: ["A", "B"] };

  it("calculates what each recipe needs of the line, in the line's units only", () => {
    expect(recipeShares(line, [brot, kuchen])).toEqual([
      { recipe: "A", amount: 200, unit: "g" },
      { recipe: "B", amount: 0.6, unit: "kg" },
    ]);
  });

  it("separates the spoon line of the same ingredient", () => {
    const spoon = { ...itemFromLine("1 EL Mehl", undefined), recipes: ["A"] };
    expect(recipeShares(spoon, [brot])).toEqual([{ recipe: "A", amount: 1, unit: "EL" }]);
  });

  it("applies the servings factor and the skipped ingredients", () => {
    expect(recipeShares(line, [{ ...brot, factor: 3, skip: ["0-0"] }, kuchen])[0]).toEqual({ recipe: "A" });
    expect(recipeShares(line, [{ ...brot, factor: 3 }, kuchen])[0]).toEqual({ recipe: "A", amount: 600, unit: "g" });
  });

  it("lists recipes without source or without the ingredient without an amount", () => {
    expect(recipeShares(line, [brot])).toEqual([{ recipe: "A", amount: 200, unit: "g" }, { recipe: "B" }]);
    const salt = { ...itemFromLine("Salz", undefined), recipes: ["B"] };
    expect(recipeShares(salt, [kuchen])).toEqual([{ recipe: "B" }]);
  });

  it("does not need the line's text to be the same as the recipe's", () => {
    const eggs = { ...itemFromLine("4 Eier", undefined), recipes: ["B"] };
    expect(recipeShares(eggs, [kuchen])).toEqual([{ recipe: "B", amount: 4, unit: undefined }]);
  });
});

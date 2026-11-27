// Units of ingredient quantities: the list the parser knows, their plural forms and the metric base units.
// One place for all unit tables; src/quantities.ts and src/shopping.ts derive from them. Pure, no Obsidian.

/** Units after which a number counts as a quantity. Order: long forms first. */
export const UNITS = [
  "Kilogramm",
  "Gramm",
  "Milligramm",
  "Milliliter",
  "Zentiliter",
  "Deziliter",
  "Liter",
  "Teelöffel",
  "Esslöffel",
  "Prisen",
  "Prise",
  "Messerspitzen",
  "Messerspitze",
  "Päckchen",
  "Packungen",
  "Packung",
  "Stücke",
  "Stück",
  "Bund",
  "Zehen",
  "Zehe",
  "Dosen",
  "Dose",
  "Becher",
  "Tassen",
  "Tasse",
  "Scheiben",
  "Scheibe",
  "Blätter",
  "Blatt",
  "Zweige",
  "Zweig",
  "Handvoll",
  "Gläser",
  "Glas",
  "Würfel",
  "Tropfen",
  // English (long forms first, then abbreviations)
  "tablespoons",
  "tablespoon",
  "teaspoons",
  "teaspoon",
  "cups",
  "cup",
  "ounces",
  "ounce",
  "pounds",
  "pound",
  "pints",
  "pint",
  "quarts",
  "quart",
  "kilograms",
  "kilogram",
  "milligrams",
  "milligram",
  "grams",
  "gram",
  "milliliters",
  "milliliter",
  "millilitres",
  "millilitre",
  "liters",
  "liter",
  "litres",
  "litre",
  "pinches",
  "pinch",
  "cloves",
  "clove",
  "cans",
  "can",
  "slices",
  "slice",
  "sticks",
  "stick",
  "bunches",
  "bunch",
  "sprigs",
  "sprig",
  "packages",
  "package",
  "pieces",
  "piece",
  "handfuls",
  "handful",
  "tbsp",
  "Tbsp",
  "tsp",
  "lbs",
  "lb",
  "oz",
  "kg",
  "mg",
  "ml",
  "cl",
  "dl",
  "g",
  "l",
  "L",
  "TL",
  "EL",
  "Tl",
  "El",
  "Msp",
  "Pck",
  "Pkg",
  "Stk",
  "cm",
];
/**
 * Units that change with the amount, singular → plural (every form is also in UNITS). Units that stay the same
 * ("Bund", "Becher", "Päckchen", "Handvoll", "g", "EL", FIXED_PAIRS) are not listed.
 */
export const UNIT_FORMS: Record<string, string> = {
  Prise: "Prisen",
  Messerspitze: "Messerspitzen",
  Packung: "Packungen",
  Zehe: "Zehen",
  Dose: "Dosen",
  Tasse: "Tassen",
  Scheibe: "Scheiben",
  Zweig: "Zweige",
  tablespoon: "tablespoons",
  teaspoon: "teaspoons",
  cup: "cups",
  ounce: "ounces",
  pound: "pounds",
  pint: "pints",
  quart: "quarts",
  kilogram: "kilograms",
  milligram: "milligrams",
  gram: "grams",
  milliliter: "milliliters",
  millilitre: "millilitres",
  liter: "liters",
  litre: "litres",
  pinch: "pinches",
  clove: "cloves",
  can: "cans",
  slice: "slices",
  stick: "sticks",
  bunch: "bunches",
  sprig: "sprigs",
  package: "packages",
  piece: "pieces",
  handful: "handfuls",
};

/** Written in two forms, but after a number always the singular, like "Stück": "6 Blatt Gelatine", "2 Glas". */
export const FIXED_PAIRS: [string, string][] = [
  ["Stück", "Stücke"],
  ["Blatt", "Blätter"],
  ["Glas", "Gläser"],
];
const UNIT_SINGULAR: Record<string, string> = Object.fromEntries(
  [...Object.entries(UNIT_FORMS), ...FIXED_PAIRS].map(([one, many]) => [many, one]),
);

/** Singular of a unit written in either form ("Prisen" → "Prise"); other units stay as they are. */
export const singularUnit = (unit: string): string => UNIT_SINGULAR[unit] ?? unit;

/** The unit in the form for the amount: more than 1 → plural ("2 Prisen"), 1 and less → singular ("1 Prise"). */
export function unitFor(unit: string, amount: number): string {
  const one = singularUnit(unit);
  const many = UNIT_FORMS[one];
  if (!many) return one;
  return amount > 1 + 1e-9 ? many : one;
}

/** Weight and volume units (lower case) with their base unit (g, ml) and the factor to it; used for rounding and the shopping list. */
export const METRIC_BASE: Record<string, [string, number]> = {
  mg: ["g", 0.001],
  milligramm: ["g", 0.001],
  milligram: ["g", 0.001],
  milligrams: ["g", 0.001],
  g: ["g", 1],
  gramm: ["g", 1],
  gram: ["g", 1],
  grams: ["g", 1],
  kg: ["g", 1000],
  kilogramm: ["g", 1000],
  kilogram: ["g", 1000],
  kilograms: ["g", 1000],
  ml: ["ml", 1],
  milliliter: ["ml", 1],
  milliliters: ["ml", 1],
  millilitre: ["ml", 1],
  millilitres: ["ml", 1],
  cl: ["ml", 10],
  zentiliter: ["ml", 10],
  dl: ["ml", 100],
  deziliter: ["ml", 100],
  l: ["ml", 1000],
  liter: ["ml", 1000],
  liters: ["ml", 1000],
  litre: ["ml", 1000],
  litres: ["ml", 1000],
};

/**
 * Units of things that are counted: scaled amounts are whole or half ("3 ½ Stück", not "3 ⅓ Stück"), like amounts
 * without a unit. Measures (spoons, cups, weights) are not listed; they keep thirds and quarters.
 */
const COUNTABLE = new Set(
  [
    ...["Stück", "Stücke", "Stk", "Zehe", "Zehen", "Dose", "Dosen", "Scheibe", "Scheiben", "Blatt", "Blätter"],
    ...["Würfel", "Zweig", "Zweige", "Päckchen", "Packung", "Packungen", "Pck", "Pkg", "Bund", "Glas", "Gläser"],
    ...["piece", "pieces", "clove", "cloves", "can", "cans", "slice", "slices", "stick", "sticks", "sprig", "sprigs"],
    ...["package", "packages", "bunch", "bunches"],
  ].map((u) => u.toLowerCase()),
);

export const isCountable = (unit: string | undefined): boolean => !unit || COUNTABLE.has(unit.toLowerCase());

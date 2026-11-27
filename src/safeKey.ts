// Keys of data read from data.json that must never be written into a plain object: assigning them changes the prototype.
const UNSAFE = new Set(["__proto__", "constructor", "prototype"]);

/** False for `__proto__`, `constructor` and `prototype`. */
export const safeKey = (key: string): boolean => !UNSAFE.has(key);

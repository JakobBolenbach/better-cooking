// Helpers for objects whose keys come from untrusted content (itemprop names, JSON-LD keys, entity names).
// TODO(#68): merge with src/safeKey.ts once that branch is on main; keep one helper.

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** False for keys that must never be used to assign on a plain object. */
export const isSafeKey = (key: string): boolean => !UNSAFE_KEYS.has(key);

/** True only for an own property, never for an inherited one (`toString`, `constructor` …). */
export const hasOwn = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

/** The own value of `key`, or undefined. */
export const ownValue = <T>(obj: Record<string, T>, key: string): T | undefined =>
  hasOwn(obj, key) ? obj[key] : undefined;

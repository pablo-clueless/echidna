type Messages = { [key: string]: string | Messages };

const isObject = (value: unknown): value is Messages =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Deep-merges locale messages over a fallback set so any missing key resolves to the fallback string.
 * @param fallback - Complete message tree, normally English.
 * @param overrides - Possibly incomplete message tree for the active locale.
 * @returns A merged tree containing every key from `fallback`.
 */
export const withFallback = (fallback: Messages, overrides: Messages): Messages =>
  Object.fromEntries(
    Object.entries(fallback).map(([key, value]) => {
      const override = overrides[key];
      if (isObject(value)) return [key, withFallback(value, isObject(override) ? override : {})];
      return [key, typeof override === "string" ? override : value];
    }),
  );

/**
 * Lists dotted keys present in `reference` but missing from `candidate`.
 * @param reference - Complete message tree.
 * @param candidate - Message tree to check.
 * @param prefix - Key path prefix used during recursion.
 * @returns Missing keys such as `Studio.title`.
 */
export const missingKeys = (reference: Messages, candidate: Messages, prefix = ""): string[] =>
  Object.entries(reference).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const other = candidate[key];
    if (isObject(value)) return missingKeys(value, isObject(other) ? other : {}, path);
    return typeof other === "string" ? [] : [path];
  });

export type { Messages };

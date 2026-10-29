/**
 * Room deduplication logic: pure deterministic item matching and consumption
 */

import { normaliseQualifier } from "./rooms.js";

export interface DedupeItem {
  name: string;
  quantity: number;
  estimatedCubicFeet: number;
  estimatedWeightKg: number;
  alreadyCounted: boolean;
  [key: string]: unknown;
}

const STOP_TOKENS = new Set([
  "a",
  "an",
  "the",
  "of",
  "with",
  "and",
  "large",
  "small",
  "medium",
  "big",
  "standard",
]);

function singularize(word: string): string {
  if (word.length <= 3) {
    return word;
  }

  // "ies" -> "y" (length > 4)
  if (word.length > 4 && word.endsWith("ies")) {
    return word.slice(0, -3) + "y";
  }

  // "xes", "ches", "shes", "sses" -> remove "es"
  if (
    word.endsWith("xes") ||
    word.endsWith("ches") ||
    word.endsWith("shes") ||
    word.endsWith("sses")
  ) {
    return word.slice(0, -2);
  }

  // length > 3, ends with "s" but not "ss" -> remove "s"
  if (word.endsWith("s") && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }

  return word;
}

/**
 * Normalize item name to comparable tokens
 */
export function normalizeItemTokens(name: string): string[] {
  // Lowercase
  let text = name.toLowerCase();

  // Replace non-alphanumeric with space
  text = text.replace(/[^a-z0-9]+/g, " ");

  // Split and filter
  const tokens = text.split(" ").filter((t) => t.length > 0);

  // Remove stop tokens and singularize
  const result: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    if (STOP_TOKENS.has(token)) {
      continue;
    }

    const singular = singularize(token);
    if (!seen.has(singular)) {
      result.push(singular);
      seen.add(singular);
    }
  }

  return result;
}

/**
 * Check if two item names match (one contains all tokens of the other)
 */
export function itemNamesMatch(a: string, b: string): boolean {
  const tokensA = normalizeItemTokens(a);
  const tokensB = normalizeItemTokens(b);

  if (tokensA.length === 0 || tokensB.length === 0) {
    return false;
  }

  // Every token of A in B, or every token of B in A
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  const aInB = tokensA.every((t) => setB.has(t));
  const bInA = tokensB.every((t) => setA.has(t));

  return aInB || bInA;
}

/**
 * Deduplicate items against a group (greedy consumption from pool)
 */
export function dedupeItemsAgainstGroup<T extends DedupeItem>(
  items: T[],
  groupItems: Array<{ name: string; quantity: number }>
): { items: T[]; matchedUnits: number; changed: boolean } {
  // Build pool (only finite positive quantities)
  const pool: Array<{ name: string; remaining: number }> = [];
  for (const g of groupItems) {
    if (isFinite(g.quantity) && g.quantity > 0) {
      pool.push({ name: g.name, remaining: g.quantity });
    }
  }

  const result: T[] = [];
  let matchedUnits = 0;

  for (const item of items) {
    // Skip if already counted
    if (item.alreadyCounted === true) {
      result.push(item);
      continue;
    }

    // Skip if invalid quantity
    if (!isFinite(item.quantity) || item.quantity <= 0) {
      result.push(item);
      continue;
    }

    // Find available units in pool
    let available = 0;
    for (const p of pool) {
      if (itemNamesMatch(item.name, p.name)) {
        available += p.remaining;
      }
    }

    if (available === 0) {
      // No match, keep as is
      result.push(item);
      continue;
    }

    // Consume greedily
    const consumed = Math.min(item.quantity, available);
    let toConsume = consumed;

    for (const p of pool) {
      if (toConsume === 0) break;
      if (!itemNamesMatch(item.name, p.name)) continue;

      const take = Math.min(toConsume, p.remaining);
      p.remaining -= take;
      toConsume -= take;
    }

    matchedUnits += consumed;

    if (consumed >= item.quantity) {
      // Fully matched
      result.push({ ...item, alreadyCounted: true });
    } else {
      // Split: matched part first, then new part
      const matchedRatio = consumed / item.quantity;
      const newRatio = (item.quantity - consumed) / item.quantity;

      const matchedPart: T = {
        ...item,
        quantity: consumed,
        estimatedCubicFeet: Math.round(item.estimatedCubicFeet * matchedRatio * 10) / 10,
        estimatedWeightKg: Math.round(item.estimatedWeightKg * matchedRatio * 10) / 10,
        alreadyCounted: true,
      };

      const newPart: T = {
        ...item,
        quantity: item.quantity - consumed,
        estimatedCubicFeet: Math.round(item.estimatedCubicFeet * newRatio * 10) / 10,
        estimatedWeightKg: Math.round(item.estimatedWeightKg * newRatio * 10) / 10,
        alreadyCounted: false,
      };

      result.push(matchedPart);
      result.push(newPart);
    }
  }

  return {
    items: result,
    matchedUnits,
    changed: matchedUnits > 0,
  };
}

/**
 * Detect if a new capture lands in an existing same-type room
 */
export function detectSameTypeCollision(
  room: { roomKey: string; qualifier: string | null; matchedExisting: boolean },
  groups: Array<{ roomKey: string; qualifier: string | null; label: string }>
): string | null {
  if (room.matchedExisting) {
    return null;
  }

  const targetQualifier = normaliseQualifier(room.qualifier);

  for (const group of groups) {
    const groupQualifier = normaliseQualifier(group.qualifier);

    if (room.roomKey === group.roomKey && targetQualifier === groupQualifier) {
      return group.label;
    }
  }

  return null;
}

/**
 * Check if user text is a "same room" reply
 */
export function isSameRoomReply(text: string): boolean {
  // Normalize
  let t = text.toLowerCase();

  // Curly quotes to straight
  t = t.replace(/[\u2018\u2019]/g, "'");
  t = t.replace(/[\u201C\u201D]/g, '"');

  // Trim
  t = t.trim();

  // Strip leading/trailing punctuation
  const trimChars = new Set([" ", '"', "'", ".", "!", ",", "?", " "]);
  while (t.length > 0 && trimChars.has(t[0])) {
    t = t.substring(1);
  }
  while (t.length > 0 && trimChars.has(t[t.length - 1])) {
    t = t.substring(0, t.length - 1);
  }

  // Collapse whitespace
  t = t.replace(/\s+/g, " ");

  // Length check
  if (t.length === 0 || t.length > 80) {
    return false;
  }

  // Build regex pattern
  const filler = "(?:(?:yes|yeah|yep|yup|sorry|oops|actually|hey|hi|oh|well)[\\s,]*)";
  const pronoun = "(?:(?:it'?s|its|it is|this is|that is|that'?s|this|that)\\s+)";
  const theOptional = "(?:the )?";
  const roomWord = "(?:room|bedroom|kitchen|hall|living room|bathroom|balcony|study|office|place|one|dining area|dining room|storeroom)";
  const trailing = "(?:\\s+as before|\\s+as above|\\s+as earlier|\\s+as the last photo|\\s+as the last one|\\s+as the previous photo|\\s+as the previous one)?";
  const angleEtc = "(?:,?\\s+different angle|\\s+another angle|\\s+from another angle|\\s+please|\\s+pls|\\s+thanks|\\s+thank you|\\s+photo|\\s+pic)*";

  // Pattern: filler* pronoun? "the "? "same" (roomWord trailing | exactPhrase) angleEtc
  // Note: roomWord with trailing is the core pattern, exact phrases are alternatives
  const pattern = `^${filler}*${pronoun}?${theOptional}same(?:\\s+(?:${roomWord}${trailing}|as before|as above|as earlier|as the last photo|as the last one))${angleEtc}$`;

  const regex = new RegExp(pattern);
  return regex.test(t);
}

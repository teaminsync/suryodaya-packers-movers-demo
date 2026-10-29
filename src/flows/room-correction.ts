/**
 * Room correction parsing and planning (pure module, no DB dependencies)
 */

import { type RoomKey, normaliseQualifier, roomLabel, computeCaptureTotals, type InventoryGroup } from "./rooms.js";
import { isSameRoomReply, dedupeItemsAgainstGroup } from "./room-dedupe.js";

export interface RoomCorrection {
  roomKey: RoomKey;
  qualifier: string | null;
}

export function parseRoomCorrection(text: string): RoomCorrection | null {
  // Step 1: normalize text
  let t = text.toLowerCase();
  
  // Replace fancy quotes with straight quotes
  t = t.replace(/[\u2018\u2019]/g, "'");
  t = t.replace(/[\u201C\u201D]/g, '"');
  
  // Trim
  t = t.trim();
  
  // Remove leading/trailing characters from set: " ' . ! , ? and spaces
  const trimChars = new Set([' ', '"', "'", '.', '!', ',', '?']);
  while (t.length > 0 && trimChars.has(t[0])) {
    t = t.substring(1);
  }
  while (t.length > 0 && trimChars.has(t[t.length - 1])) {
    t = t.substring(0, t.length - 1);
  }
  
  // Collapse runs of whitespace
  t = t.replace(/\s+/g, ' ');
  
  // Check length constraints
  if (t.length === 0 || t.length > 80) {
    return null;
  }
  
  // Step 2: Remove leading filler
  t = t.replace(/^(?:(?:no|nope|sorry|oops|wait|actually|hey|hi|um|well|oh)\b[\s,.!:-]*)+/, '');
  t = t.trim();
  
  // Step 3: Try pattern matching
  const SUBJECT = "(?:(?:this|that|it|these|those)(?: one| photo| pic| picture| video| image)?|the (?:last|latest|previous) (?:photo|pic|picture|video|image|one))";
  const VERB = "(?:is|was|are|were|'s|should be|should say|belongs (?:to|in|under))";
  const A = new RegExp("^" + SUBJECT + "\\s*" + VERB + "\\s+(?:(?:in|of)\\s+)?(?:actually\\s+)?(?:(?:a|an|the|my|our)\\s+)?(.+)$");
  const B = new RegExp("^(?:(?:can|could) you\\s+)?(?:please\\s+)?(?:move|change|put|file|label|mark|set|shift)\\s+(?:this|that|it|the (?:last|latest|previous) (?:photo|pic|picture|video|image))\\s*(?:to|as|under|in|into)\\s+(?:(?:a|an|the|my|our)\\s+)?(.+)$");
  
  let g: string | null = null;
  const matchA = t.match(A);
  if (matchA) {
    g = matchA[1];
  } else {
    const matchB = t.match(B);
    if (matchB) {
      g = matchB[1];
    }
  }
  
  if (!g) {
    return null;
  }
  
  // Step 4: Clean up captured group
  g = g.replace(/(?:\s+(?:please|pls|thanks|thank you|photo|pic|picture|video|image|only))+$/, '');
  g = g.trim();
  
  const words = g.split(' ');
  if (words.length === 0 || words.length > 4) {
    return null;
  }
  
  // Step 5: Find room word
  const twoWordTable: Record<string, RoomKey> = {
    "living room": "living_room",
    "drawing room": "living_room",
    "sitting room": "living_room",
    "family room": "living_room",
    "dining room": "dining",
    "dining area": "dining",
    "dining hall": "dining",
    "bath room": "bathroom",
    "study room": "study_office",
    "home office": "study_office",
    "office room": "study_office",
    "store room": "storeroom",
    "storage room": "storeroom",
    "bed room": "bedroom",
  };
  
  const oneWordTable: Record<string, RoomKey> = {
    "living": "living_room",
    "hall": "living_room",
    "lounge": "living_room",
    "bedroom": "bedroom",
    "kitchen": "kitchen",
    "dining": "dining",
    "bathroom": "bathroom",
    "washroom": "bathroom",
    "toilet": "bathroom",
    "restroom": "bathroom",
    "balcony": "balcony",
    "terrace": "balcony",
    "veranda": "balcony",
    "verandah": "balcony",
    "study": "study_office",
    "office": "study_office",
    "storeroom": "storeroom",
    "storage": "storeroom",
    "store": "storeroom",
    "godown": "storeroom",
  };
  
  let roomKey: RoomKey | null = null;
  let qualifierWords: string[] = [];
  
  // Try last two words
  if (words.length >= 2) {
    const lastTwo = words.slice(-2).join(' ');
    if (twoWordTable[lastTwo]) {
      roomKey = twoWordTable[lastTwo];
      qualifierWords = words.slice(0, -2);
    }
  }
  
  // Try last one word if no two-word match
  if (!roomKey && words.length >= 1) {
    const lastOne = words[words.length - 1];
    if (oneWordTable[lastOne]) {
      roomKey = oneWordTable[lastOne];
      qualifierWords = words.slice(0, -1);
    } else if (lastOne === "room") {
      // Special case: "room" alone may mean bedroom if qualifier is appropriate
      qualifierWords = words.slice(0, -1);
      
      // Check if any qualifier word is in the special list
      const bedroomQualifiers = new Set([
        "kids", "kid", "kids'", "kid's", "children", "childrens", "child",
        "guest", "spare", "parents", "parent", "master", "baby",
        "son", "daughter", "boys", "girls", "second", "third", "first", "extra"
      ]);
      
      let hasBedroomQualifier = false;
      for (const qw of qualifierWords) {
        if (bedroomQualifiers.has(qw)) {
          hasBedroomQualifier = true;
          break;
        }
      }
      
      if (hasBedroomQualifier) {
        roomKey = "bedroom";
      } else {
        return null;
      }
    }
  }
  
  if (!roomKey) {
    return null;
  }
  
  // Step 6: Process qualifier words
  const removeWords = new Set(["a", "an", "the", "my", "our", "your", "this", "that", "room"]);
  let filteredQualifiers: string[] = [];
  
  for (let w of qualifierWords) {
    if (!removeWords.has(w)) {
      // Remove trailing 's or '
      w = w.replace(/'s$/, '').replace(/'$/, '');
      if (w.length > 0) {
        filteredQualifiers.push(w);
      }
    }
  }
  
  if (filteredQualifiers.length > 2) {
    return null;
  }
  
  const qualifier = normaliseQualifier(filteredQualifiers.join(' '));
  
  return { roomKey, qualifier };
}

export interface LatestCapture {
  id: string;
  room_key: string | null;
  room_qualifier: string | null;
  suggested_room_label: string | null;
  items: string;
  created_at: string | Date;
}

export type RoomCorrectionPlan =
  | { kind: "none" }
  | { kind: "unchanged"; label: string }
  | { kind: "relabel"; captureId: string; roomKey: RoomKey; qualifier: string | null; label: string; resetDuplicates: boolean; itemsJson: string | null; cubicFeet: number | null; weightKg: number | null; matchedCount?: number };

export function planRoomCorrection(input: {
  text: string;
  latest: LatestCapture | undefined;
  now: Date;
  windowMinutes?: number;
  existingGroups?: InventoryGroup[];
}): RoomCorrectionPlan {
  let parsed = parseRoomCorrection(input.text);
  
  // Handle "same room" replies
  if (parsed === null && isSameRoomReply(input.text) && input.latest?.room_key) {
    const latestRoomKey = input.latest.room_key.trim();
    if (latestRoomKey !== "") {
      parsed = {
        roomKey: latestRoomKey as RoomKey,
        qualifier: normaliseQualifier(input.latest.room_qualifier),
      };
    }
  }
  
  if (parsed === null) {
    return { kind: "none" };
  }
  
  if (input.latest === undefined) {
    return { kind: "none" };
  }
  
  // Check time window
  const created = new Date(input.latest.created_at).getTime();
  if (isNaN(created)) {
    return { kind: "none" };
  }
  
  const windowMs = (input.windowMinutes ?? 15) * 60000;
  if (input.now.getTime() - created > windowMs) {
    return { kind: "none" };
  }
  
  const label = roomLabel(parsed.roomKey, parsed.qualifier);
  
  // Check if unchanged
  const oldKey = input.latest.room_key ? input.latest.room_key + "|" + (normaliseQualifier(input.latest.room_qualifier) ?? "") : null;
  const newKey = parsed.roomKey + "|" + (parsed.qualifier ?? "");
  
  // Find target group items
  const targetGroupItems: Array<{ name: string; quantity: number }> = [];
  if (input.existingGroups) {
    for (const group of input.existingGroups) {
      if (group.roomKey === parsed.roomKey && normaliseQualifier(group.qualifier) === parsed.qualifier) {
        targetGroupItems.push(...group.items);
        break;
      }
    }
  }
  
  if (oldKey === newKey) {
    // SAME KEY case: check for deduplication
    if (targetGroupItems.length > 0) {
      let items: any[];
      try {
        const parsed_items = JSON.parse(input.latest.items);
        if (Array.isArray(parsed_items)) {
          items = parsed_items;
          
          // Dedupe without resetting alreadyCounted
          const deduped = dedupeItemsAgainstGroup(items, targetGroupItems);
          
          if (deduped.matchedUnits > 0) {
            // Compute totals
            const totals = computeCaptureTotals(
              deduped.items.map(i => ({
                quantity: Number(i.quantity) || 0,
                estimatedCubicFeet: Number(i.estimatedCubicFeet) || 0,
                estimatedWeightKg: Number(i.estimatedWeightKg) || 0,
                alreadyCounted: i.alreadyCounted === true,
              }))
            );
            
            return {
              kind: "relabel",
              captureId: input.latest.id,
              roomKey: parsed.roomKey,
              qualifier: parsed.qualifier,
              label,
              resetDuplicates: false,
              itemsJson: JSON.stringify(deduped.items),
              cubicFeet: totals.cubicFeet,
              weightKg: totals.weightKg,
              matchedCount: deduped.matchedUnits,
            };
          }
        }
      } catch {
        // Fall through
      }
    }
    
    return { kind: "unchanged", label };
  }
  
  // Parse items
  let items: any[];
  try {
    const parsed_items = JSON.parse(input.latest.items);
    if (!Array.isArray(parsed_items)) {
      return {
        kind: "relabel",
        captureId: input.latest.id,
        roomKey: parsed.roomKey,
        qualifier: parsed.qualifier,
        label,
        resetDuplicates: false,
        itemsJson: null,
        cubicFeet: null,
        weightKg: null,
      };
    }
    items = parsed_items;
  } catch {
    return {
      kind: "relabel",
      captureId: input.latest.id,
      roomKey: parsed.roomKey,
      qualifier: parsed.qualifier,
      label,
      resetDuplicates: false,
      itemsJson: null,
      cubicFeet: null,
      weightKg: null,
    };
  }
  
  // Check if any item has alreadyCounted === true
  const hasAlreadyCounted = items.some(i => i.alreadyCounted === true);
  
  let items2 = items;
  let resetDuplicates = false;
  
  if (hasAlreadyCounted) {
    // Reset all alreadyCounted to false
    items2 = items.map(i => ({ ...i, alreadyCounted: false }));
    resetDuplicates = true;
  }
  
  // Dedupe against target group if present
  let matchedCount: number | undefined = undefined;
  let finalItems = items2;
  let finalCubicFeet: number | null = null;
  let finalWeightKg: number | null = null;
  
  if (targetGroupItems.length > 0) {
    const deduped = dedupeItemsAgainstGroup(items2, targetGroupItems);
    
    if (deduped.matchedUnits > 0) {
      finalItems = deduped.items;
      matchedCount = deduped.matchedUnits;
      
      // Compute totals
      const totals = computeCaptureTotals(
        finalItems.map(i => ({
          quantity: Number(i.quantity) || 0,
          estimatedCubicFeet: Number(i.estimatedCubicFeet) || 0,
          estimatedWeightKg: Number(i.estimatedWeightKg) || 0,
          alreadyCounted: i.alreadyCounted === true,
        }))
      );
      
      finalCubicFeet = totals.cubicFeet;
      finalWeightKg = totals.weightKg;
    }
  }
  
  if (resetDuplicates && matchedCount === undefined) {
    // Reset case without dedupe
    const totals = computeCaptureTotals(
      items2.map(i => ({
        quantity: Number(i.quantity) || 0,
        estimatedCubicFeet: Number(i.estimatedCubicFeet) || 0,
        estimatedWeightKg: Number(i.estimatedWeightKg) || 0,
        alreadyCounted: false,
      }))
    );
    
    const plan: RoomCorrectionPlan = {
      kind: "relabel",
      captureId: input.latest.id,
      roomKey: parsed.roomKey,
      qualifier: parsed.qualifier,
      label,
      resetDuplicates: true,
      itemsJson: JSON.stringify(items2),
      cubicFeet: totals.cubicFeet,
      weightKg: totals.weightKg,
    };
    return plan;
  }
  
  const plan: RoomCorrectionPlan = {
    kind: "relabel",
    captureId: input.latest.id,
    roomKey: parsed.roomKey,
    qualifier: parsed.qualifier,
    label,
    resetDuplicates,
    itemsJson: finalItems !== items2 || finalCubicFeet !== null ? JSON.stringify(finalItems) : null,
    cubicFeet: finalCubicFeet,
    weightKg: finalWeightKg,
  };
  
  if (matchedCount !== undefined && matchedCount > 0) {
    plan.matchedCount = matchedCount;
  }
  
  return plan;
}

export function buildRoomCorrectionReply(plan: RoomCorrectionPlan): string | null {
  if (plan.kind === "none") {
    return null;
  }
  
  if (plan.kind === "unchanged") {
    return `That photo is already filed under ${plan.label}.`;
  }
  
  if (plan.kind === "relabel") {
    let reply = `Done, I've filed your latest photo under ${plan.label}.`;
    if (plan.matchedCount && plan.matchedCount > 0) {
      reply += ` I matched ${plan.matchedCount} item(s) to what you'd already sent for that room, so I haven't counted them twice.`;
    } else if (plan.resetDuplicates) {
      reply += " Its items now count toward your move total.";
    }
    reply += ' Tap "Get My Move Total" to see the updated estimate.';
    return reply;
  }
  
  return null;
}

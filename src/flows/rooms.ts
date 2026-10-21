/**
 * Room identification, grouping, and inventory aggregation
 * Pure module with no database dependencies
 */

export const ROOM_KEYS = [
  "living_room",
  "bedroom",
  "kitchen",
  "dining",
  "bathroom",
  "balcony",
  "study_office",
  "storeroom",
  "other",
] as const;

export type RoomKey = (typeof ROOM_KEYS)[number];

export const ROOM_DISPLAY: Record<RoomKey, string> = {
  living_room: "Living Room",
  bedroom: "Bedroom",
  kitchen: "Kitchen",
  dining: "Dining Area",
  bathroom: "Bathroom",
  balcony: "Balcony",
  study_office: "Study / Office",
  storeroom: "Storeroom",
  other: "Other",
};

export function isRoomKey(value: unknown): value is RoomKey {
  return (
    typeof value === "string" &&
    (ROOM_KEYS as readonly string[]).includes(value)
  );
}

export function normaliseQualifier(
  q: string | null | undefined
): string | null {
  if (!q) return null;
  let normalised = q.trim().toLowerCase();
  // Replace runs of - _ / with space
  normalised = normalised.replace(/[-_/]+/g, " ");
  // Collapse whitespace
  normalised = normalised.replace(/\s+/g, " ");
  // Remove everything that is not a-z, 0-9, or space
  normalised = normalised.replace(/[^a-z0-9 ]/g, "");
  normalised = normalised.trim();
  // Cut to 30 characters
  if (normalised.length > 30) {
    normalised = normalised.slice(0, 30);
  }
  return normalised || null;
}

function toTitleCase(text: string): string {
  return text
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function roomLabel(roomKey: RoomKey, qualifier: string | null): string {
  if (!qualifier) {
    return ROOM_DISPLAY[roomKey];
  }
  const titleCasedQualifier = toTitleCase(qualifier);
  return `${titleCasedQualifier} ${ROOM_DISPLAY[roomKey]}`;
}

export interface CountedItem {
  name: string;
  quantity: number;
}

export interface InventoryGroup {
  roomKey: RoomKey;
  qualifier: string | null;
  label: string;
  items: CountedItem[];
}

export function buildInventoryGroups(
  rows: Array<{
    room_key: string | null;
    room_qualifier: string | null;
    items: string;
  }>
): InventoryGroup[] {
  const groupMap = new Map<
    string,
    {
      roomKey: RoomKey;
      qualifier: string | null;
      itemMap: Map<string, { name: string; quantity: number }>;
    }
  >();

  for (const row of rows) {
    // Skip rows with null or invalid room_key
    if (!row.room_key || !isRoomKey(row.room_key)) {
      continue;
    }

    // Parse items JSON
    let itemsArray: any[];
    try {
      const parsed = JSON.parse(row.items);
      if (!Array.isArray(parsed)) {
        continue;
      }
      itemsArray = parsed;
    } catch {
      continue;
    }

    const roomKey = row.room_key;
    const qualifier = normaliseQualifier(row.room_qualifier);
    const groupKey = `${roomKey}|${qualifier ?? ""}`;

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        roomKey,
        qualifier,
        itemMap: new Map(),
      });
    }

    const group = groupMap.get(groupKey)!;

    // Process items
    for (const item of itemsArray) {
      // Skip items marked as alreadyCounted
      if (item.alreadyCounted === true) {
        continue;
      }

      // Validate item fields
      if (
        typeof item.name !== "string" ||
        !item.name.trim() ||
        typeof item.quantity !== "number" ||
        !isFinite(item.quantity) ||
        item.quantity <= 0
      ) {
        continue;
      }

      const itemKey = item.name.trim().toLowerCase();
      if (group.itemMap.has(itemKey)) {
        const existing = group.itemMap.get(itemKey)!;
        existing.quantity += item.quantity;
      } else {
        group.itemMap.set(itemKey, {
          name: item.name.trim(),
          quantity: item.quantity,
        });
      }
    }
  }

  // Convert to output format
  const result: InventoryGroup[] = [];
  for (const { roomKey, qualifier, itemMap } of groupMap.values()) {
    const items = Array.from(itemMap.values());
    if (items.length === 0) {
      continue;
    }
    result.push({
      roomKey,
      qualifier,
      label: roomLabel(roomKey, qualifier),
      items,
    });
  }

  return result;
}

export function formatInventoryContext(groups: InventoryGroup[]): string {
  if (groups.length === 0) {
    return "";
  }

  const lines: string[] = [
    "ITEMS ALREADY COUNTED FOR THIS MOVE (from earlier photos and videos, by room):",
  ];

  const maxGroups = 12;
  const maxItemsPerGroup = 40;

  for (let i = 0; i < Math.min(groups.length, maxGroups); i++) {
    const group = groups[i];
    const itemsToShow = group.items.slice(0, maxItemsPerGroup);
    const itemStrings = itemsToShow.map(
      (item) => `${item.name} (${item.quantity})`
    );
    lines.push(`- ${group.label}: ${itemStrings.join(", ")}`);
  }

  return lines.join("\n");
}

export function resolveRoom(
  roomKey: RoomKey,
  sameRoomAs: string | null | undefined,
  groups: InventoryGroup[]
): {
  roomKey: RoomKey;
  qualifier: string | null;
  label: string;
  matchedExisting: boolean;
} {
  if (sameRoomAs) {
    const trimmed = sameRoomAs.trim();
    const lowerTarget = trimmed.toLowerCase();
    for (const group of groups) {
      if (group.label.toLowerCase() === lowerTarget) {
        return {
          roomKey: group.roomKey,
          qualifier: group.qualifier,
          label: group.label,
          matchedExisting: true,
        };
      }
    }
  }

  return {
    roomKey,
    qualifier: null,
    label: roomLabel(roomKey, null),
    matchedExisting: false,
  };
}

export function computeCaptureTotals(
  items: Array<{
    quantity: number;
    estimatedCubicFeet: number;
    estimatedWeightKg: number;
    alreadyCounted: boolean;
  }>
): {
  cubicFeet: number;
  weightKg: number;
  newItemCount: number;
  duplicateItemCount: number;
} {
  let cubicFeet = 0;
  let weightKg = 0;
  let newItemCount = 0;
  let duplicateItemCount = 0;

  for (const item of items) {
    if (item.alreadyCounted === false) {
      const cf = isFinite(item.estimatedCubicFeet)
        ? item.estimatedCubicFeet
        : 0;
      const wk = isFinite(item.estimatedWeightKg) ? item.estimatedWeightKg : 0;
      cubicFeet += cf;
      weightKg += wk;
      newItemCount++;
    } else {
      duplicateItemCount++;
    }
  }

  return {
    cubicFeet: Math.round(cubicFeet * 10) / 10,
    weightKg: Math.round(weightKg * 10) / 10,
    newItemCount,
    duplicateItemCount,
  };
}

export function normaliseSameRoomAs(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  
  // Remove everything that is not a-z
  const normalized = trimmed.toLowerCase().replace(/[^a-z]/g, "");
  
  // Check against no-match patterns
  const noMatchPatterns = [
    "null",
    "none",
    "na",
    "no",
    "nil",
    "undefined",
    "unknown",
    "differentroom",
    "notsure",
  ];
  
  if (noMatchPatterns.includes(normalized)) {
    return null;
  }
  
  return trimmed;
}

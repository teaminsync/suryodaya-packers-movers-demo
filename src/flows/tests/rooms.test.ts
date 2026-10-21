/**
 * Tests for rooms.ts (pure logic, no DB)
 */

import {
  normaliseQualifier,
  roomLabel,
  buildInventoryGroups,
  formatInventoryContext,
  resolveRoom,
  computeCaptureTotals,
  normaliseSameRoomAs,
  type RoomKey,
} from "../rooms.js";

describe("rooms", () => {
  describe("normaliseQualifier", () => {
    it("should trim and lowercase", () => {
      expect(normaliseQualifier("  Master  ")).toBe("master");
    });

    it("should collapse whitespace", () => {
      expect(normaliseQualifier("kids   bedroom")).toBe("kids bedroom");
    });

    it("should remove symbols", () => {
      expect(normaliseQualifier("master's-bedroom!")).toBe("masters bedroom");
    });

    it("should replace dashes with space", () => {
      expect(normaliseQualifier("kids_room")).toBe("kids room");
    });

    it("should cut to 30 characters", () => {
      const long = "a".repeat(50);
      expect(normaliseQualifier(long)).toBe("a".repeat(30));
    });

    it("should return null for empty after processing", () => {
      expect(normaliseQualifier("!!!")).toBe(null);
      expect(normaliseQualifier("")).toBe(null);
      expect(normaliseQualifier(null)).toBe(null);
      expect(normaliseQualifier(undefined)).toBe(null);
    });
  });

  describe("roomLabel", () => {
    it("should return display name when qualifier is null", () => {
      expect(roomLabel("bedroom", null)).toBe("Bedroom");
      expect(roomLabel("living_room", null)).toBe("Living Room");
    });

    it("should prefix qualifier in title case", () => {
      expect(roomLabel("bedroom", "master")).toBe("Master Bedroom");
      expect(roomLabel("bedroom", "kids")).toBe("Kids Bedroom");
    });

    it("should handle multi-word qualifiers", () => {
      expect(roomLabel("bedroom", "guest upstairs")).toBe("Guest Upstairs Bedroom");
    });
  });

  describe("buildInventoryGroups", () => {
    it("should skip rows with null room_key", () => {
      const rows = [{ room_key: null, room_qualifier: null, items: "[]" }];
      expect(buildInventoryGroups(rows)).toEqual([]);
    });

    it("should skip rows with invalid room_key", () => {
      const rows = [{ room_key: "invalid_key", room_qualifier: null, items: "[]" }];
      expect(buildInventoryGroups(rows)).toEqual([]);
    });

    it("should skip rows with bad JSON", () => {
      const rows = [{ room_key: "bedroom", room_qualifier: null, items: "{bad json" }];
      expect(buildInventoryGroups(rows)).toEqual([]);
    });

    it("should skip rows with non-array JSON", () => {
      const rows = [{ room_key: "bedroom", room_qualifier: null, items: '{"not":"array"}' }];
      expect(buildInventoryGroups(rows)).toEqual([]);
    });

    it("should skip items marked alreadyCounted", () => {
      const rows = [{
        room_key: "bedroom",
        room_qualifier: null,
        items: JSON.stringify([
          { name: "bed", quantity: 1, alreadyCounted: true },
          { name: "chair", quantity: 2, alreadyCounted: false },
        ]),
      }];
      const groups = buildInventoryGroups(rows);
      expect(groups).toHaveLength(1);
      expect(groups[0].items).toEqual([{ name: "chair", quantity: 2 }]);
    });

    it("should aggregate same-name items case-insensitively", () => {
      const rows = [{
        room_key: "bedroom",
        room_qualifier: null,
        items: JSON.stringify([
          { name: "Chair", quantity: 2, alreadyCounted: false },
          { name: "chair", quantity: 3, alreadyCounted: false },
        ]),
      }];
      const groups = buildInventoryGroups(rows);
      expect(groups).toHaveLength(1);
      expect(groups[0].items).toEqual([{ name: "Chair", quantity: 5 }]);
    });

    it("should keep qualifiers separate", () => {
      const rows = [
        {
          room_key: "bedroom",
          room_qualifier: "master",
          items: JSON.stringify([{ name: "bed", quantity: 1, alreadyCounted: false }]),
        },
        {
          room_key: "bedroom",
          room_qualifier: "kids",
          items: JSON.stringify([{ name: "bed", quantity: 1, alreadyCounted: false }]),
        },
      ];
      const groups = buildInventoryGroups(rows);
      expect(groups).toHaveLength(2);
      expect(groups[0].label).toBe("Master Bedroom");
      expect(groups[1].label).toBe("Kids Bedroom");
    });

    it("should omit empty groups", () => {
      const rows = [{
        room_key: "bedroom",
        room_qualifier: null,
        items: JSON.stringify([{ name: "bed", quantity: 1, alreadyCounted: true }]),
      }];
      expect(buildInventoryGroups(rows)).toEqual([]);
    });

    it("should skip invalid item lines", () => {
      const rows = [{
        room_key: "bedroom",
        room_qualifier: null,
        items: JSON.stringify([
          { name: "", quantity: 1, alreadyCounted: false }, // empty name
          { name: "bed", quantity: 0, alreadyCounted: false }, // zero quantity
          { name: "chair", quantity: -1, alreadyCounted: false }, // negative quantity
          { name: "table", quantity: NaN, alreadyCounted: false }, // NaN
          { name: "desk", quantity: 2, alreadyCounted: false }, // valid
        ]),
      }];
      const groups = buildInventoryGroups(rows);
      expect(groups).toHaveLength(1);
      expect(groups[0].items).toEqual([{ name: "desk", quantity: 2 }]);
    });
  });

  describe("formatInventoryContext", () => {
    it("should return empty string for no groups", () => {
      expect(formatInventoryContext([])).toBe("");
    });

    it("should format groups correctly", () => {
      const groups = [
        {
          roomKey: "bedroom" as RoomKey,
          qualifier: null,
          label: "Bedroom",
          items: [
            { name: "bed", quantity: 1 },
            { name: "wardrobe", quantity: 2 },
          ],
        },
        {
          roomKey: "bedroom" as RoomKey,
          qualifier: "master",
          label: "Master Bedroom",
          items: [{ name: "bed", quantity: 1 }],
        },
      ];
      const result = formatInventoryContext(groups);
      expect(result).toContain("ITEMS ALREADY COUNTED FOR THIS MOVE");
      expect(result).toContain("- Bedroom: bed (1), wardrobe (2)");
      expect(result).toContain("- Master Bedroom: bed (1)");
    });

    it("should cap at 12 groups", () => {
      const groups = Array.from({ length: 15 }, (_, i) => ({
        roomKey: "bedroom" as RoomKey,
        qualifier: `q${i}`,
        label: `Q${i} Bedroom`,
        items: [{ name: "bed", quantity: 1 }],
      }));
      const result = formatInventoryContext(groups);
      const lines = result.split("\n");
      expect(lines).toHaveLength(13); // header + 12 groups
    });

    it("should cap at 40 items per group", () => {
      const items = Array.from({ length: 50 }, (_, i) => ({ name: `item${i}`, quantity: 1 }));
      const groups = [{
        roomKey: "bedroom" as RoomKey,
        qualifier: null,
        label: "Bedroom",
        items,
      }];
      const result = formatInventoryContext(groups);
      const matches = result.match(/item\d+/g);
      expect(matches).toHaveLength(40);
    });
  });

  describe("resolveRoom", () => {
    const groups = [
      {
        roomKey: "bedroom" as RoomKey,
        qualifier: "master",
        label: "Master Bedroom",
        items: [{ name: "bed", quantity: 1 }],
      },
      {
        roomKey: "bedroom" as RoomKey,
        qualifier: null,
        label: "Bedroom",
        items: [{ name: "bed", quantity: 1 }],
      },
    ];

    it("should match exact label case-insensitively", () => {
      const result = resolveRoom("living_room", "master bedroom", groups);
      expect(result.roomKey).toBe("bedroom");
      expect(result.qualifier).toBe("master");
      expect(result.label).toBe("Master Bedroom");
      expect(result.matchedExisting).toBe(true);
    });

    it("should use group's roomKey even if AI roomKey differs", () => {
      // AI says "kitchen" but sameRoomAs matches "Master Bedroom"
      const result = resolveRoom("kitchen", "Master Bedroom", groups);
      expect(result.roomKey).toBe("bedroom"); // from the group, not AI
      expect(result.matchedExisting).toBe(true);
    });

    it("should return qualifier null and matchedExisting false when no match", () => {
      const result = resolveRoom("kitchen", "dining room", groups);
      expect(result.roomKey).toBe("kitchen");
      expect(result.qualifier).toBe(null);
      expect(result.label).toBe("Kitchen");
      expect(result.matchedExisting).toBe(false);
    });

    it("should return qualifier null when sameRoomAs is null", () => {
      const result = resolveRoom("bedroom", null, groups);
      expect(result.roomKey).toBe("bedroom");
      expect(result.qualifier).toBe(null);
      expect(result.matchedExisting).toBe(false);
    });
  });

  describe("computeCaptureTotals", () => {
    it("should exclude alreadyCounted items", () => {
      const items = [
        { quantity: 2, estimatedCubicFeet: 10, estimatedWeightKg: 20, alreadyCounted: false },
        { quantity: 1, estimatedCubicFeet: 5, estimatedWeightKg: 10, alreadyCounted: true },
        { quantity: 3, estimatedCubicFeet: 15, estimatedWeightKg: 30, alreadyCounted: false },
      ];
      const result = computeCaptureTotals(items);
      expect(result.cubicFeet).toBe(25);
      expect(result.weightKg).toBe(50);
      expect(result.newItemCount).toBe(2);
      expect(result.duplicateItemCount).toBe(1);
    });

    it("should round to 1 decimal", () => {
      const items = [
        { quantity: 1, estimatedCubicFeet: 10.456, estimatedWeightKg: 20.678, alreadyCounted: false },
      ];
      const result = computeCaptureTotals(items);
      expect(result.cubicFeet).toBe(10.5);
      expect(result.weightKg).toBe(20.7);
    });

    it("should handle empty array", () => {
      const result = computeCaptureTotals([]);
      expect(result.cubicFeet).toBe(0);
      expect(result.weightKg).toBe(0);
      expect(result.newItemCount).toBe(0);
      expect(result.duplicateItemCount).toBe(0);
    });

    it("should treat NaN as 0", () => {
      const items = [
        { quantity: 1, estimatedCubicFeet: NaN, estimatedWeightKg: Infinity, alreadyCounted: false },
        { quantity: 1, estimatedCubicFeet: 10, estimatedWeightKg: 20, alreadyCounted: false },
      ];
      const result = computeCaptureTotals(items);
      expect(result.cubicFeet).toBe(10);
      expect(result.weightKg).toBe(20);
    });
  });

  describe("normaliseSameRoomAs", () => {
    it("should return null for :null:", () => {
      expect(normaliseSameRoomAs(":null:")).toBe(null);
    });

    it("should return null for None", () => {
      expect(normaliseSameRoomAs("None")).toBe(null);
    });

    it("should return null for whitespace", () => {
      expect(normaliseSameRoomAs("  ")).toBe(null);
    });

    it("should return null for null", () => {
      expect(normaliseSameRoomAs(null)).toBe(null);
    });

    it("should return null for N/A", () => {
      expect(normaliseSameRoomAs("N/A")).toBe(null);
    });

    it("should return trimmed valid string for Master Bedroom", () => {
      expect(normaliseSameRoomAs("Master Bedroom")).toBe("Master Bedroom");
    });

    it("should return trimmed string for Living Room with spaces", () => {
      expect(normaliseSameRoomAs(" Living Room ")).toBe("Living Room");
    });
  });
});

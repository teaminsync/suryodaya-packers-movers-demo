/**
 * Tests for room-dedupe.ts
 */

import { describe, it, expect } from "@jest/globals";
import {
  normalizeItemTokens,
  itemNamesMatch,
  dedupeItemsAgainstGroup,
  detectSameTypeCollision,
  isSameRoomReply,
  type DedupeItem,
} from "../room-dedupe.js";

describe("room-dedupe", () => {
  describe("normalizeItemTokens", () => {
    it("should normalize 3-Seater Velvet Sofa", () => {
      expect(normalizeItemTokens("3-Seater Velvet Sofa")).toEqual(["3", "seater", "velvet", "sofa"]);
    });

    it("should normalize Large Wooden Chairs", () => {
      expect(normalizeItemTokens("Large Wooden Chairs")).toEqual(["wooden", "chair"]);
    });

    it("should normalize Boxes", () => {
      expect(normalizeItemTokens("Boxes")).toEqual(["box"]);
    });

    it("should keep Glass", () => {
      expect(normalizeItemTokens("Glass")).toEqual(["glass"]);
    });

    it("should handle empty string", () => {
      expect(normalizeItemTokens("")).toEqual([]);
    });
  });

  describe("itemNamesMatch", () => {
    it("should match Sofa vs 3-Seater Velvet Sofa", () => {
      expect(itemNamesMatch("Sofa", "3-Seater Velvet Sofa")).toBe(true);
    });

    it("should match Dresser vs Bedside Chest / Dresser", () => {
      expect(itemNamesMatch("Dresser", "Bedside Chest / Dresser")).toBe(true);
    });

    it("should not match coffee table vs dining table", () => {
      expect(itemNamesMatch("coffee table", "dining table")).toBe(false);
    });

    it("should match chair vs chairs", () => {
      expect(itemNamesMatch("chair", "chairs")).toBe(true);
    });

    it("should not match empty vs anything", () => {
      expect(itemNamesMatch("", "chair")).toBe(false);
      expect(itemNamesMatch("chair", "")).toBe(false);
    });
  });

  describe("dedupeItemsAgainstGroup", () => {
    it("should mark full match as alreadyCounted", () => {
      const items: DedupeItem[] = [
        {
          name: "Sofa",
          quantity: 1,
          estimatedCubicFeet: 50,
          estimatedWeightKg: 80,
          alreadyCounted: false,
        },
      ];

      const groupItems = [{ name: "Sofa", quantity: 1 }];

      const result = dedupeItemsAgainstGroup(items, groupItems);

      expect(result.matchedUnits).toBe(1);
      expect(result.changed).toBe(true);
      expect(result.items.length).toBe(1);
      expect(result.items[0].alreadyCounted).toBe(true);
    });

    it("should split partial match", () => {
      const items: DedupeItem[] = [
        {
          name: "Chair",
          quantity: 4,
          estimatedCubicFeet: 40,
          estimatedWeightKg: 80,
          alreadyCounted: false,
        },
      ];

      const groupItems = [{ name: "Chair", quantity: 2 }];

      const result = dedupeItemsAgainstGroup(items, groupItems);

      expect(result.matchedUnits).toBe(2);
      expect(result.changed).toBe(true);
      expect(result.items.length).toBe(2);
      expect(result.items[0]).toEqual({
        name: "Chair",
        quantity: 2,
        estimatedCubicFeet: 20,
        estimatedWeightKg: 40,
        alreadyCounted: true,
      });
      expect(result.items[1]).toEqual({
        name: "Chair",
        quantity: 2,
        estimatedCubicFeet: 20,
        estimatedWeightKg: 40,
        alreadyCounted: false,
      });
    });

    it("should return unchanged when no match", () => {
      const items: DedupeItem[] = [
        {
          name: "Table",
          quantity: 1,
          estimatedCubicFeet: 30,
          estimatedWeightKg: 50,
          alreadyCounted: false,
        },
      ];

      const groupItems = [{ name: "Chair", quantity: 4 }];

      const result = dedupeItemsAgainstGroup(items, groupItems);

      expect(result.matchedUnits).toBe(0);
      expect(result.changed).toBe(false);
      expect(result.items).toEqual(items);
    });

    it("should not reuse pool units", () => {
      const items: DedupeItem[] = [
        {
          name: "Sofa",
          quantity: 1,
          estimatedCubicFeet: 50,
          estimatedWeightKg: 80,
          alreadyCounted: false,
        },
        {
          name: "3 Seater Sofa",
          quantity: 1,
          estimatedCubicFeet: 50,
          estimatedWeightKg: 80,
          alreadyCounted: false,
        },
      ];

      const groupItems = [{ name: "Sofa", quantity: 1 }];

      const result = dedupeItemsAgainstGroup(items, groupItems);

      expect(result.matchedUnits).toBe(1);
      expect(result.items.length).toBe(2);
      expect(result.items[0].alreadyCounted).toBe(true);
      expect(result.items[1].alreadyCounted).toBe(false);
    });

    it("should skip already-counted lines", () => {
      const items: DedupeItem[] = [
        {
          name: "Chair",
          quantity: 2,
          estimatedCubicFeet: 20,
          estimatedWeightKg: 40,
          alreadyCounted: true,
        },
        {
          name: "Chair",
          quantity: 2,
          estimatedCubicFeet: 20,
          estimatedWeightKg: 40,
          alreadyCounted: false,
        },
      ];

      const groupItems = [{ name: "Chair", quantity: 2 }];

      const result = dedupeItemsAgainstGroup(items, groupItems);

      expect(result.matchedUnits).toBe(2);
      expect(result.items[0].alreadyCounted).toBe(true);
      expect(result.items[1].alreadyCounted).toBe(true);
    });

    it("should skip invalid quantity lines", () => {
      const items: DedupeItem[] = [
        {
          name: "Chair",
          quantity: 0,
          estimatedCubicFeet: 0,
          estimatedWeightKg: 0,
          alreadyCounted: false,
        },
        {
          name: "Table",
          quantity: NaN,
          estimatedCubicFeet: 30,
          estimatedWeightKg: 50,
          alreadyCounted: false,
        },
      ];

      const groupItems = [{ name: "Chair", quantity: 4 }];

      const result = dedupeItemsAgainstGroup(items, groupItems);

      expect(result.matchedUnits).toBe(0);
      expect(result.items).toEqual(items);
    });

    it("should not mutate inputs", () => {
      const items: DedupeItem[] = [
        {
          name: "Sofa",
          quantity: 1,
          estimatedCubicFeet: 50,
          estimatedWeightKg: 80,
          alreadyCounted: false,
        },
      ];

      const groupItems = [{ name: "Sofa", quantity: 1 }];

      const itemsBefore = JSON.stringify(items);
      const groupBefore = JSON.stringify(groupItems);

      dedupeItemsAgainstGroup(items, groupItems);

      expect(JSON.stringify(items)).toBe(itemsBefore);
      expect(JSON.stringify(groupItems)).toBe(groupBefore);
    });
  });

  describe("detectSameTypeCollision", () => {
    it("should return label when collision detected", () => {
      const room = { roomKey: "bedroom", qualifier: null, matchedExisting: false };
      const groups = [{ roomKey: "bedroom", qualifier: null, label: "Bedroom" }];

      const result = detectSameTypeCollision(room, groups);

      expect(result).toBe("Bedroom");
    });

    it("should return null when matchedExisting is true", () => {
      const room = { roomKey: "bedroom", qualifier: null, matchedExisting: true };
      const groups = [{ roomKey: "bedroom", qualifier: null, label: "Bedroom" }];

      const result = detectSameTypeCollision(room, groups);

      expect(result).toBeNull();
    });

    it("should return null when qualifier differs", () => {
      const room = { roomKey: "bedroom", qualifier: "master", matchedExisting: false };
      const groups = [{ roomKey: "bedroom", qualifier: "guest", label: "Guest Bedroom" }];

      const result = detectSameTypeCollision(room, groups);

      expect(result).toBeNull();
    });

    it("should return null when roomKey differs", () => {
      const room = { roomKey: "kitchen", qualifier: null, matchedExisting: false };
      const groups = [{ roomKey: "bedroom", qualifier: null, label: "Bedroom" }];

      const result = detectSameTypeCollision(room, groups);

      expect(result).toBeNull();
    });

    it("should treat null vs undefined qualifier as equal", () => {
      const room = { roomKey: "bedroom", qualifier: null, matchedExisting: false };
      const groups = [{ roomKey: "bedroom", qualifier: undefined as any, label: "Bedroom" }];

      const result = detectSameTypeCollision(room, groups);

      expect(result).toBe("Bedroom");
    });
  });

  describe("isSameRoomReply", () => {
    it("should match: same room", () => {
      expect(isSameRoomReply("same room")).toBe(true);
    });

    it("should match: It's the same room", () => {
      expect(isSameRoomReply("It's the same room")).toBe(true);
    });

    it("should match: this is the same bedroom", () => {
      expect(isSameRoomReply("this is the same bedroom")).toBe(true);
    });

    it("should match: same room, different angle", () => {
      expect(isSameRoomReply("same room, different angle")).toBe(true);
    });

    it("should match: yes same room", () => {
      expect(isSameRoomReply("yes same room")).toBe(true);
    });

    it("should match: same as before", () => {
      expect(isSameRoomReply("same as before")).toBe(true);
    });

    it("should match: same room as before", () => {
      expect(isSameRoomReply("same room as before")).toBe(true);
    });

    it("should match: that's the same kitchen", () => {
      expect(isSameRoomReply("that's the same kitchen")).toBe(true);
    });

    it("should match: same room please", () => {
      expect(isSameRoomReply("same room please")).toBe(true);
    });

    it("should match: SAME ROOM!!", () => {
      expect(isSameRoomReply("SAME ROOM!!")).toBe(true);
    });

    it("should NOT match: same", () => {
      expect(isSameRoomReply("same")).toBe(false);
    });

    it("should NOT match: same day", () => {
      expect(isSameRoomReply("same day")).toBe(false);
    });

    it("should NOT match: same city", () => {
      expect(isSameRoomReply("same city")).toBe(false);
    });

    it("should NOT match: the same price", () => {
      expect(isSameRoomReply("the same price")).toBe(false);
    });

    it("should NOT match: I want the same", () => {
      expect(isSameRoomReply("I want the same")).toBe(false);
    });

    it("should NOT match: not the same room", () => {
      expect(isSameRoomReply("not the same room")).toBe(false);
    });

    it("should NOT match: is it the same room", () => {
      expect(isSameRoomReply("is it the same room")).toBe(false);
    });

    it("should NOT match: different room", () => {
      expect(isSameRoomReply("different room")).toBe(false);
    });

    it("should NOT match: empty string", () => {
      expect(isSameRoomReply("")).toBe(false);
    });

    it("should NOT match: 200 character string", () => {
      expect(isSameRoomReply("a".repeat(200))).toBe(false);
    });

    it("should NOT match: no same room", () => {
      expect(isSameRoomReply("no same room")).toBe(false);
    });
  });
});

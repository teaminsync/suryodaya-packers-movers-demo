/**
 * Tests for quote-build.ts (pure logic, no DB)
 */

import { buildMoveQuoteFromRows, type QuoteCaptureRow } from "../quote-build.js";

describe("quote-build", () => {
  describe("buildMoveQuoteFromRows", () => {
    it("should return hasCaptures false for empty array", () => {
      const result = buildMoveQuoteFromRows([]);
      expect(result.hasCaptures).toBe(false);
      expect(result.roomCount).toBe(0);
      expect(result.captureCount).toBe(0);
      expect(result.message).toContain("haven't sent any room photos");
    });

    it("should group two captures with same room_key and qualifier null", () => {
      const captures: QuoteCaptureRow[] = [
        {
          suggested_room_label: "Bedroom",
          room_key: "bedroom",
          room_qualifier: null,
          items: JSON.stringify([{ name: "bed", quantity: 1, alreadyCounted: false }]),
          total_estimated_cubic_feet: 50,
          total_estimated_weight_kg: 80,
        },
        {
          suggested_room_label: "Bedroom",
          room_key: "bedroom",
          room_qualifier: null,
          items: JSON.stringify([{ name: "chair", quantity: 2, alreadyCounted: false }]),
          total_estimated_cubic_feet: 10,
          total_estimated_weight_kg: 15,
        },
      ];

      const result = buildMoveQuoteFromRows(captures);
      expect(result.hasCaptures).toBe(true);
      expect(result.roomCount).toBe(1);
      expect(result.captureCount).toBe(2);
      expect(result.message).toContain("*Bedroom* (2 captures)");
      expect(result.message).toContain("• bed (1)");
      expect(result.message).toContain("• chair (2)");
      expect(result.totalEstimatedCubicFeet).toBe(60);
      expect(result.totalEstimatedWeightKg).toBe(95);
    });

    it("should separate bedroom with qualifier null vs qualifier master", () => {
      const captures: QuoteCaptureRow[] = [
        {
          suggested_room_label: "Bedroom",
          room_key: "bedroom",
          room_qualifier: null,
          items: JSON.stringify([{ name: "bed", quantity: 1, alreadyCounted: false }]),
          total_estimated_cubic_feet: 50,
          total_estimated_weight_kg: 80,
        },
        {
          suggested_room_label: "Master Bedroom",
          room_key: "bedroom",
          room_qualifier: "master",
          items: JSON.stringify([{ name: "bed", quantity: 1, alreadyCounted: false }]),
          total_estimated_cubic_feet: 60,
          total_estimated_weight_kg: 100,
        },
      ];

      const result = buildMoveQuoteFromRows(captures);
      expect(result.roomCount).toBe(2);
      expect(result.message).toContain("*Bedroom* (1 capture)");
      expect(result.message).toContain("*Master Bedroom* (1 capture)");
    });

    it("should omit alreadyCounted items from item lines", () => {
      const captures: QuoteCaptureRow[] = [{
        suggested_room_label: "Bedroom",
        room_key: "bedroom",
        room_qualifier: null,
        items: JSON.stringify([
          { name: "bed", quantity: 1, alreadyCounted: true },
          { name: "chair", quantity: 2, alreadyCounted: false },
        ]),
        total_estimated_cubic_feet: 10,
        total_estimated_weight_kg: 15,
      }];

      const result = buildMoveQuoteFromRows(captures);
      expect(result.message).toContain("• chair (2)");
      expect(result.message).not.toContain("• bed");
      expect(result.totalEstimatedCubicFeet).toBe(10); // totals still count
    });

    it("should group legacy rows by normalized label", () => {
      const captures: QuoteCaptureRow[] = [
        {
          suggested_room_label: "living_room",
          room_key: null,
          room_qualifier: null,
          items: JSON.stringify([{ name: "sofa", quantity: 1, alreadyCounted: false }]),
          total_estimated_cubic_feet: 40,
          total_estimated_weight_kg: 60,
        },
        {
          suggested_room_label: "Living Room",
          room_key: null,
          room_qualifier: null,
          items: JSON.stringify([{ name: "tv", quantity: 1, alreadyCounted: false }]),
          total_estimated_cubic_feet: 10,
          total_estimated_weight_kg: 15,
        },
      ];

      const result = buildMoveQuoteFromRows(captures);
      expect(result.roomCount).toBe(1); // grouped
      expect(result.message).toContain("*Living Room* (2 captures)");
    });

    it("should handle bad items JSON without crash", () => {
      const captures: QuoteCaptureRow[] = [{
        suggested_room_label: "Bedroom",
        room_key: "bedroom",
        room_qualifier: null,
        items: "{bad json",
        total_estimated_cubic_feet: 50,
        total_estimated_weight_kg: 80,
      }];

      const result = buildMoveQuoteFromRows(captures);
      expect(result.hasCaptures).toBe(true);
      expect(result.totalEstimatedCubicFeet).toBe(50); // totals still count
      expect(result.message).not.toContain("•"); // no items shown
    });

    it("should include all expected message parts", () => {
      const captures: QuoteCaptureRow[] = [{
        suggested_room_label: "Bedroom",
        room_key: "bedroom",
        room_qualifier: null,
        items: JSON.stringify([{ name: "bed", quantity: 1, alreadyCounted: false }]),
        total_estimated_cubic_feet: 50,
        total_estimated_weight_kg: 80,
      }];

      const result = buildMoveQuoteFromRows(captures);
      expect(result.message).toContain("📋 *Your Move Estimate (Provisional)*");
      expect(result.message).toContain("📦 *Total:");
      expect(result.message).toContain("📸 Based on 1 photo/video capture across 1 room");
      expect(result.message).toContain("Book a Survey");
    });
  });
});

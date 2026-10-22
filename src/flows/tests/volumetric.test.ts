/**
 * Tests for volumetric.ts
 */

import { analyzeMediaCapture, buildCaptureReply } from "../volumetric.js";
import { aiRouter } from "../../ai/router.js";
import type { InventoryGroup } from "../rooms.js";

describe("volumetric", () => {
  describe("analyzeMediaCapture", () => {
    it("should include inventory context in prompt when provided", async () => {
      const inventory: InventoryGroup[] = [{
        roomKey: "bedroom",
        qualifier: null,
        label: "Bedroom",
        items: [{ name: "bed", quantity: 1 }, { name: "wardrobe", quantity: 2 }],
      }];

      let capturedPrompt = "";
      const originalCall = (aiRouter as any).call;
      try {
        (aiRouter as any).call = async (req: any) => {
          capturedPrompt = req.userPrompt;
          return {
            data: {
              assetType: "room_overview",
              roomKey: "bedroom",
              sameRoomAs: null,
              items: [{ name: "chair", quantity: 1, estimatedCubicFeet: 5, estimatedWeightKg: 10, fragile: false, alreadyCounted: false }],
              packingComplexity: "simple",
              specialHandlingNotes: [],
              confidence: "high",
            },
            providerUsed: "mock",
            wasFailover: false,
          };
        };

        await analyzeMediaCapture(
          { type: "image", mimeType: "image/jpeg", base64Data: "test" },
          inventory
        );

        expect(capturedPrompt).toContain("ITEMS ALREADY COUNTED FOR THIS MOVE");
        expect(capturedPrompt).toContain("- Bedroom: bed (1), wardrobe (2)");
      } finally {
        (aiRouter as any).call = originalCall;
      }
    });

    it("should not include inventory context when not provided", async () => {
      let capturedPrompt = "";
      const originalCall = (aiRouter as any).call;
      try {
        (aiRouter as any).call = async (req: any) => {
          capturedPrompt = req.userPrompt;
          return {
            data: {
              assetType: "room_overview",
              roomKey: "bedroom",
              sameRoomAs: null,
              items: [{ name: "chair", quantity: 1, estimatedCubicFeet: 5, estimatedWeightKg: 10, fragile: false, alreadyCounted: false }],
              packingComplexity: "simple",
              specialHandlingNotes: [],
              confidence: "high",
            },
            providerUsed: "mock",
            wasFailover: false,
          };
        };

        await analyzeMediaCapture({ type: "image", mimeType: "image/jpeg", base64Data: "test" });

        expect(capturedPrompt).not.toContain("ITEMS ALREADY COUNTED FOR THIS MOVE");
      } finally {
        (aiRouter as any).call = originalCall;
      }
    });

    it("should count alreadyCounted items when matched existing", async () => {
      const inventory: InventoryGroup[] = [{
        roomKey: "bedroom",
        qualifier: null,
        label: "Bedroom",
        items: [{ name: "bed", quantity: 1 }],
      }];

      const originalCall = (aiRouter as any).call;
      try {
        (aiRouter as any).call = async () => ({
          data: {
            assetType: "room_overview",
            roomKey: "bedroom",
            sameRoomAs: "Bedroom",
            items: [
              { name: "bed", quantity: 1, estimatedCubicFeet: 50, estimatedWeightKg: 80, fragile: false, alreadyCounted: true },
              { name: "chair", quantity: 2, estimatedCubicFeet: 10, estimatedWeightKg: 15, fragile: false, alreadyCounted: false },
            ],
            packingComplexity: "simple",
            specialHandlingNotes: [],
            confidence: "high",
          },
          providerUsed: "mock",
          wasFailover: false,
        });

        const result = await analyzeMediaCapture(
          { type: "image", mimeType: "image/jpeg", base64Data: "test" },
          inventory
        );

        expect(result.room.matchedExisting).toBe(true);
        expect(result.totals.cubicFeet).toBe(10); // only chair
        expect(result.totals.weightKg).toBe(15); // only chair
        expect(result.totals.newItemCount).toBe(1);
        expect(result.totals.duplicateItemCount).toBe(1);
      } finally {
        (aiRouter as any).call = originalCall;
      }
    });

    it("should force alreadyCounted false when sameRoomAs null but AI marked true", async () => {
      const originalCall = (aiRouter as any).call;
      try {
        (aiRouter as any).call = async () => ({
          data: {
            assetType: "room_overview",
            roomKey: "bedroom",
            sameRoomAs: null,
            items: [
              { name: "bed", quantity: 1, estimatedCubicFeet: 50, estimatedWeightKg: 80, fragile: false, alreadyCounted: true },
            ],
            packingComplexity: "simple",
            specialHandlingNotes: [],
            confidence: "high",
          },
          providerUsed: "mock",
          wasFailover: false,
        });

        const result = await analyzeMediaCapture({ type: "image", mimeType: "image/jpeg", base64Data: "test" });

        expect(result.room.matchedExisting).toBe(false);
        expect(result.data.items[0].alreadyCounted).toBe(false); // forced by safety rule
        expect(result.totals.cubicFeet).toBe(50); // counted
        expect(result.totals.newItemCount).toBe(1);
        expect(result.totals.duplicateItemCount).toBe(0);
      } finally {
        (aiRouter as any).call = originalCall;
      }
    });

    it("should have system prompt with ROOM IDENTIFICATION section", async () => {
      let capturedSystemPrompt = "";
      const originalCall = (aiRouter as any).call;
      try {
        (aiRouter as any).call = async (req: any) => {
          capturedSystemPrompt = req.systemPrompt;
          return {
            data: {
              assetType: "room_overview",
              roomKey: "bedroom",
              sameRoomAs: null,
              items: [],
              packingComplexity: "simple",
              specialHandlingNotes: [],
              confidence: "high",
            },
            providerUsed: "mock",
            wasFailover: false,
          };
        };

        await analyzeMediaCapture({ type: "image", mimeType: "image/jpeg", base64Data: "test" });

        expect(capturedSystemPrompt).toContain("ROOM IDENTIFICATION AND DUPLICATES");
        expect(capturedSystemPrompt).not.toContain("Room label inference");
      } finally {
        (aiRouter as any).call = originalCall;
      }
    });

    it("should normalize sameRoomAs :null: with alreadyCounted true and no inventory", async () => {
      const originalCall = (aiRouter as any).call;
      try {
        (aiRouter as any).call = async () => ({
          data: {
            assetType: "room_overview",
            roomKey: "bedroom",
            sameRoomAs: ":null:",
            items: [
              { name: "bed", quantity: 1, estimatedCubicFeet: 50, estimatedWeightKg: 80, fragile: false, alreadyCounted: true },
            ],
            packingComplexity: "simple",
            specialHandlingNotes: [],
            confidence: "high",
          },
          providerUsed: "mock",
          wasFailover: false,
        });

        const result = await analyzeMediaCapture({ type: "image", mimeType: "image/jpeg", base64Data: "test" });

        expect(result.data.sameRoomAs).toBe(null);
        expect(result.room.matchedExisting).toBe(false);
        expect(result.data.items[0].alreadyCounted).toBe(false); // forced by safety rule
        expect(result.totals.cubicFeet).toBe(50); // counted
        expect(result.totals.newItemCount).toBe(1);
        expect(result.totals.duplicateItemCount).toBe(0);
      } finally {
        (aiRouter as any).call = originalCall;
      }
    });
  });

  describe("buildCaptureReply", () => {
    it("should show new-items form with correct format", () => {
      const reply = buildCaptureReply({
        roomLabel: "Bedroom",
        items: [
          { name: "bed", quantity: 1, alreadyCounted: false },
          { name: "chair", quantity: 2, alreadyCounted: false },
        ],
        addedCubicFeet: 25.5,
        addedWeightKg: 40.2,
      });

      expect(reply).toContain("Got it! For your Bedroom, I can see:");
      expect(reply).toContain("• bed (1)");
      expect(reply).toContain("• chair (2)");
      expect(reply).toContain("Added ~25.5 cu ft, ~40.2 kg to your move total");
      expect(reply).toContain('tap "Get My Move Total"');
      expect(reply).toContain('If I\'ve filed this under the wrong room, just tell me, for example "this is the master bedroom".');
    });

    it("should cap item list at 5 items", () => {
      const items = Array.from({ length: 8 }, (_, i) => ({
        name: `item${i}`,
        quantity: 1,
        alreadyCounted: false,
      }));
      const reply = buildCaptureReply({
        roomLabel: "Bedroom",
        items,
        addedCubicFeet: 50,
        addedWeightKg: 80,
      });

      expect(reply).toContain("• item0 (1)");
      expect(reply).toContain("• item4 (1)");
      expect(reply).not.toContain("• item5 (1)");
      expect(reply).toContain("...and 3 more items");
    });

    it("should include dupNote when duplicates exist", () => {
      const reply = buildCaptureReply({
        roomLabel: "Bedroom",
        items: [
          { name: "bed", quantity: 1, alreadyCounted: true },
          { name: "chair", quantity: 2, alreadyCounted: false },
        ],
        addedCubicFeet: 10,
        addedWeightKg: 15,
      });

      expect(reply).toContain("(I'd already counted 1 item(s) from your earlier photos");
    });

    it("should not include dupNote when no duplicates", () => {
      const reply = buildCaptureReply({
        roomLabel: "Bedroom",
        items: [{ name: "chair", quantity: 2, alreadyCounted: false }],
        addedCubicFeet: 10,
        addedWeightKg: 15,
      });

      expect(reply).not.toContain("already counted");
    });

    it("should show no-new-items form when all items alreadyCounted", () => {
      const reply = buildCaptureReply({
        roomLabel: "Bedroom",
        items: [
          { name: "bed", quantity: 1, alreadyCounted: true },
          { name: "chair", quantity: 2, alreadyCounted: true },
        ],
        addedCubicFeet: 0,
        addedWeightKg: 0,
      });

      expect(reply).toContain("That looks like the same items I've already counted for your Bedroom");
      expect(reply).toContain("so your move total hasn't changed");
      expect(reply).not.toContain("Added ~");
      expect(reply).toContain('If this is actually a different room, just tell me, for example "this is the master bedroom".');
    });
  });
});

/**
 * Tests for room-correction.ts
 */

import { parseRoomCorrection, planRoomCorrection, buildRoomCorrectionReply, type LatestCapture } from "../room-correction.js";

describe("room-correction", () => {
  describe("parseRoomCorrection", () => {
    // MUST MATCH cases
    it("should parse 'this is the master bedroom'", () => {
      const result = parseRoomCorrection("this is the master bedroom");
      expect(result).toEqual({ roomKey: "bedroom", qualifier: "master" });
    });

    it("should parse 'This is the Kitchen.'", () => {
      const result = parseRoomCorrection("This is the Kitchen.");
      expect(result).toEqual({ roomKey: "kitchen", qualifier: null });
    });

    it("should parse 'that's the living room'", () => {
      const result = parseRoomCorrection("that's the living room");
      expect(result).toEqual({ roomKey: "living_room", qualifier: null });
    });

    it("should parse 'it's the kids room'", () => {
      const result = parseRoomCorrection("it's the kids room");
      expect(result).toEqual({ roomKey: "bedroom", qualifier: "kids" });
    });

    it("should parse 'Sorry, this is actually the kitchen'", () => {
      const result = parseRoomCorrection("Sorry, this is actually the kitchen");
      expect(result).toEqual({ roomKey: "kitchen", qualifier: null });
    });

    it("should parse 'no, that is my study'", () => {
      const result = parseRoomCorrection("no, that is my study");
      expect(result).toEqual({ roomKey: "study_office", qualifier: null });
    });

    it("should parse 'this photo is of the balcony'", () => {
      const result = parseRoomCorrection("this photo is of the balcony");
      expect(result).toEqual({ roomKey: "balcony", qualifier: null });
    });

    it("should parse 'move this to the dining area'", () => {
      const result = parseRoomCorrection("move this to the dining area");
      expect(result).toEqual({ roomKey: "dining", qualifier: null });
    });

    it("should parse 'change it to guest bedroom'", () => {
      const result = parseRoomCorrection("change it to guest bedroom");
      expect(result).toEqual({ roomKey: "bedroom", qualifier: "guest" });
    });

    it("should parse 'put this under storeroom'", () => {
      const result = parseRoomCorrection("put this under storeroom");
      expect(result).toEqual({ roomKey: "storeroom", qualifier: null });
    });

    it("should parse 'it's in the bathroom'", () => {
      const result = parseRoomCorrection("it's in the bathroom");
      expect(result).toEqual({ roomKey: "bathroom", qualifier: null });
    });

    it("should parse 'the last photo is the second bedroom'", () => {
      const result = parseRoomCorrection("the last photo is the second bedroom");
      expect(result).toEqual({ roomKey: "bedroom", qualifier: "second" });
    });

    it("should parse 'this is the spare room'", () => {
      const result = parseRoomCorrection("this is the spare room");
      expect(result).toEqual({ roomKey: "bedroom", qualifier: "spare" });
    });

    it("should parse 'this is my kid's room'", () => {
      const result = parseRoomCorrection("this is my kid's room");
      expect(result).toEqual({ roomKey: "bedroom", qualifier: "kid" });
    });

    it("should parse 'can you move this to the kitchen please'", () => {
      const result = parseRoomCorrection("can you move this to the kitchen please");
      expect(result).toEqual({ roomKey: "kitchen", qualifier: null });
    });

    it("should parse 'THIS IS THE HALL!!'", () => {
      const result = parseRoomCorrection("THIS IS THE HALL!!");
      expect(result).toEqual({ roomKey: "living_room", qualifier: null });
    });

    // MUST RETURN null cases
    it("should return null for 'this is a 2BHK'", () => {
      expect(parseRoomCorrection("this is a 2BHK")).toBeNull();
    });

    it("should return null for 'my bedroom is on the third floor'", () => {
      expect(parseRoomCorrection("my bedroom is on the third floor")).toBeNull();
    });

    it("should return null for 'kitchen'", () => {
      expect(parseRoomCorrection("kitchen")).toBeNull();
    });

    it("should return null for 'yes'", () => {
      expect(parseRoomCorrection("yes")).toBeNull();
    });

    it("should return null for 'it is urgent'", () => {
      expect(parseRoomCorrection("it is urgent")).toBeNull();
    });

    it("should return null for 'this is the kitchen of a 3bhk flat in pune'", () => {
      expect(parseRoomCorrection("this is the kitchen of a 3bhk flat in pune")).toBeNull();
    });

    it("should return null for 'that is great, thanks'", () => {
      expect(parseRoomCorrection("that is great, thanks")).toBeNull();
    });

    it("should return null for 'move it to Mumbai'", () => {
      expect(parseRoomCorrection("move it to Mumbai")).toBeNull();
    });

    it("should return null for 'it is a room'", () => {
      expect(parseRoomCorrection("it is a room")).toBeNull();
    });

    it("should return null for 'this is the room'", () => {
      expect(parseRoomCorrection("this is the room")).toBeNull();
    });

    it("should return null for 'the sofa is in the bedroom'", () => {
      expect(parseRoomCorrection("the sofa is in the bedroom")).toBeNull();
    });

    it("should return null for 'this is the red sofa'", () => {
      expect(parseRoomCorrection("this is the red sofa")).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(parseRoomCorrection("")).toBeNull();
    });

    it("should return null for whitespace only", () => {
      expect(parseRoomCorrection("   ")).toBeNull();
    });

    it("should return null for 200 character string", () => {
      const longString = "a".repeat(200);
      expect(parseRoomCorrection(longString)).toBeNull();
    });

    // Never throws test
    it("should never throw for valid inputs", () => {
      const inputs = [
        "this is the master bedroom",
        "This is the Kitchen.",
        "this is a 2BHK",
        "",
        "   ",
        "a".repeat(200),
        "\n\n",
      ];

      for (const input of inputs) {
        expect(() => parseRoomCorrection(input)).not.toThrow();
      }
    });
  });

  describe("planRoomCorrection", () => {
    const now = new Date("2026-10-21T10:00:00.000Z");

    it("should return none when no latest capture", () => {
      const plan = planRoomCorrection({
        text: "this is the kitchen",
        latest: undefined,
        now,
      });
      expect(plan).toEqual({ kind: "none" });
    });

    it("should return none for non-matching text", () => {
      const latest: LatestCapture = {
        id: "cap-1",
        room_key: "bedroom",
        room_qualifier: null,
        suggested_room_label: "Bedroom",
        items: JSON.stringify([{ name: "bed", quantity: 1, alreadyCounted: false }]),
        created_at: new Date("2026-10-21T09:50:00.000Z"),
      };

      const plan = planRoomCorrection({
        text: "yes",
        latest,
        now,
      });
      expect(plan).toEqual({ kind: "none" });
    });

    it("should return none when capture is 20 minutes old", () => {
      const latest: LatestCapture = {
        id: "cap-1",
        room_key: "bedroom",
        room_qualifier: null,
        suggested_room_label: "Bedroom",
        items: JSON.stringify([{ name: "bed", quantity: 1, alreadyCounted: false }]),
        created_at: new Date("2026-10-21T09:40:00.000Z"),
      };

      const plan = planRoomCorrection({
        text: "this is the kitchen",
        latest,
        now,
      });
      expect(plan).toEqual({ kind: "none" });
    });

    it("should return relabel when capture is exactly 15 minutes old", () => {
      const latest: LatestCapture = {
        id: "cap-1",
        room_key: "bedroom",
        room_qualifier: null,
        suggested_room_label: "Bedroom",
        items: JSON.stringify([{ name: "bed", quantity: 1, alreadyCounted: false }]),
        created_at: new Date("2026-10-21T09:45:00.000Z"),
      };

      const plan = planRoomCorrection({
        text: "this is the kitchen",
        latest,
        now,
      });
      expect(plan.kind).toBe("relabel");
    });

    it("should return none for invalid created_at", () => {
      const latest: LatestCapture = {
        id: "cap-1",
        room_key: "bedroom",
        room_qualifier: null,
        suggested_room_label: "Bedroom",
        items: JSON.stringify([{ name: "bed", quantity: 1, alreadyCounted: false }]),
        created_at: "invalid-date",
      };

      const plan = planRoomCorrection({
        text: "this is the kitchen",
        latest,
        now,
      });
      expect(plan).toEqual({ kind: "none" });
    });

    it("should return unchanged when same room group", () => {
      const latest: LatestCapture = {
        id: "cap-1",
        room_key: "bedroom",
        room_qualifier: null,
        suggested_room_label: "Bedroom",
        items: JSON.stringify([{ name: "bed", quantity: 1, alreadyCounted: false }]),
        created_at: new Date("2026-10-21T09:50:00.000Z"),
      };

      const plan = planRoomCorrection({
        text: "this is the bedroom",
        latest,
        now,
      });
      expect(plan).toEqual({ kind: "unchanged", label: "Bedroom" });
    });

    it("should return relabel with resetDuplicates false when no alreadyCounted items", () => {
      const latest: LatestCapture = {
        id: "cap-1",
        room_key: "bedroom",
        room_qualifier: null,
        suggested_room_label: "Bedroom",
        items: JSON.stringify([
          { name: "bed", quantity: 1, alreadyCounted: false, estimatedCubicFeet: 50, estimatedWeightKg: 80 },
        ]),
        created_at: new Date("2026-10-21T09:50:00.000Z"),
      };

      const plan = planRoomCorrection({
        text: "this is the kitchen",
        latest,
        now,
      });
      expect(plan).toEqual({
        kind: "relabel",
        captureId: "cap-1",
        roomKey: "kitchen",
        qualifier: null,
        label: "Kitchen",
        resetDuplicates: false,
        itemsJson: null,
        cubicFeet: null,
        weightKg: null,
      });
    });

    it("should return relabel with resetDuplicates true when items include alreadyCounted", () => {
      const latest: LatestCapture = {
        id: "cap-1",
        room_key: "bedroom",
        room_qualifier: null,
        suggested_room_label: "Bedroom",
        items: JSON.stringify([
          { name: "bed", quantity: 1, alreadyCounted: true, estimatedCubicFeet: 45, estimatedWeightKg: 60 },
        ]),
        created_at: new Date("2026-10-21T09:50:00.000Z"),
      };

      const plan = planRoomCorrection({
        text: "this is the kitchen",
        latest,
        now,
      });
      expect(plan.kind).toBe("relabel");
      if (plan.kind === "relabel") {
        expect(plan.resetDuplicates).toBe(true);
        expect(plan.cubicFeet).toBe(45);
        expect(plan.weightKg).toBe(60);
        
        const parsedItems = JSON.parse(plan.itemsJson!);
        expect(parsedItems[0].alreadyCounted).toBe(false);
      }
    });

    it("should return relabel with nulls when items JSON is invalid", () => {
      const latest: LatestCapture = {
        id: "cap-1",
        room_key: "bedroom",
        room_qualifier: null,
        suggested_room_label: "Bedroom",
        items: "not-valid-json",
        created_at: new Date("2026-10-21T09:50:00.000Z"),
      };

      const plan = planRoomCorrection({
        text: "this is the kitchen",
        latest,
        now,
      });
      expect(plan).toEqual({
        kind: "relabel",
        captureId: "cap-1",
        roomKey: "kitchen",
        qualifier: null,
        label: "Kitchen",
        resetDuplicates: false,
        itemsJson: null,
        cubicFeet: null,
        weightKg: null,
      });
    });

    it("should return relabel when legacy row (room_key null)", () => {
      const latest: LatestCapture = {
        id: "cap-1",
        room_key: null,
        room_qualifier: null,
        suggested_room_label: "Bedroom",
        items: JSON.stringify([{ name: "bed", quantity: 1, alreadyCounted: false }]),
        created_at: new Date("2026-10-21T09:50:00.000Z"),
      };

      const plan = planRoomCorrection({
        text: "this is the kitchen",
        latest,
        now,
      });
      expect(plan.kind).toBe("relabel");
    });
  });

  describe("buildRoomCorrectionReply", () => {
    it("should return null for none plan", () => {
      const reply = buildRoomCorrectionReply({ kind: "none" });
      expect(reply).toBeNull();
    });

    it("should return exact unchanged message", () => {
      const reply = buildRoomCorrectionReply({ kind: "unchanged", label: "Master Bedroom" });
      expect(reply).toBe("That photo is already filed under Master Bedroom.");
    });

    it("should return exact relabel message without reset", () => {
      const reply = buildRoomCorrectionReply({
        kind: "relabel",
        captureId: "cap-1",
        roomKey: "kitchen",
        qualifier: null,
        label: "Kitchen",
        resetDuplicates: false,
        itemsJson: null,
        cubicFeet: null,
        weightKg: null,
      });
      expect(reply).toBe('Done, I\'ve filed your latest photo under Kitchen. Tap "Get My Move Total" to see the updated estimate.');
    });

    it("should return exact relabel message with reset", () => {
      const reply = buildRoomCorrectionReply({
        kind: "relabel",
        captureId: "cap-1",
        roomKey: "kitchen",
        qualifier: null,
        label: "Kitchen",
        resetDuplicates: true,
        itemsJson: JSON.stringify([{ name: "bed", alreadyCounted: false }]),
        cubicFeet: 50,
        weightKg: 80,
      });
      expect(reply).toBe('Done, I\'ve filed your latest photo under Kitchen. Its items now count toward your move total. Tap "Get My Move Total" to see the updated estimate.');
    });
  });
});

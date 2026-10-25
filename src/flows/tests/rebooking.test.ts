/**
 * Tests for rebooking logic
 */

import { describe, it, expect } from "@jest/globals";
import {
  planCancelPrevious,
  shouldHandleSlotReply,
  statusWhenOfferingSlots,
} from "../rebooking.js";

describe("planCancelPrevious", () => {
  it("returns none when previous is undefined", () => {
    const result = planCancelPrevious(undefined);
    expect(result).toEqual({ kind: "none" });
  });

  it("returns none when calendar_event_id is null", () => {
    const result = planCancelPrevious({ id: "offer-1", calendar_event_id: null });
    expect(result).toEqual({ kind: "none" });
  });

  it("returns none when calendar_event_id is empty string", () => {
    const result = planCancelPrevious({ id: "offer-1", calendar_event_id: "" });
    expect(result).toEqual({ kind: "none" });
  });

  it("returns none when calendar_event_id is whitespace only", () => {
    const result = planCancelPrevious({ id: "offer-1", calendar_event_id: "   " });
    expect(result).toEqual({ kind: "none" });
  });

  it("returns cancel with trimmed eventId when present", () => {
    const result = planCancelPrevious({ id: "offer-1", calendar_event_id: "  event-123  " });
    expect(result).toEqual({
      kind: "cancel",
      offerId: "offer-1",
      eventId: "event-123",
    });
  });
});

describe("shouldHandleSlotReply", () => {
  const now = new Date("2026-10-20T12:00:00.000Z");

  it("returns false when openOffer is undefined", () => {
    const result = shouldHandleSlotReply({
      status: "booking_offered",
      openOffer: undefined,
      now,
    });
    expect(result).toBe(false);
  });

  it("returns true for status booking_offered regardless of age", () => {
    const result1 = shouldHandleSlotReply({
      status: "booking_offered",
      openOffer: { offered_at: new Date(now.getTime() - 2000 * 60000) },
      now,
    });
    expect(result1).toBe(true);

    const result2 = shouldHandleSlotReply({
      status: "booking_offered",
      openOffer: { offered_at: "2026-10-20T10:00:00.000Z" },
      now,
    });
    expect(result2).toBe(true);
  });

  it("returns false for status new", () => {
    const result = shouldHandleSlotReply({
      status: "new",
      openOffer: { offered_at: new Date(now.getTime() - 100 * 60000) },
      now,
    });
    expect(result).toBe(false);
  });

  it("returns false for status gathering", () => {
    const result = shouldHandleSlotReply({
      status: "gathering",
      openOffer: { offered_at: new Date(now.getTime() - 100 * 60000) },
      now,
    });
    expect(result).toBe(false);
  });

  it("returns false for status booked with invalid date", () => {
    const result = shouldHandleSlotReply({
      status: "booked",
      openOffer: { offered_at: "invalid-date" },
      now,
    });
    expect(result).toBe(false);
  });

  it("returns true for status booked with offer exactly 1440 minutes old", () => {
    const result = shouldHandleSlotReply({
      status: "booked",
      openOffer: { offered_at: new Date(now.getTime() - 1440 * 60000) },
      now,
    });
    expect(result).toBe(true);
  });

  it("returns false for status booked with offer 1441 minutes old", () => {
    const result = shouldHandleSlotReply({
      status: "booked",
      openOffer: { offered_at: new Date(now.getTime() - 1441 * 60000) },
      now,
    });
    expect(result).toBe(false);
  });

  it("returns true for status booked with offer in future by 30 seconds", () => {
    const result = shouldHandleSlotReply({
      status: "booked",
      openOffer: { offered_at: new Date(now.getTime() + 30000) },
      now,
    });
    expect(result).toBe(true);
  });

  it("returns false for status booked with offer in future by 120 seconds", () => {
    const result = shouldHandleSlotReply({
      status: "booked",
      openOffer: { offered_at: new Date(now.getTime() + 120000) },
      now,
    });
    expect(result).toBe(false);
  });

  it("works with Date object for offered_at", () => {
    const result = shouldHandleSlotReply({
      status: "booked",
      openOffer: { offered_at: new Date(now.getTime() - 100 * 60000) },
      now,
    });
    expect(result).toBe(true);
  });

  it("works with ISO string for offered_at", () => {
    const result = shouldHandleSlotReply({
      status: "booked",
      openOffer: { offered_at: "2026-10-20T10:20:00.000Z" },
      now,
    });
    expect(result).toBe(true);
  });

  it("respects custom maxAgeMinutes", () => {
    const result1 = shouldHandleSlotReply({
      status: "booked",
      openOffer: { offered_at: new Date(now.getTime() - 60 * 60000) },
      now,
      maxAgeMinutes: 60,
    });
    expect(result1).toBe(true);

    const result2 = shouldHandleSlotReply({
      status: "booked",
      openOffer: { offered_at: new Date(now.getTime() - 61 * 60000) },
      now,
      maxAgeMinutes: 60,
    });
    expect(result2).toBe(false);
  });
});

describe("statusWhenOfferingSlots", () => {
  it("returns booked when currentStatus is booked", () => {
    const result = statusWhenOfferingSlots("booked");
    expect(result).toBe("booked");
  });

  it("returns booking_offered for status new", () => {
    const result = statusWhenOfferingSlots("new");
    expect(result).toBe("booking_offered");
  });

  it("returns booking_offered for status gathering", () => {
    const result = statusWhenOfferingSlots("gathering");
    expect(result).toBe("booking_offered");
  });

  it("returns booking_offered for status booking_offered", () => {
    const result = statusWhenOfferingSlots("booking_offered");
    expect(result).toBe("booking_offered");
  });
});

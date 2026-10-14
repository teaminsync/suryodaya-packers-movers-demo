/**
 * Tests for slot offer policy
 */

import { describe, it, expect } from "@jest/globals";
import { shouldOfferSurveySlots, SLOT_REOFFER_AFTER_MINUTES } from "../slot-offer-policy.js";

const now = new Date("2026-10-14T12:00:00.000Z");

function slotsJson(...minutesFromNow: number[]): string {
  return JSON.stringify(
    minutesFromNow.map((m) => ({
      label: "s",
      datetime: new Date(now.getTime() + m * 60000).toISOString(),
    }))
  );
}

describe("shouldOfferSurveySlots", () => {
  it("returns true for status gathering with fresh offer, and true for status new with no offer", () => {
    const result1 = shouldOfferSurveySlots({
      status: "gathering",
      openOffer: {
        offered_at: new Date(now.getTime() - 5 * 60000).toISOString(),
        slot_options: slotsJson(60, 1440),
      },
      now,
    });
    expect(result1).toBe(true);

    const result2 = shouldOfferSurveySlots({
      status: "new",
      openOffer: undefined,
      now,
    });
    expect(result2).toBe(true);
  });

  it("returns true for status booked with no offer", () => {
    const result = shouldOfferSurveySlots({
      status: "booked",
      openOffer: undefined,
      now,
    });
    expect(result).toBe(true);
  });

  it("returns true for status booking_offered with no offer", () => {
    const result = shouldOfferSurveySlots({
      status: "booking_offered",
      openOffer: undefined,
      now,
    });
    expect(result).toBe(true);
  });

  it("returns false for booking_offered with fresh offer 5 minutes ago and future slots", () => {
    const result = shouldOfferSurveySlots({
      status: "booking_offered",
      openOffer: {
        offered_at: new Date(now.getTime() - 5 * 60000),
        slot_options: slotsJson(60, 1440),
      },
      now,
    });
    expect(result).toBe(false);
  });

  it("returns true for booking_offered with stale offer 20 minutes ago", () => {
    const result = shouldOfferSurveySlots({
      status: "booking_offered",
      openOffer: {
        offered_at: new Date(now.getTime() - 20 * 60000).toISOString(),
        slot_options: slotsJson(60, 1440),
      },
      now,
    });
    expect(result).toBe(true);
  });

  it("returns true for fresh offer with past slot, and true for invalid JSON", () => {
    const result1 = shouldOfferSurveySlots({
      status: "booking_offered",
      openOffer: {
        offered_at: new Date(now.getTime() - 1 * 60000).toISOString(),
        slot_options: slotsJson(-10, 60),
      },
      now,
    });
    expect(result1).toBe(true);

    const result2 = shouldOfferSurveySlots({
      status: "booking_offered",
      openOffer: {
        offered_at: new Date(now.getTime() - 1 * 60000).toISOString(),
        slot_options: "not json",
      },
      now,
    });
    expect(result2).toBe(true);
  });
});

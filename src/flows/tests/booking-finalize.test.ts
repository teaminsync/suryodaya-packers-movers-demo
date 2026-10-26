/**
 * Tests for booking finalization
 */

import { describe, it, expect } from "@jest/globals";
import { finalizeConfirmedBooking, type FinalizeDeps } from "../booking-finalize.js";

type Call = { fn: string; args: unknown[] };

function makeDeps(overrides: Partial<FinalizeDeps> = {}): FinalizeDeps & { calls: Call[] } {
  const calls: Call[] = [];

  const defaults: FinalizeDeps = {
    async findPreviousConfirmedOffer() {
      calls.push({ fn: "findPreviousConfirmedOffer", args: Array.from(arguments) });
      return undefined;
    },
    async recordSlotSelection() {
      calls.push({ fn: "recordSlotSelection", args: Array.from(arguments) });
    },
    async recordSurveyCalendar() {
      calls.push({ fn: "recordSurveyCalendar", args: Array.from(arguments) });
    },
    async setBooked() {
      calls.push({ fn: "setBooked", args: Array.from(arguments) });
    },
    async sendConfirmation() {
      calls.push({ fn: "sendConfirmation", args: Array.from(arguments) });
    },
    notifyBooked() {
      calls.push({ fn: "notifyBooked", args: Array.from(arguments) });
    },
    async cancelEvent() {
      calls.push({ fn: "cancelEvent", args: Array.from(arguments) });
      return { ok: true, status: "cancelled" };
    },
    async markOfferCalendarCancelled() {
      calls.push({ fn: "markOfferCalendarCancelled", args: Array.from(arguments) });
    },
    warn() {
      calls.push({ fn: "warn", args: Array.from(arguments) });
    },
  };

  return { ...defaults, ...overrides, calls } as FinalizeDeps & { calls: Call[] };
}

describe("finalizeConfirmedBooking", () => {
  const now = new Date("2026-10-20T10:00:00.000Z");
  const claim = {
    status: "created",
    startsAt: now,
    endsAt: new Date(now.getTime() + 1800000),
    eventId: "evt1",
    eventLink: "https://calendar.example.com/evt1",
  };

  it("executes steps in exact order for a rebooking with previous offer", async () => {
    const deps = makeDeps({
      async findPreviousConfirmedOffer() {
        deps.calls.push({ fn: "findPreviousConfirmedOffer", args: Array.from(arguments) });
        return { id: "old-offer-1", calendar_event_id: "old-evt-1" };
      },
    });

    const result = await finalizeConfirmedBooking(deps, {
      leadId: "lead1",
      offerId: "offer1",
      slot: { label: "Mon at 10 AM" },
      message: "You're booked!",
      claim,
    });

    const fns = deps.calls.map((c) => c.fn);
    expect(fns).toEqual([
      "findPreviousConfirmedOffer",
      "recordSlotSelection",
      "recordSurveyCalendar",
      "setBooked",
      "sendConfirmation",
      "notifyBooked",
      "cancelEvent",
      "markOfferCalendarCancelled",
    ]);

    expect(deps.calls[0].args).toEqual(["lead1", "offer1"]);
    expect(deps.calls[1].args).toEqual(["offer1", "Mon at 10 AM"]);
    expect(deps.calls[5].args).toEqual(["Mon at 10 AM"]);
    expect(deps.calls[6].args).toEqual(["old-evt-1"]);
    expect(deps.calls[7].args).toEqual(["old-offer-1"]);

    expect(result.cancel).toBe("cancelled");
  });

  it("skips previous-offer lookup and cancel when first booking (no previous)", async () => {
    const deps = makeDeps();

    const result = await finalizeConfirmedBooking(deps, {
      leadId: "lead1",
      offerId: "offer1",
      slot: { label: "Mon at 10 AM" },
      message: "You're booked!",
      claim,
    });

    const fns = deps.calls.map((c) => c.fn);
    expect(fns).toEqual([
      "findPreviousConfirmedOffer",
      "recordSlotSelection",
      "recordSurveyCalendar",
      "setBooked",
      "sendConfirmation",
      "notifyBooked",
    ]);

    expect(result.cancel).toBe("none");
  });

  it('skips previous-offer lookup when claim status is "failed"', async () => {
    const deps = makeDeps();

    const result = await finalizeConfirmedBooking(deps, {
      leadId: "lead1",
      offerId: "offer1",
      slot: { label: "Mon at 10 AM" },
      message: "You're booked!",
      claim: { ...claim, status: "failed" },
    });

    expect(deps.calls.find((c) => c.fn === "findPreviousConfirmedOffer")).toBeUndefined();
    expect(deps.calls.find((c) => c.fn === "cancelEvent")).toBeUndefined();
    expect(result.cancel).toBe("none");
  });

  it('skips previous-offer lookup when claim status is "not_configured"', async () => {
    const deps = makeDeps();

    const result = await finalizeConfirmedBooking(deps, {
      leadId: "lead1",
      offerId: "offer1",
      slot: { label: "Mon at 10 AM" },
      message: "You're booked!",
      claim: { ...claim, status: "not_configured" },
    });

    expect(deps.calls.find((c) => c.fn === "findPreviousConfirmedOffer")).toBeUndefined();
    expect(deps.calls.find((c) => c.fn === "cancelEvent")).toBeUndefined();
    expect(result.cancel).toBe("none");
  });

  it("warns when lookup throws but booking still completes without cancel", async () => {
    const deps = makeDeps({
      async findPreviousConfirmedOffer() {
        deps.calls.push({ fn: "findPreviousConfirmedOffer", args: Array.from(arguments) });
        throw new Error("lookup failed");
      },
    });

    const result = await finalizeConfirmedBooking(deps, {
      leadId: "lead1",
      offerId: "offer1",
      slot: { label: "Mon at 10 AM" },
      message: "You're booked!",
      claim,
    });

    const warnCall = deps.calls.find((c) => c.fn === "warn");
    expect(warnCall).toBeTruthy();
    expect(warnCall?.args[0]).toContain("previous survey booking");

    expect(deps.calls.find((c) => c.fn === "sendConfirmation")).toBeTruthy();
    expect(deps.calls.find((c) => c.fn === "cancelEvent")).toBeUndefined();
    expect(result.cancel).toBe("none");
  });

  it("warns when recordSurveyCalendar throws but rest proceeds", async () => {
    const deps = makeDeps({
      async recordSurveyCalendar() {
        deps.calls.push({ fn: "recordSurveyCalendar", args: Array.from(arguments) });
        throw new Error("calendar write failed");
      },
    });

    const result = await finalizeConfirmedBooking(deps, {
      leadId: "lead1",
      offerId: "offer1",
      slot: { label: "Mon at 10 AM" },
      message: "You're booked!",
      claim,
    });

    const warnCall = deps.calls.find((c) => c.fn === "warn");
    expect(warnCall).toBeTruthy();
    expect(warnCall?.args[0]).toContain("survey calendar");

    expect(deps.calls.find((c) => c.fn === "setBooked")).toBeTruthy();
    expect(deps.calls.find((c) => c.fn === "sendConfirmation")).toBeTruthy();
    expect(result).toBeDefined();
  });

  it("returns failed when cancelEvent returns {ok:false}, markCancelled NOT called, confirmation already sent", async () => {
    const deps = makeDeps({
      async findPreviousConfirmedOffer() {
        deps.calls.push({ fn: "findPreviousConfirmedOffer", args: Array.from(arguments) });
        return { id: "old-offer-1", calendar_event_id: "old-evt-1" };
      },
      async cancelEvent() {
        deps.calls.push({ fn: "cancelEvent", args: Array.from(arguments) });
        return { ok: false, error: "cancel failed" };
      },
    });

    const result = await finalizeConfirmedBooking(deps, {
      leadId: "lead1",
      offerId: "offer1",
      slot: { label: "Mon at 10 AM" },
      message: "You're booked!",
      claim,
    });

    expect(result.cancel).toBe("failed");
    expect(deps.calls.find((c) => c.fn === "markOfferCalendarCancelled")).toBeUndefined();
    expect(deps.calls.find((c) => c.fn === "sendConfirmation")).toBeTruthy();
  });

  it('returns not_configured when cancelEvent returns {ok:true, status:"not_configured"}, markCancelled NOT called', async () => {
    const deps = makeDeps({
      async findPreviousConfirmedOffer() {
        deps.calls.push({ fn: "findPreviousConfirmedOffer", args: Array.from(arguments) });
        return { id: "old-offer-1", calendar_event_id: "old-evt-1" };
      },
      async cancelEvent() {
        deps.calls.push({ fn: "cancelEvent", args: Array.from(arguments) });
        return { ok: true, status: "not_configured" };
      },
    });

    const result = await finalizeConfirmedBooking(deps, {
      leadId: "lead1",
      offerId: "offer1",
      slot: { label: "Mon at 10 AM" },
      message: "You're booked!",
      claim,
    });

    expect(result.cancel).toBe("not_configured");
    expect(deps.calls.find((c) => c.fn === "markOfferCalendarCancelled")).toBeUndefined();
  });

  it("warns and returns failed when cancelEvent throws", async () => {
    const deps = makeDeps({
      async findPreviousConfirmedOffer() {
        deps.calls.push({ fn: "findPreviousConfirmedOffer", args: Array.from(arguments) });
        return { id: "old-offer-1", calendar_event_id: "old-evt-1" };
      },
      async cancelEvent() {
        deps.calls.push({ fn: "cancelEvent", args: Array.from(arguments) });
        throw new Error("cancel threw");
      },
    });

    const result = await finalizeConfirmedBooking(deps, {
      leadId: "lead1",
      offerId: "offer1",
      slot: { label: "Mon at 10 AM" },
      message: "You're booked!",
      claim,
    });

    const warnCall = deps.calls.find((c) => c.fn === "warn");
    expect(warnCall).toBeTruthy();
    expect(warnCall?.args[0]).toContain("cancel the previous survey event");

    expect(result.cancel).toBe("failed");
  });

  it("rejects when recordSlotSelection throws and sendConfirmation never called", async () => {
    const deps = makeDeps({
      async recordSlotSelection() {
        deps.calls.push({ fn: "recordSlotSelection", args: Array.from(arguments) });
        throw new Error("selection record failed");
      },
    });

    await expect(
      finalizeConfirmedBooking(deps, {
        leadId: "lead1",
        offerId: "offer1",
        slot: { label: "Mon at 10 AM" },
        message: "You're booked!",
        claim,
      })
    ).rejects.toThrow("selection record failed");

    expect(deps.calls.find((c) => c.fn === "sendConfirmation")).toBeUndefined();
  });

  it("rejects when sendConfirmation throws", async () => {
    const deps = makeDeps({
      async sendConfirmation() {
        deps.calls.push({ fn: "sendConfirmation", args: Array.from(arguments) });
        throw new Error("send failed");
      },
    });

    await expect(
      finalizeConfirmedBooking(deps, {
        leadId: "lead1",
        offerId: "offer1",
        slot: { label: "Mon at 10 AM" },
        message: "You're booked!",
        claim,
      })
    ).rejects.toThrow("send failed");
  });

  it("skips cancel when previous offer has blank event id", async () => {
    const deps = makeDeps({
      async findPreviousConfirmedOffer() {
        deps.calls.push({ fn: "findPreviousConfirmedOffer", args: Array.from(arguments) });
        return { id: "old-offer-1", calendar_event_id: "" };
      },
    });

    const result = await finalizeConfirmedBooking(deps, {
      leadId: "lead1",
      offerId: "offer1",
      slot: { label: "Mon at 10 AM" },
      message: "You're booked!",
      claim,
    });

    expect(deps.calls.find((c) => c.fn === "cancelEvent")).toBeUndefined();
    expect(result.cancel).toBe("none");
  });
});

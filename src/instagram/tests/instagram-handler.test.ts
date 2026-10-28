/**
 * Tests for Instagram message handler
 */

import { handleInstagramMessage } from "../handler.js";
import type { InstagramDeps } from "../handler.js";
import { IG_ACK_OPT_OUT, IG_ACK_HUMAN } from "../messages.js";
import { NO_SLOTS_MESSAGE, buildFreshSlotsMessage } from "../../flows/booking.js";
import { buildSlotOfferMessage } from "../../flows/survey-booking.js";

interface CallRecord {
  fn: string;
  args: any[];
}

function makeDeps(overrides: Partial<InstagramDeps> = {}): InstagramDeps & { calls: CallRecord[] } {
  const calls: CallRecord[] = [];

  const testSlots = [
    { label: "Mon at 10:00 AM", datetime: new Date("2026-10-21T10:00:00.000Z").toISOString() },
    { label: "Tue at 2:00 PM", datetime: new Date("2026-10-22T14:00:00.000Z").toISOString() },
  ];

  const defaults: InstagramDeps = {
    async isProcessed() {
      calls.push({ fn: "isProcessed", args: Array.from(arguments) });
      return false;
    },
    async markProcessed() {
      calls.push({ fn: "markProcessed", args: Array.from(arguments) });
    },
    async resolveEnquiry() {
      calls.push({ fn: "resolveEnquiry", args: Array.from(arguments) });
      return {
        leadId: "l1",
        contactId: "c1",
        contactNeedsProfile: false,
        status: "new",
        humanTakeover: false,
        createdEnquiry: false,
        escalated: false,
        escalatedAt: null,
      };
    },
    async ensureProfile() {
      calls.push({ fn: "ensureProfile", args: Array.from(arguments) });
    },
    async logMessage() {
      calls.push({ fn: "logMessage", args: Array.from(arguments) });
    },
    async recordConsent() {
      calls.push({ fn: "recordConsent", args: Array.from(arguments) });
    },
    async sendText() {
      calls.push({ fn: "sendText", args: Array.from(arguments) });
    },
    async getOpenOffer() {
      calls.push({ fn: "getOpenOffer", args: Array.from(arguments) });
      return undefined;
    },
    async createOffer() {
      calls.push({ fn: "createOffer", args: Array.from(arguments) });
    },
    async setStatus() {
      calls.push({ fn: "setStatus", args: Array.from(arguments) });
    },
    async getKnownInfo() {
      calls.push({ fn: "getKnownInfo", args: Array.from(arguments) });
      return {};
    },
    async runTurn() {
      calls.push({ fn: "runTurn", args: Array.from(arguments) });
      return {
        data: {
          replyMessage: "Hello",
          extractedFields: {},
          wantsToBookSurvey: false,
          wantsHuman: false,
          needsTeamFollowUp: false,
        },
        providerUsed: "gemini",
        wasFailover: false,
      };
    },
    async mergeFields() {
      calls.push({ fn: "mergeFields", args: Array.from(arguments) });
    },
    async setEscalated() {
      calls.push({ fn: "setEscalated", args: Array.from(arguments) });
    },
    async notifyAdmin() {
      calls.push({ fn: "notifyAdmin", args: Array.from(arguments) });
    },
    surveyBooking: {
      async getSlotOptions() {
        calls.push({ fn: "surveyBooking.getSlotOptions", args: Array.from(arguments) });
        return testSlots;
      },
      async claimSlot() {
        calls.push({ fn: "surveyBooking.claimSlot", args: Array.from(arguments) });
        return {
          ok: true,
          status: "created",
          startsAt: new Date("2026-10-21T10:00:00.000Z"),
          endsAt: new Date("2026-10-21T10:30:00.000Z"),
          eventId: "evt1",
          eventLink: "https://example.com/evt1",
        };
      },
    },
    finalizeDeps() {
      return {
        async findPreviousConfirmedOffer() {
          calls.push({ fn: "finalize.findPreviousConfirmedOffer", args: Array.from(arguments) });
          return undefined;
        },
        async recordSlotSelection() {
          calls.push({ fn: "finalize.recordSlotSelection", args: Array.from(arguments) });
        },
        async recordSurveyCalendar() {
          calls.push({ fn: "finalize.recordSurveyCalendar", args: Array.from(arguments) });
        },
        async setBooked() {
          calls.push({ fn: "finalize.setBooked", args: Array.from(arguments) });
        },
        async sendConfirmation() {
          calls.push({ fn: "finalize.sendConfirmation", args: Array.from(arguments) });
        },
        notifyBooked() {
          calls.push({ fn: "finalize.notifyBooked", args: Array.from(arguments) });
        },
        async cancelEvent() {
          calls.push({ fn: "finalize.cancelEvent", args: Array.from(arguments) });
          return { ok: true, status: "cancelled" };
        },
        async markOfferCalendarCancelled() {
          calls.push({ fn: "finalize.markOfferCalendarCancelled", args: Array.from(arguments) });
        },
        warn() {
          calls.push({ fn: "finalize.warn", args: Array.from(arguments) });
        },
      };
    },
  };

  return {
    ...defaults,
    ...overrides,
    calls,
  } as InstagramDeps & { calls: CallRecord[] };
}

describe("handleInstagramMessage", () => {
  const now = new Date("2026-10-20T12:00:00.000Z");

  it("returns duplicate when message already processed", async () => {
    const deps = makeDeps({
      async isProcessed() {
        deps.calls.push({ fn: "isProcessed", args: Array.from(arguments) });
        return true;
      },
    });

    const event = {
      igsid: "IG1",
      accountId: "ACC1",
      mid: "m1",
      timestamp: null,
      text: "hi",
      attachmentType: null,
    };

    const result = await handleInstagramMessage(event, deps, now);

    expect(result.status).toBe("duplicate");
    expect(deps.calls.filter((c) => c.fn !== "isProcessed").length).toBe(0);
  });

  it("processes normal text message", async () => {
    const deps = makeDeps();

    const event = {
      igsid: "IG1",
      accountId: "ACC1",
      mid: "m1",
      timestamp: null,
      text: "Need to move",
      attachmentType: null,
    };

    const result = await handleInstagramMessage(event, deps, now);

    expect(result.status).toBe("replied");
    expect(deps.calls.find((c) => c.fn === "markProcessed")).toBeTruthy();
    expect(deps.calls.find((c) => c.fn === "resolveEnquiry")?.args[0]).toMatchObject({
      igsid: "IG1",
      forceAttachToLatest: false,
    });
    expect(deps.calls.find((c) => c.fn === "logMessage")?.args[0].direction).toBe("inbound");
    expect(deps.calls.find((c) => c.fn === "runTurn")).toBeTruthy();
    expect(deps.calls.find((c) => c.fn === "mergeFields")).toBeTruthy();
    expect(deps.calls.find((c) => c.fn === "sendText")?.args[0].text).toBe("Hello");
  });

  it("handles STOP opt-out", async () => {
    const deps = makeDeps();

    const event = {
      igsid: "IG1",
      accountId: "ACC1",
      mid: "m1",
      timestamp: null,
      text: "STOP",
      attachmentType: null,
    };

    const result = await handleInstagramMessage(event, deps, now);

    expect(result.status).toBe("opted_out");
    expect(deps.calls.find((c) => c.fn === "resolveEnquiry")?.args[0].forceAttachToLatest).toBe(true);
    expect(deps.calls.find((c) => c.fn === "recordConsent")?.args[0]).toMatchObject({
      channel: "instagram",
      scope: "follow_up",
      status: "withdrawn",
      source: "customer_stop",
      wording: "STOP",
      evidenceRef: "m1",
    });

    const sendTextCall = deps.calls.find((c) => c.fn === "sendText");
    expect(sendTextCall?.args[0].text).toBe(IG_ACK_OPT_OUT);
    expect(deps.calls.filter((c) => c.fn === "sendText").length).toBe(1);
    expect(deps.calls.findIndex((c) => c.fn === "recordConsent")).toBeLessThan(
      deps.calls.findIndex((c) => c.fn === "sendText")
    );
    expect(deps.calls.find((c) => c.fn === "runTurn")).toBeFalsy();

    const deps2 = makeDeps();
    const event2 = { ...event, text: "stop by tomorrow" };
    const result2 = await handleInstagramMessage(event2, deps2, now);
    expect(result2.status).not.toBe("opted_out");
    expect(deps2.calls.find((c) => c.fn === "runTurn")).toBeTruthy();
  });

  it("handles recordConsent and sendText failures for STOP", async () => {
    const deps1 = makeDeps({
      async sendText() {
        deps1.calls.push({ fn: "sendText", args: Array.from(arguments) });
        throw new Error("send failed");
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "STOP", attachmentType: null };
    const result1 = await handleInstagramMessage(event, deps1, now);

    expect(result1.status).toBe("opted_out");
    expect(deps1.calls.find((c) => c.fn === "recordConsent")).toBeTruthy();

    const deps2 = makeDeps({
      async recordConsent() {
        deps2.calls.push({ fn: "recordConsent", args: Array.from(arguments) });
        throw new Error("consent failed");
      },
    });

    await expect(handleInstagramMessage(event, deps2, now)).rejects.toThrow("consent failed");
    expect(deps2.calls.find((c) => c.fn === "sendText")).toBeFalsy();
  });

  it("returns human_takeover when flag is set", async () => {
    const deps = makeDeps({
      async resolveEnquiry() {
        deps.calls.push({ fn: "resolveEnquiry", args: Array.from(arguments) });
        return {
          leadId: "l1",
          contactId: "c1",
          status: "gathering",
          humanTakeover: true,
          createdEnquiry: false,
        };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "hi", attachmentType: null };
    const result = await handleInstagramMessage(event, deps, now);

    expect(result.status).toBe("human_takeover");
    expect(deps.calls.find((c) => c.fn === "logMessage")).toBeTruthy();
    expect(deps.calls.find((c) => c.fn === "runTurn")).toBeFalsy();
    expect(deps.calls.find((c) => c.fn === "sendText")).toBeFalsy();
  });

  it("handles attachment-only message", async () => {
    const deps = makeDeps();

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: null, attachmentType: "image" };
    const result = await handleInstagramMessage(event, deps, now);

    expect(result.status).toBe("attachment_reply");
    const sendCall = deps.calls.find((c) => c.fn === "sendText");
    expect(sendCall?.args[0].text).toContain("I can only read text messages");
    const logCall = deps.calls.find((c) => c.fn === "logMessage");
    expect(logCall?.args[0].body).toBe("[Instagram attachment: image]");
    expect(deps.calls.find((c) => c.fn === "runTurn")).toBeFalsy();
  });

  it("slot selection on booking_offered status -> slot_confirmed with finalize called", async () => {
    const slotOptions = [
      { label: "Mon at 10:00 AM", datetime: new Date(now.getTime() + 86400000).toISOString() },
      { label: "Tue at 2:00 PM", datetime: new Date(now.getTime() + 2 * 86400000).toISOString() },
    ];

    const deps = makeDeps({
      async resolveEnquiry() {
        deps.calls.push({ fn: "resolveEnquiry", args: Array.from(arguments) });
        return {
          leadId: "l1",
          contactId: "c1",
          status: "booking_offered",
          humanTakeover: false,
          createdEnquiry: false,
        };
      },
      async getOpenOffer() {
        deps.calls.push({ fn: "getOpenOffer", args: Array.from(arguments) });
        return { id: "o1", slotOptions: JSON.stringify(slotOptions), offeredAt: new Date(now.getTime() - 300000) };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "2", attachmentType: null };
    const result = await handleInstagramMessage(event, deps, now);

    expect(result.status).toBe("slot_confirmed");

    const finalizeCalls = deps.calls.filter((c) => c.fn.startsWith("finalize."));
    expect(finalizeCalls.map((c) => c.fn)).toEqual([
      "finalize.findPreviousConfirmedOffer",
      "finalize.recordSlotSelection",
      "finalize.recordSurveyCalendar",
      "finalize.setBooked",
      "finalize.sendConfirmation",
      "finalize.notifyBooked",
    ]);

    const confirmationCalls = deps.calls.filter((c) => c.fn === "finalize.sendConfirmation");
    expect(confirmationCalls.length).toBe(1);
    expect(confirmationCalls[0].args[0]).toContain("You're booked");

    expect(deps.calls.find((c) => c.fn === "runTurn")).toBeFalsy();
  });

  it("booked lead with 5-minute-old offer + slot choice -> handled as rebooking", async () => {
    const slotOptions = [
      { label: "Mon at 10:00 AM", datetime: new Date(now.getTime() + 86400000).toISOString() },
    ];

    const deps = makeDeps({
      async resolveEnquiry() {
        deps.calls.push({ fn: "resolveEnquiry", args: Array.from(arguments) });
        return {
          leadId: "l1",
          contactId: "c1",
          status: "booked",
          humanTakeover: false,
          createdEnquiry: false,
        };
      },
      async getOpenOffer() {
        deps.calls.push({ fn: "getOpenOffer", args: Array.from(arguments) });
        return { id: "o1", slotOptions: JSON.stringify(slotOptions), offeredAt: new Date(now.getTime() - 300000) };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "1", attachmentType: null };
    const result = await handleInstagramMessage(event, deps, now);

    expect(result.status).toBe("slot_confirmed");
    expect(deps.calls.find((c) => c.fn === "finalize.findPreviousConfirmedOffer")).toBeTruthy();
  });

  it("booked lead with 2-day-old offer + slot choice -> NOT treated as slot (goes to AI)", async () => {
    const slotOptions = [
      { label: "Mon at 10:00 AM", datetime: new Date(now.getTime() + 86400000).toISOString() },
    ];

    const deps = makeDeps({
      async resolveEnquiry() {
        deps.calls.push({ fn: "resolveEnquiry", args: Array.from(arguments) });
        return {
          leadId: "l1",
          contactId: "c1",
          status: "booked",
          humanTakeover: false,
          createdEnquiry: false,
        };
      },
      async getOpenOffer() {
        deps.calls.push({ fn: "getOpenOffer", args: Array.from(arguments) });
        return { id: "o1", slotOptions: JSON.stringify(slotOptions), offeredAt: new Date(now.getTime() - 2 * 86400000) };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "1", attachmentType: null };
    const result = await handleInstagramMessage(event, deps, now);

    expect(result.status).toBe("replied");
    expect(deps.calls.find((c) => c.fn === "runTurn")).toBeTruthy();
    expect(deps.calls.find((c) => c.fn.startsWith("finalize."))).toBeFalsy();
  });

  it("taken slot -> slot_taken, fresh slots sent, new offer created, no finalize", async () => {
    const slotOptions = [
      { label: "Mon at 10:00 AM", datetime: new Date(now.getTime() + 86400000).toISOString() },
    ];

    const freshSlots = [
      { label: "Wed at 10:00 AM", datetime: new Date(now.getTime() + 3 * 86400000).toISOString() },
    ];

    const deps = makeDeps({
      async resolveEnquiry() {
        deps.calls.push({ fn: "resolveEnquiry", args: Array.from(arguments) });
        return {
          leadId: "l1",
          contactId: "c1",
          status: "booking_offered",
          humanTakeover: false,
          createdEnquiry: false,
        };
      },
      async getOpenOffer() {
        deps.calls.push({ fn: "getOpenOffer", args: Array.from(arguments) });
        return { id: "o1", slotOptions: JSON.stringify(slotOptions), offeredAt: new Date(now.getTime() - 300000) };
      },
      surveyBooking: {
        async getSlotOptions() {
          deps.calls.push({ fn: "surveyBooking.getSlotOptions", args: Array.from(arguments) });
          return freshSlots;
        },
        async claimSlot() {
          deps.calls.push({ fn: "surveyBooking.claimSlot", args: Array.from(arguments) });
          return { ok: false, error: "taken" };
        },
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "1", attachmentType: null };
    const result = await handleInstagramMessage(event, deps, now);

    expect(result.status).toBe("slot_taken");
    const sendCall = deps.calls.find((c) => c.fn === "sendText");
    expect(sendCall?.args[0].text).toBe(buildFreshSlotsMessage(freshSlots, "taken"));
    expect(deps.calls.find((c) => c.fn === "createOffer")?.args[1]).toEqual(freshSlots);
    expect(deps.calls.find((c) => c.fn.startsWith("finalize."))).toBeFalsy();
  });

  it("stale slot -> slot_stale, claim NOT called", async () => {
    const pastSlots = [
      { label: "Mon at 10:00 AM", datetime: new Date(now.getTime() - 86400000).toISOString() },
    ];

    const deps = makeDeps({
      async resolveEnquiry() {
        deps.calls.push({ fn: "resolveEnquiry", args: Array.from(arguments) });
        return {
          leadId: "l1",
          contactId: "c1",
          status: "booking_offered",
          humanTakeover: false,
          createdEnquiry: false,
        };
      },
      async getOpenOffer() {
        deps.calls.push({ fn: "getOpenOffer", args: Array.from(arguments) });
        return { id: "o1", slotOptions: JSON.stringify(pastSlots), offeredAt: new Date(now.getTime() - 300000) };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "1", attachmentType: null };
    const result = await handleInstagramMessage(event, deps, now);

    expect(result.status).toBe("slot_stale");
    expect(deps.calls.find((c) => c.fn === "surveyBooking.claimSlot")).toBeFalsy();
    expect(deps.calls.find((c) => c.fn === "createOffer")).toBeTruthy();
  });

  it("none_left -> no_slots, escalated + needs_followup notify, NO createOffer", async () => {
    const slotOptions = [
      { label: "Mon at 10:00 AM", datetime: new Date(now.getTime() + 86400000).toISOString() },
    ];

    const deps = makeDeps({
      async resolveEnquiry() {
        deps.calls.push({ fn: "resolveEnquiry", args: Array.from(arguments) });
        return {
          leadId: "l1",
          contactId: "c1",
          status: "booking_offered",
          humanTakeover: false,
          createdEnquiry: false,
        };
      },
      async getOpenOffer() {
        deps.calls.push({ fn: "getOpenOffer", args: Array.from(arguments) });
        return { id: "o1", slotOptions: JSON.stringify(slotOptions), offeredAt: new Date(now.getTime() - 300000) };
      },
      surveyBooking: {
        async getSlotOptions() {
          deps.calls.push({ fn: "surveyBooking.getSlotOptions", args: Array.from(arguments) });
          return [];
        },
        async claimSlot() {
          deps.calls.push({ fn: "surveyBooking.claimSlot", args: Array.from(arguments) });
          return { ok: false, error: "no slots" };
        },
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "1", attachmentType: null };
    const result = await handleInstagramMessage(event, deps, now);

    expect(result.status).toBe("no_slots");
    const sendCall = deps.calls.find((c) => c.fn === "sendText");
    expect(sendCall?.args[0].text).toBe(NO_SLOTS_MESSAGE);
    expect(deps.calls.find((c) => c.fn === "setEscalated")).toBeTruthy();
    expect(deps.calls.find((c) => c.fn === "notifyAdmin")?.args[0].type).toBe("needs_followup");
    expect(deps.calls.find((c) => c.fn === "createOffer")).toBeFalsy();
  });

  it("wantsToBookSurvey with slots -> offer message is buildSlotOfferMessage output, createOffer + setStatus(booking_offered)", async () => {
    const deps = makeDeps({
      async runTurn() {
        deps.calls.push({ fn: "runTurn", args: Array.from(arguments) });
        return {
          data: {
            replyMessage: "Sure, let me find times",
            extractedFields: {},
            wantsToBookSurvey: true,
            wantsHuman: false,
            needsTeamFollowUp: false,
          },
          providerUsed: "gemini",
          wasFailover: false,
        };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "book survey", attachmentType: null };
    const result = await handleInstagramMessage(event, deps, now);

    expect(result.status).toBe("replied");
    const sendCalls = deps.calls.filter((c) => c.fn === "sendText");
    expect(sendCalls.length).toBe(2);
    expect(sendCalls[1].args[0].text).toBe(buildSlotOfferMessage([
      { label: "Mon at 10:00 AM", datetime: new Date("2026-10-21T10:00:00.000Z").toISOString() },
      { label: "Tue at 2:00 PM", datetime: new Date("2026-10-22T14:00:00.000Z").toISOString() },
    ]));
    expect(deps.calls.find((c) => c.fn === "createOffer")).toBeTruthy();
    expect(deps.calls.find((c) => c.fn === "setStatus")?.args).toEqual(["l1", "booking_offered"]);
  });

  it("wantsToBookSurvey on booked lead -> setStatus(booked)", async () => {
    const deps = makeDeps({
      async resolveEnquiry() {
        deps.calls.push({ fn: "resolveEnquiry", args: Array.from(arguments) });
        return {
          leadId: "l1",
          contactId: "c1",
          status: "booked",
          humanTakeover: false,
          createdEnquiry: false,
        };
      },
      async runTurn() {
        deps.calls.push({ fn: "runTurn", args: Array.from(arguments) });
        return {
          data: {
            replyMessage: "Sure",
            extractedFields: {},
            wantsToBookSurvey: true,
            wantsHuman: false,
            needsTeamFollowUp: false,
          },
          providerUsed: "gemini",
          wasFailover: false,
        };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "book survey", attachmentType: null };
    await handleInstagramMessage(event, deps, now);

    expect(deps.calls.find((c) => c.fn === "setStatus")?.args).toEqual(["l1", "booked"]);
  });

  it("wantsToBookSurvey with no slots -> NO_SLOTS_MESSAGE sent, escalated, no createOffer", async () => {
    const deps = makeDeps({
      async runTurn() {
        deps.calls.push({ fn: "runTurn", args: Array.from(arguments) });
        return {
          data: {
            replyMessage: "Sure",
            extractedFields: {},
            wantsToBookSurvey: true,
            wantsHuman: false,
            needsTeamFollowUp: false,
          },
          providerUsed: "gemini",
          wasFailover: false,
        };
      },
      surveyBooking: {
        async getSlotOptions() {
          deps.calls.push({ fn: "surveyBooking.getSlotOptions", args: Array.from(arguments) });
          return [];
        },
        async claimSlot() {
          deps.calls.push({ fn: "surveyBooking.claimSlot", args: Array.from(arguments) });
          throw new Error("should not be called");
        },
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "book survey", attachmentType: null };
    await handleInstagramMessage(event, deps, now);

    const sendCalls = deps.calls.filter((c) => c.fn === "sendText");
    expect(sendCalls.some((c) => c.args[0].text === NO_SLOTS_MESSAGE)).toBe(true);
    expect(deps.calls.find((c) => c.fn === "setEscalated")).toBeTruthy();
    expect(deps.calls.find((c) => c.fn === "createOffer")).toBeFalsy();
  });

  it("offer 20 min ago on booking_offered + wantsToBookSurvey -> fresh slots re-offered; 5 min ago -> not re-offered", async () => {
    const oldSlots = [
      { label: "Mon at 10:00 AM", datetime: new Date(now.getTime() + 86400000).toISOString() },
    ];

    const deps1 = makeDeps({
      async resolveEnquiry() {
        deps1.calls.push({ fn: "resolveEnquiry", args: Array.from(arguments) });
        return {
          leadId: "l1",
          contactId: "c1",
          status: "booking_offered",
          humanTakeover: false,
          createdEnquiry: false,
        };
      },
      async getOpenOffer() {
        deps1.calls.push({ fn: "getOpenOffer", args: Array.from(arguments) });
        return { id: "o1", slotOptions: JSON.stringify(oldSlots), offeredAt: new Date(now.getTime() - 20 * 60000) };
      },
      async runTurn() {
        deps1.calls.push({ fn: "runTurn", args: Array.from(arguments) });
        return {
          data: {
            replyMessage: "Sure",
            extractedFields: {},
            wantsToBookSurvey: true,
            wantsHuman: false,
            needsTeamFollowUp: false,
          },
          providerUsed: "gemini",
          wasFailover: false,
        };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "book survey", attachmentType: null };
    await handleInstagramMessage(event, deps1, now);

    expect(deps1.calls.filter((c) => c.fn === "createOffer").length).toBeGreaterThan(0);

    const deps2 = makeDeps({
      async resolveEnquiry() {
        deps2.calls.push({ fn: "resolveEnquiry", args: Array.from(arguments) });
        return {
          leadId: "l1",
          contactId: "c1",
          status: "booking_offered",
          humanTakeover: false,
          createdEnquiry: false,
        };
      },
      async getOpenOffer() {
        deps2.calls.push({ fn: "getOpenOffer", args: Array.from(arguments) });
        return { id: "o1", slotOptions: JSON.stringify(oldSlots), offeredAt: new Date(now.getTime() - 5 * 60000) };
      },
      async runTurn() {
        deps2.calls.push({ fn: "runTurn", args: Array.from(arguments) });
        return {
          data: {
            replyMessage: "Sure",
            extractedFields: {},
            wantsToBookSurvey: true,
            wantsHuman: false,
            needsTeamFollowUp: false,
          },
          providerUsed: "gemini",
          wasFailover: false,
        };
      },
    });

    await handleInstagramMessage(event, deps2, now);

    expect(deps2.calls.find((c) => c.fn === "createOffer")).toBeFalsy();
  });

  it("an Instagram reply never contains the Great! text twice", async () => {
    const deps = makeDeps({
      async runTurn() {
        deps.calls.push({ fn: "runTurn", args: Array.from(arguments) });
        return {
          data: {
            replyMessage: "Sure",
            extractedFields: {},
            wantsToBookSurvey: true,
            wantsHuman: false,
            needsTeamFollowUp: false,
          },
          providerUsed: "gemini",
          wasFailover: false,
        };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "book survey", attachmentType: null };
    await handleInstagramMessage(event, deps, now);

    const sendCalls = deps.calls.filter((c) => c.fn === "sendText");
    const allText = sendCalls.map((c) => c.args[0].text).join("\n");
    const greatCount = (allText.match(/Great!/g) || []).length;
    expect(greatCount).toBeLessThanOrEqual(1);
  });

  it("escalates on wantsHuman and needsTeamFollowUp", async () => {
    const deps1 = makeDeps({
      async runTurn() {
        deps1.calls.push({ fn: "runTurn", args: Array.from(arguments) });
        return {
          data: {
            replyMessage: "Let me connect you",
            extractedFields: {},
            wantsToBookSurvey: false,
            wantsHuman: true,
            needsTeamFollowUp: false,
          },
          providerUsed: "gemini",
          wasFailover: false,
        };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "talk to human", attachmentType: null };
    await handleInstagramMessage(event, deps1, now);
    expect(deps1.calls.find((c) => c.fn === "setEscalated")).toBeTruthy();

    const deps2 = makeDeps({
      async runTurn() {
        deps2.calls.push({ fn: "runTurn", args: Array.from(arguments) });
        return {
          data: {
            replyMessage: "I'll check with the team",
            extractedFields: {},
            wantsToBookSurvey: false,
            wantsHuman: false,
            needsTeamFollowUp: true,
          },
          providerUsed: "gemini",
          wasFailover: false,
        };
      },
    });

    await handleInstagramMessage(event, deps2, now);
    expect(deps2.calls.find((c) => c.fn === "setEscalated")).toBeTruthy();
  });

  it("calls ensureProfile when contactNeedsProfile true", async () => {
    const deps = makeDeps({
      async resolveEnquiry() {
        deps.calls.push({ fn: "resolveEnquiry", args: Array.from(arguments) });
        return {
          leadId: "l1",
          contactId: "c1",
          contactNeedsProfile: true,
          status: "new",
          humanTakeover: false,
          createdEnquiry: false,
        };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "hi", attachmentType: null };
    await handleInstagramMessage(event, deps, now);

    expect(deps.calls.find((c) => c.fn === "ensureProfile")?.args).toEqual(["c1", "IG1"]);
  });

  it("does not call ensureProfile when contactNeedsProfile false", async () => {
    const deps = makeDeps();

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "hi", attachmentType: null };
    await handleInstagramMessage(event, deps, now);

    expect(deps.calls.find((c) => c.fn === "ensureProfile")).toBeFalsy();
  });

  it("handles ensureProfile throw without affecting reply", async () => {
    const deps = makeDeps({
      async resolveEnquiry() {
        deps.calls.push({ fn: "resolveEnquiry", args: Array.from(arguments) });
        return {
          leadId: "l1",
          contactId: "c1",
          contactNeedsProfile: true,
          status: "new",
          humanTakeover: false,
          createdEnquiry: false,
        };
      },
      async ensureProfile() {
        deps.calls.push({ fn: "ensureProfile", args: Array.from(arguments) });
        throw new Error("profile fetch failed");
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "hi", attachmentType: null };
    const result = await handleInstagramMessage(event, deps, now);

    expect(result.status).toBe("replied");
    expect(deps.calls.find((c) => c.fn === "ensureProfile")).toBeTruthy();
  });

  it("calls notifyAdmin for human_requested and sends ack", async () => {
    const deps = makeDeps({
      async runTurn() {
        deps.calls.push({ fn: "runTurn", args: Array.from(arguments) });
        return {
          data: {
            replyMessage: "Let me connect you",
            extractedFields: {},
            wantsToBookSurvey: false,
            wantsHuman: true,
            needsTeamFollowUp: false,
          },
          providerUsed: "gemini",
          wasFailover: false,
        };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "talk to human", attachmentType: null };
    await handleInstagramMessage(event, deps, now);

    const notifyCall = deps.calls.find((c) => c.fn === "notifyAdmin");
    expect(notifyCall).toBeTruthy();
    expect(notifyCall?.args[0]).toMatchObject({
      type: "human_requested",
      leadId: "l1",
      lastMessage: "talk to human",
    });

    const sendCalls = deps.calls.filter((c) => c.fn === "sendText");
    expect(sendCalls.some((c) => c.args[0].text === IG_ACK_HUMAN && c.args[0].senderType === "system")).toBe(true);
    expect(deps.calls.find((c) => c.fn === "setEscalated")).toBeTruthy();
  });

  it("calls notifyAdmin for typed human request even when AI says no", async () => {
    const deps = makeDeps();

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "connect me to a human", attachmentType: null };
    await handleInstagramMessage(event, deps, now);

    const notifyCall = deps.calls.find((c) => c.fn === "notifyAdmin");
    expect(notifyCall?.args[0].type).toBe("human_requested");
    expect(deps.calls.find((c) => c.fn === "setEscalated")).toBeTruthy();

    const sendCalls = deps.calls.filter((c) => c.fn === "sendText");
    expect(sendCalls.some((c) => c.args[0].text === IG_ACK_HUMAN)).toBe(true);
  });

  it("calls notifyAdmin for needsTeamFollowUp", async () => {
    const deps = makeDeps({
      async runTurn() {
        deps.calls.push({ fn: "runTurn", args: Array.from(arguments) });
        return {
          data: {
            replyMessage: "I'll check with the team",
            extractedFields: {},
            wantsToBookSurvey: false,
            wantsHuman: false,
            needsTeamFollowUp: true,
          },
          providerUsed: "gemini",
          wasFailover: false,
        };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "need special pricing", attachmentType: null };
    await handleInstagramMessage(event, deps, now);

    const notifyCall = deps.calls.find((c) => c.fn === "notifyAdmin");
    expect(notifyCall?.args[0].type).toBe("needs_followup");
    expect(deps.calls.filter((c) => c.fn === "sendText" && c.args[0].text === IG_ACK_HUMAN).length).toBe(0);
  });

  it("handles notifyAdmin throw without affecting reply", async () => {
    const deps = makeDeps({
      async runTurn() {
        deps.calls.push({ fn: "runTurn", args: Array.from(arguments) });
        return {
          data: {
            replyMessage: "Let me connect you",
            extractedFields: {},
            wantsToBookSurvey: false,
            wantsHuman: true,
            needsTeamFollowUp: false,
          },
          providerUsed: "gemini",
          wasFailover: false,
        };
      },
      async notifyAdmin() {
        deps.calls.push({ fn: "notifyAdmin", args: Array.from(arguments) });
        throw new Error("notify failed");
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "talk to human", attachmentType: null };
    const result = await handleInstagramMessage(event, deps, now);

    expect(result.status).toBe("replied");
  });

  it("does not call notifyAdmin or setEscalated for plain message", async () => {
    const deps = makeDeps({
      async runTurn() {
        deps.calls.push({ fn: "runTurn", args: Array.from(arguments) });
        return {
          data: {
            replyMessage: "Thank you for your inquiry. When are you planning your move?",
            extractedFields: {},
            wantsToBookSurvey: false,
            wantsHuman: false,
            needsTeamFollowUp: false,
          },
          providerUsed: "gemini",
          wasFailover: false,
        };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "Hi, I need a moving quote", attachmentType: null };
    const result = await handleInstagramMessage(event, deps, now);

    expect(result.status).toBe("replied");
    expect(deps.calls.find((c) => c.fn === "notifyAdmin")).toBeUndefined();
    expect(deps.calls.find((c) => c.fn === "setEscalated")).toBeUndefined();
  });

  it("falls through to AI when booking_offered but text is not a slot selection", async () => {
    const deps = makeDeps({
      async resolveEnquiry() {
        deps.calls.push({ fn: "resolveEnquiry", args: Array.from(arguments) });
        return {
          leadId: "l1",
          contactId: "c1",
          status: "booking_offered",
          humanTakeover: false,
          createdEnquiry: false,
        };
      },
      async getOpenOffer() {
        deps.calls.push({ fn: "getOpenOffer", args: Array.from(arguments) });
        return { id: "o1", slotOptions: JSON.stringify([{ label: "Mon", datetime: new Date(now.getTime() + 86400000).toISOString() }]), offeredAt: new Date(now.getTime() - 300000) };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "3 bhk", attachmentType: null };
    const result = await handleInstagramMessage(event, deps, now);

    expect(result.status).toBe("replied");
    expect(deps.calls.find((c) => c.fn === "runTurn")).toBeTruthy();
  });

  it("AI needsTeamFollowUp true -> needs_followup alert sent", async () => {
    const deps = makeDeps({
      async resolveEnquiry() {
        deps.calls.push({ fn: "resolveEnquiry", args: Array.from(arguments) });
        return {
          leadId: "l1",
          contactId: "c1",
          contactNeedsProfile: false,
          status: "gathering",
          humanTakeover: false,
          createdEnquiry: false,
          escalated: false,
          escalatedAt: null,
        };
      },
      async runTurn() {
        deps.calls.push({ fn: "runTurn", args: Array.from(arguments) });
        return {
          data: {
            replyMessage: "Got it",
            extractedFields: {},
            wantsToBookSurvey: false,
            wantsHuman: false,
            needsTeamFollowUp: true,
          },
          providerUsed: "gemini",
          wasFailover: false,
        };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "question", attachmentType: null };
    await handleInstagramMessage(event, deps, now);

    expect(deps.calls.find((c) => c.fn === "setEscalated")).toBeTruthy();
    expect(deps.calls.find((c) => c.fn === "notifyAdmin")?.args[0].type).toBe("needs_followup");
  });

  it("reply text promises team check with needsTeamFollowUp false -> alert sent", async () => {
    const deps = makeDeps({
      async resolveEnquiry() {
        deps.calls.push({ fn: "resolveEnquiry", args: Array.from(arguments) });
        return {
          leadId: "l1",
          contactId: "c1",
          contactNeedsProfile: false,
          status: "gathering",
          humanTakeover: false,
          createdEnquiry: false,
          escalated: false,
          escalatedAt: null,
        };
      },
      async runTurn() {
        deps.calls.push({ fn: "runTurn", args: Array.from(arguments) });
        return {
          data: {
            replyMessage: "I'll check with the team and get back to you",
            extractedFields: {},
            wantsToBookSurvey: false,
            wantsHuman: false,
            needsTeamFollowUp: false,
          },
          providerUsed: "gemini",
          wasFailover: false,
        };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "question", attachmentType: null };
    await handleInstagramMessage(event, deps, now);

    expect(deps.calls.find((c) => c.fn === "setEscalated")).toBeTruthy();
    expect(deps.calls.find((c) => c.fn === "notifyAdmin")?.args[0].type).toBe("needs_followup");
  });

  it("already-escalated lead escalated 1h ago -> no alert", async () => {
    const escalatedAt = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    const deps = makeDeps({
      async resolveEnquiry() {
        deps.calls.push({ fn: "resolveEnquiry", args: Array.from(arguments) });
        return {
          leadId: "l1",
          contactId: "c1",
          contactNeedsProfile: false,
          status: "gathering",
          humanTakeover: false,
          createdEnquiry: false,
          escalated: true,
          escalatedAt: escalatedAt.toISOString(),
        };
      },
      async runTurn() {
        deps.calls.push({ fn: "runTurn", args: Array.from(arguments) });
        return {
          data: {
            replyMessage: "I'll check with the team",
            extractedFields: {},
            wantsToBookSurvey: false,
            wantsHuman: false,
            needsTeamFollowUp: true,
          },
          providerUsed: "gemini",
          wasFailover: false,
        };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "question", attachmentType: null };
    await handleInstagramMessage(event, deps, now);

    const escalateCalls = deps.calls.filter((c) => c.fn === "setEscalated");
    expect(escalateCalls.length).toBe(1);
    const notifyCalls = deps.calls.filter((c) => c.fn === "notifyAdmin");
    expect(notifyCalls.length).toBe(0);
  });

  it("already-escalated lead escalated 10h ago -> alert, setEscalated NOT called again", async () => {
    const escalatedAt = new Date(now.getTime() - 10 * 60 * 60 * 1000);
    const deps = makeDeps({
      async resolveEnquiry() {
        deps.calls.push({ fn: "resolveEnquiry", args: Array.from(arguments) });
        return {
          leadId: "l1",
          contactId: "c1",
          contactNeedsProfile: false,
          status: "gathering",
          humanTakeover: false,
          createdEnquiry: false,
          escalated: true,
          escalatedAt: escalatedAt.toISOString(),
        };
      },
      async runTurn() {
        deps.calls.push({ fn: "runTurn", args: Array.from(arguments) });
        return {
          data: {
            replyMessage: "Let me confirm with the team",
            extractedFields: {},
            wantsToBookSurvey: false,
            wantsHuman: false,
            needsTeamFollowUp: true,
          },
          providerUsed: "gemini",
          wasFailover: false,
        };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "question", attachmentType: null };
    await handleInstagramMessage(event, deps, now);

    const escalateCalls = deps.calls.filter((c) => c.fn === "setEscalated");
    expect(escalateCalls.length).toBe(1);
    expect(deps.calls.find((c) => c.fn === "notifyAdmin")?.args[0].type).toBe("needs_followup");
  });
});

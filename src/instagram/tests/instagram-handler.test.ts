/**
 * Tests for Instagram message handler
 */

import { handleInstagramMessage } from "../handler.js";
import type { InstagramDeps } from "../handler.js";
import { IG_ACK_OPT_OUT } from "../messages.js";

interface CallRecord {
  fn: string;
  args: any[];
}

function makeDeps(overrides: Partial<InstagramDeps> = {}): InstagramDeps & { calls: CallRecord[] } {
  const calls: CallRecord[] = [];

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
    async recordSlotSelection() {
      calls.push({ fn: "recordSlotSelection", args: Array.from(arguments) });
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

  it("handles slot selection in booking_offered status", async () => {
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
        return { id: "o1", slotOptions: JSON.stringify(slotOptions) };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "2", attachmentType: null };
    const result = await handleInstagramMessage(event, deps, now);

    expect(result.status).toBe("slot_confirmed");
    const sendCall = deps.calls.find((c) => c.fn === "sendText");
    expect(sendCall?.args[0].text).toContain("You're booked");
    expect(deps.calls.find((c) => c.fn === "recordSlotSelection")?.args).toEqual(["o1", "Tue at 2:00 PM"]);
    expect(deps.calls.find((c) => c.fn === "setStatus")?.args).toEqual(["l1", "booked"]);
    expect(deps.calls.find((c) => c.fn === "runTurn")).toBeFalsy();
  });

  it("handles stale slots in booking_offered status", async () => {
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
        return { id: "o1", slotOptions: JSON.stringify(pastSlots) };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "1", attachmentType: null };
    const result = await handleInstagramMessage(event, deps, now);

    expect(result.status).toBe("slot_stale");
    const sendCall = deps.calls.find((c) => c.fn === "sendText");
    expect(sendCall?.args[0].text).toContain("Those times have already passed");
    expect(deps.calls.find((c) => c.fn === "createOffer")).toBeTruthy();
    expect(deps.calls.find((c) => c.fn === "runTurn")).toBeFalsy();
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
        return { id: "o1", slotOptions: JSON.stringify([{ label: "Mon", datetime: new Date(now.getTime() + 86400000).toISOString() }]) };
      },
    });

    const event = { igsid: "IG1", accountId: "ACC1", mid: "m1", timestamp: null, text: "3 bhk", attachmentType: null };
    const result = await handleInstagramMessage(event, deps, now);

    expect(result.status).toBe("replied");
    expect(deps.calls.find((c) => c.fn === "runTurn")).toBeTruthy();
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

  it("offers survey slots when wantsToBookSurvey and policy allows", async () => {
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
    expect(sendCalls[1].args[0].text).toContain("1.");
    expect(deps.calls.find((c) => c.fn === "createOffer")).toBeTruthy();
    expect(deps.calls.find((c) => c.fn === "setStatus")?.args).toEqual(["l1", "booking_offered"]);
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
});

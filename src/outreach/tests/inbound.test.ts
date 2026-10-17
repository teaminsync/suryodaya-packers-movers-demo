/**
 * Tests for inbound outreach handler
 */

import { handleInboundOutreach, ACK_OPT_OUT, ACK_NOT_NOW } from "../inbound.js";
import type { InboundOutreachDeps, InboundOutreachInput } from "../inbound.js";

interface CallRecord {
  fn: string;
  args: any[];
}

const now = new Date("2026-10-17T12:00:00.000Z");

function makeDeps(overrides: Partial<InboundOutreachDeps> = {}): InboundOutreachDeps & { calls: CallRecord[] } {
  const calls: CallRecord[] = [];

  const defaults: InboundOutreachDeps = {
    async recordConsent(params: any) {
      calls.push({ fn: "recordConsent", args: [params] });
    },
    async closeLead(params: any) {
      calls.push({ fn: "closeLead", args: [params] });
    },
    async sendText(params: any) {
      calls.push({ fn: "sendText", args: [params] });
    },
  };

  return {
    ...defaults,
    ...overrides,
    calls,
  } as InboundOutreachDeps & { calls: CallRecord[] };
}

function makeInput(intent: any, overrides: Partial<InboundOutreachInput> = {}): InboundOutreachInput {
  const defaults: InboundOutreachInput = {
    intent,
    leadId: "L1",
    contactId: "C1",
    to: "919082210545",
    wamid: "wamid.IN1",
    rawText: null,
    now,
  };

  return { ...defaults, ...overrides };
}

describe("handleInboundOutreach", () => {
  it("intent none: no calls, not handled", async () => {
    const deps = makeDeps();
    const input = makeInput({ kind: "none" });
    const result = await handleInboundOutreach(input, deps);

    expect(result).toEqual({
      handled: false,
      continueWithAi: true,
      action: "none",
      ackSent: false,
    });
    expect(deps.calls.length).toBe(0);
  });

  it("opt_out: records consent then sends ack", async () => {
    const deps = makeDeps();
    const input = makeInput({ kind: "opt_out" }, { rawText: "STOP" });
    const result = await handleInboundOutreach(input, deps);

    expect(deps.calls.length).toBe(2);
    expect(deps.calls[0].fn).toBe("recordConsent");
    expect(deps.calls[0].args[0]).toEqual({
      contactId: "C1",
      channel: "whatsapp",
      scope: "follow_up",
      status: "withdrawn",
      source: "customer_stop",
      wording: "STOP",
      evidenceRef: "wamid.IN1",
      capturedAt: now.toISOString(),
    });

    expect(deps.calls[1].fn).toBe("sendText");
    expect(deps.calls[1].args[0]).toEqual({
      to: "919082210545",
      leadId: "L1",
      body: ACK_OPT_OUT,
    });

    expect(deps.calls.find((c) => c.fn === "closeLead")).toBeFalsy();

    expect(result).toEqual({
      handled: true,
      continueWithAi: false,
      action: "opted_out",
      ackSent: true,
    });
  });

  it("followup_yes: records consent, no message", async () => {
    const deps = makeDeps();
    const input = makeInput({ kind: "followup_yes" }, { rawText: "Yes, continue" });
    const result = await handleInboundOutreach(input, deps);

    expect(deps.calls.length).toBe(1);
    expect(deps.calls[0].fn).toBe("recordConsent");
    expect(deps.calls[0].args[0]).toEqual({
      contactId: "C1",
      channel: "whatsapp",
      scope: "follow_up",
      status: "granted",
      source: "template_reply",
      wording: "Yes, continue",
      evidenceRef: "wamid.IN1",
      capturedAt: now.toISOString(),
    });

    expect(deps.calls.find((c) => c.fn === "sendText")).toBeFalsy();
    expect(deps.calls.find((c) => c.fn === "closeLead")).toBeFalsy();

    expect(result).toEqual({
      handled: true,
      continueWithAi: true,
      action: "consent_granted",
      ackSent: false,
    });
  });

  it("followup_not_now: closes lead then sends ack", async () => {
    const deps = makeDeps();
    const input = makeInput({ kind: "followup_not_now" }, { rawText: "Not now" });
    const result = await handleInboundOutreach(input, deps);

    expect(deps.calls.length).toBe(2);
    expect(deps.calls[0].fn).toBe("closeLead");
    expect(deps.calls[0].args[0]).toEqual({
      leadId: "L1",
      reason: "declined_followup",
      nowIso: now.toISOString(),
    });

    expect(deps.calls[1].fn).toBe("sendText");
    expect(deps.calls[1].args[0]).toEqual({
      to: "919082210545",
      leadId: "L1",
      body: ACK_NOT_NOW,
    });

    expect(deps.calls.find((c) => c.fn === "recordConsent")).toBeFalsy();

    expect(result).toEqual({
      handled: true,
      continueWithAi: false,
      action: "declined",
      ackSent: true,
    });
  });

  it("opt_out where sendText throws: does not throw, ackSent false", async () => {
    const deps = makeDeps({
      async sendText(params: any) {
        deps.calls.push({ fn: "sendText", args: [params] });
        throw new Error("boom");
      },
    });
    const input = makeInput({ kind: "opt_out" }, { rawText: "STOP" });
    const result = await handleInboundOutreach(input, deps);

    expect(deps.calls.find((c) => c.fn === "recordConsent")).toBeTruthy();
    expect(result.action).toBe("opted_out");
    expect(result.ackSent).toBe(false);
  });

  it("followup_not_now where sendText throws: does not throw, ackSent false", async () => {
    const deps = makeDeps({
      async sendText(params: any) {
        deps.calls.push({ fn: "sendText", args: [params] });
        throw new Error("boom");
      },
    });
    const input = makeInput({ kind: "followup_not_now" }, { rawText: "Not now" });
    const result = await handleInboundOutreach(input, deps);

    expect(deps.calls.find((c) => c.fn === "closeLead")).toBeTruthy();
    expect(result.action).toBe("declined");
    expect(result.ackSent).toBe(false);
  });

  it("recordConsent throws for opt_out: rejects; closeLead throws for not_now: rejects", async () => {
    const deps1 = makeDeps({
      async recordConsent(params: any) {
        deps1.calls.push({ fn: "recordConsent", args: [params] });
        throw new Error("db down");
      },
    });
    const input1 = makeInput({ kind: "opt_out" }, { rawText: "STOP" });

    try {
      await handleInboundOutreach(input1, deps1);
      throw new Error("Should have thrown");
    } catch (error) {
      expect(error instanceof Error && error.message.includes("db down")).toBe(true);
    }
    expect(deps1.calls.find((c) => c.fn === "sendText")).toBeFalsy();

    const deps2 = makeDeps({
      async closeLead(params: any) {
        deps2.calls.push({ fn: "closeLead", args: [params] });
        throw new Error("db down");
      },
    });
    const input2 = makeInput({ kind: "followup_not_now" }, { rawText: "Not now" });

    try {
      await handleInboundOutreach(input2, deps2);
      throw new Error("Should have thrown");
    } catch (error) {
      expect(error instanceof Error && error.message.includes("db down")).toBe(true);
    }
    expect(deps2.calls.find((c) => c.fn === "sendText")).toBeFalsy();
  });
});

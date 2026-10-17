/**
 * Tests for outreach service
 */

import { getOutreachStatus, sendFollowup, recordStaffConsent } from "../service.js";
import type { OutreachDeps, OutreachLead, OutreachContact } from "../service.js";
import type { ConsentRow } from "../consent.js";
import { buildClickToChatLink, renderFollowupTemplateText } from "../messages.js";

interface CallRecord {
  fn: string;
  args: any[];
}

const now = new Date("2026-10-16T12:00:00.000Z");

const grantedRow: ConsentRow = {
  channel: "whatsapp",
  scope: "follow_up",
  status: "granted",
  captured_at: "2026-10-01T00:00:00.000Z",
};

function makeDeps(overrides: Partial<OutreachDeps> = {}): OutreachDeps & { calls: CallRecord[] } {
  const calls: CallRecord[] = [];

  const defaultLead: OutreachLead = {
    id: "L1",
    contact_id: "C1",
    contact_name: "Devansh Sawant",
    origin: "Pune",
    destination: "Mumbai",
    closed_at: null,
  };

  const defaultContact: OutreachContact = {
    id: "C1",
    phone_e164: "+919082210545",
    display_name: "Devansh Sawant",
  };

  const defaults: OutreachDeps = {
    async getLead(leadId: string) {
      calls.push({ fn: "getLead", args: [leadId] });
      return defaultLead;
    },
    async getContact(contactId: string) {
      calls.push({ fn: "getContact", args: [contactId] });
      return defaultContact;
    },
    async getConsentRows(contactId: string) {
      calls.push({ fn: "getConsentRows", args: [contactId] });
      return [];
    },
    async getLastInboundAt(contactId: string) {
      calls.push({ fn: "getLastInboundAt", args: [contactId] });
      return null;
    },
    async recordConsent(params: any) {
      calls.push({ fn: "recordConsent", args: [params] });
    },
    async sendTemplate(params: any) {
      calls.push({ fn: "sendTemplate", args: [params] });
      return { wamid: "wamid.T1" };
    },
    async recordOutboundMessage(params: any) {
      calls.push({ fn: "recordOutboundMessage", args: [params] });
    },
    businessNumber: "15552048854",
  };

  return {
    ...defaults,
    ...overrides,
    calls,
  } as OutreachDeps & { calls: CallRecord[] };
}

describe("getOutreachStatus", () => {
  it("returns null when getLead returns undefined", async () => {
    const deps = makeDeps({
      async getLead() {
        deps.calls.push({ fn: "getLead", args: ["L1"] });
        return undefined;
      },
    });

    const result = await getOutreachStatus("L1", now, deps);
    expect(result).toBe(null);
  });

  it("no consent, window closed: offer click to chat", async () => {
    const deps = makeDeps();
    const result = await getOutreachStatus("L1", now, deps);

    expect(result?.action).toBe("offer_click_to_chat");
    expect(result?.consent).toBe("unknown");
    expect(result?.windowOpen).toBe(false);
    expect(result?.closed).toBe(false);
    expect(result?.clickToChatLink).toBe(
      buildClickToChatLink({ businessNumber: "15552048854", leadId: "L1" })
    );

    const deps2 = makeDeps({ businessNumber: undefined });
    const result2 = await getOutreachStatus("L1", now, deps2);
    expect(result2?.clickToChatLink).toBe(null);
  });

  it("granted row, window closed: send template", async () => {
    const deps = makeDeps({
      async getConsentRows(contactId: string) {
        deps.calls.push({ fn: "getConsentRows", args: [contactId] });
        return [grantedRow];
      },
    });

    const result = await getOutreachStatus("L1", now, deps);
    expect(result?.action).toBe("send_template");
    expect(result?.consent).toBe("granted");
    expect(result?.clickToChatLink).toBe(null);
  });

  it("last inbound 2 hours before now: reply freeform", async () => {
    const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000);
    const deps = makeDeps({
      async getLastInboundAt(contactId: string) {
        deps.calls.push({ fn: "getLastInboundAt", args: [contactId] });
        return twoHoursAgo.toISOString();
      },
    });

    const result = await getOutreachStatus("L1", now, deps);
    expect(result?.action).toBe("reply_freeform");
    expect(result?.windowOpen).toBe(true);
  });

  it("lead.contact_id null: needs human call", async () => {
    const deps = makeDeps({
      async getLead(leadId: string) {
        deps.calls.push({ fn: "getLead", args: [leadId] });
        return {
          id: "L1",
          contact_id: null,
          contact_name: "Devansh Sawant",
          origin: "Pune",
          destination: "Mumbai",
          closed_at: null,
        };
      },
    });

    const result = await getOutreachStatus("L1", now, deps);
    expect(result?.action).toBe("needs_human_call");
  });
});

describe("sendFollowup", () => {
  it("happy path with granted row", async () => {
    const deps = makeDeps({
      async getConsentRows(contactId: string) {
        deps.calls.push({ fn: "getConsentRows", args: [contactId] });
        return [grantedRow];
      },
    });

    const result = await sendFollowup("L1", now, deps);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.wamid).toBe("wamid.T1");
    }

    const sendTemplateCall = deps.calls.find((c) => c.fn === "sendTemplate");
    expect(sendTemplateCall).toBeTruthy();
    expect(sendTemplateCall?.args[0]).toEqual({
      to: "919082210545",
      templateName: "enquiry_followup",
      languageCode: "en",
      bodyParams: ["Devansh", "Pune to Mumbai"],
      buttonPayloads: ["enquiry_yes", "enquiry_not_now"],
    });

    const recordCall = deps.calls.find((c) => c.fn === "recordOutboundMessage");
    expect(recordCall).toBeTruthy();
    expect(recordCall?.args[0]).toEqual({
      leadId: "L1",
      wamid: "wamid.T1",
      body: renderFollowupTemplateText(["Devansh", "Pune to Mumbai"]),
    });
  });

  it("with no consent: not allowed", async () => {
    const deps = makeDeps();
    const result = await sendFollowup("L1", now, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_allowed");
      expect(result.action).toBe("offer_click_to_chat");
    }

    expect(deps.calls.find((c) => c.fn === "sendTemplate")).toBeFalsy();
  });

  it("on a closed lead with granted row: lead closed", async () => {
    const deps = makeDeps({
      async getLead(leadId: string) {
        deps.calls.push({ fn: "getLead", args: [leadId] });
        return {
          id: "L1",
          contact_id: "C1",
          contact_name: "Devansh Sawant",
          origin: "Pune",
          destination: "Mumbai",
          closed_at: "2026-10-15T00:00:00.000Z",
        };
      },
      async getConsentRows(contactId: string) {
        deps.calls.push({ fn: "getConsentRows", args: [contactId] });
        return [grantedRow];
      },
    });

    const result = await sendFollowup("L1", now, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("lead_closed");
    }

    expect(deps.calls.find((c) => c.fn === "sendTemplate")).toBeFalsy();
  });

  it("with granted row and last inbound 1 hour before now: not allowed", async () => {
    const oneHourAgo = new Date(now.getTime() - 1 * 3600 * 1000);
    const deps = makeDeps({
      async getConsentRows(contactId: string) {
        deps.calls.push({ fn: "getConsentRows", args: [contactId] });
        return [grantedRow];
      },
      async getLastInboundAt(contactId: string) {
        deps.calls.push({ fn: "getLastInboundAt", args: [contactId] });
        return oneHourAgo.toISOString();
      },
    });

    const result = await sendFollowup("L1", now, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("not_allowed");
      expect(result.action).toBe("reply_freeform");
    }

    expect(deps.calls.find((c) => c.fn === "sendTemplate")).toBeFalsy();
  });

  it("where sendTemplate throws error: send failed", async () => {
    const deps = makeDeps({
      async getConsentRows(contactId: string) {
        deps.calls.push({ fn: "getConsentRows", args: [contactId] });
        return [grantedRow];
      },
      async sendTemplate(params: any) {
        deps.calls.push({ fn: "sendTemplate", args: [params] });
        throw new Error("boom");
      },
    });

    const result = await sendFollowup("L1", now, deps);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("send_failed");
      expect(result.reason).toContain("boom");
    }

    expect(deps.calls.find((c) => c.fn === "recordOutboundMessage")).toBeFalsy();
  });
});

describe("recordStaffConsent", () => {
  it("with note agreed on call: ok true", async () => {
    const deps = makeDeps();
    const result = await recordStaffConsent("L1", "  agreed on call  ", now, deps);

    expect(result.ok).toBe(true);

    const consentCall = deps.calls.find((c) => c.fn === "recordConsent");
    expect(consentCall).toBeTruthy();
    expect(consentCall?.args[0]).toEqual({
      contactId: "C1",
      channel: "whatsapp",
      scope: "follow_up",
      status: "granted",
      source: "staff_recorded",
      wording: "agreed on call",
      evidenceRef: null,
      capturedAt: now.toISOString(),
    });
  });

  it("errors: recordConsent never called", async () => {
    const deps1 = makeDeps();
    const result1 = await recordStaffConsent("L1", "   ", now, deps1);
    expect(result1.ok).toBe(false);
    if (!result1.ok) {
      expect(result1.code).toBe("note_required");
    }
    expect(deps1.calls.find((c) => c.fn === "recordConsent")).toBeFalsy();

    const deps2 = makeDeps();
    const result2 = await recordStaffConsent("L1", "x".repeat(501), now, deps2);
    expect(result2.ok).toBe(false);
    if (!result2.ok) {
      expect(result2.code).toBe("note_too_long");
    }
    expect(deps2.calls.find((c) => c.fn === "recordConsent")).toBeFalsy();

    const deps3 = makeDeps({
      async getLead(leadId: string) {
        deps3.calls.push({ fn: "getLead", args: [leadId] });
        return {
          id: "L1",
          contact_id: null,
          contact_name: "Devansh Sawant",
          origin: "Pune",
          destination: "Mumbai",
          closed_at: null,
        };
      },
    });
    const result3 = await recordStaffConsent("L1", "note", now, deps3);
    expect(result3.ok).toBe(false);
    if (!result3.ok) {
      expect(result3.code).toBe("no_contact");
    }
    expect(deps3.calls.find((c) => c.fn === "recordConsent")).toBeFalsy();

    const deps4 = makeDeps({
      async getLead(leadId: string) {
        deps4.calls.push({ fn: "getLead", args: [leadId] });
        return undefined;
      },
    });
    const result4 = await recordStaffConsent("L1", "note", now, deps4);
    expect(result4.ok).toBe(false);
    if (!result4.ok) {
      expect(result4.code).toBe("lead_not_found");
    }
    expect(deps4.calls.find((c) => c.fn === "recordConsent")).toBeFalsy();
  });

  it("refuses when customer opted out", async () => {
    const withdrawnRow: ConsentRow = {
      channel: "whatsapp",
      scope: "follow_up",
      status: "withdrawn",
      captured_at: "2026-10-14T00:00:00.000Z",
    };

    // (i) getConsentRows returns withdrawn row -> {ok: false, code: opted_out}
    const deps1 = makeDeps({
      async getConsentRows(contactId: string) {
        deps1.calls.push({ fn: "getConsentRows", args: [contactId] });
        return [withdrawnRow];
      },
    });
    const result1 = await recordStaffConsent("L1", "agreed on call", now, deps1);
    expect(result1.ok).toBe(false);
    if (!result1.ok) {
      expect(result1.code).toBe("opted_out");
    }
    expect(deps1.calls.find((c) => c.fn === "recordConsent")).toBeFalsy();

    // (ii) withdrawn row plus later granted row -> ok true, recordConsent called
    const laterGrantedRow: ConsentRow = {
      channel: "whatsapp",
      scope: "follow_up",
      status: "granted",
      captured_at: "2026-10-15T00:00:00.000Z",
    };
    const deps2 = makeDeps({
      async getConsentRows(contactId: string) {
        deps2.calls.push({ fn: "getConsentRows", args: [contactId] });
        return [withdrawnRow, laterGrantedRow];
      },
    });
    const result2 = await recordStaffConsent("L1", "agreed on call", now, deps2);
    expect(result2.ok).toBe(true);
    expect(deps2.calls.find((c) => c.fn === "recordConsent")).toBeTruthy();
  });
});

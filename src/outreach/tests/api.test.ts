/**
 * Tests for outreach API orchestration layer
 */

import { createOutreachApi } from "../api.js";
import type { OutreachApiDeps, ConsentHistoryRow } from "../api.js";
import type {
  OutreachLead,
  OutreachContact,
  OutreachStatus,
} from "../service.js";
import type { ConsentRow } from "../consent.js";

interface CallRecord {
  fn: string;
  args: unknown[];
}

const grantedRow: ConsentRow = {
  channel: "whatsapp",
  scope: "follow_up",
  status: "granted",
  captured_at: new Date("2026-10-01T00:00:00.000Z"),
};

function makeDeps(overrides: Partial<OutreachApiDeps> = {}): OutreachApiDeps & { calls: CallRecord[] } {
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

  const deps: OutreachApiDeps & { calls: CallRecord[] } = {
    calls,
    getLead: async (leadId: string) => {
      calls.push({ fn: "getLead", args: [leadId] });
      if (overrides.getLead) {
        return overrides.getLead(leadId);
      }
      return defaultLead;
    },
    getContact: async (contactId: string) => {
      calls.push({ fn: "getContact", args: [contactId] });
      if (overrides.getContact) {
        return overrides.getContact(contactId);
      }
      return defaultContact;
    },
    getConsentRows: async (contactId: string) => {
      calls.push({ fn: "getConsentRows", args: [contactId] });
      if (overrides.getConsentRows) {
        return overrides.getConsentRows(contactId);
      }
      return [];
    },
    getLastInboundAt: async (contactId: string) => {
      calls.push({ fn: "getLastInboundAt", args: [contactId] });
      if (overrides.getLastInboundAt) {
        return overrides.getLastInboundAt(contactId);
      }
      return null;
    },
    recordConsent: async (params) => {
      calls.push({ fn: "recordConsent", args: [params] });
      if (overrides.recordConsent) {
        return overrides.recordConsent(params);
      }
    },
    sendTemplate: async (params) => {
      calls.push({ fn: "sendTemplate", args: [params] });
      if (overrides.sendTemplate) {
        return overrides.sendTemplate(params);
      }
      return { wamid: "wamid.T1" };
    },
    recordOutboundMessage: async (params) => {
      calls.push({ fn: "recordOutboundMessage", args: [params] });
      if (overrides.recordOutboundMessage) {
        return overrides.recordOutboundMessage(params);
      }
    },
    getConsentHistory: async (contactId: string) => {
      calls.push({ fn: "getConsentHistory", args: [contactId] });
      if (overrides.getConsentHistory) {
        return overrides.getConsentHistory(contactId);
      }
      return [];
    },
    businessNumber: overrides.businessNumber ?? "15552048854",
  };

  return deps;
}

const now = new Date("2026-10-18T12:00:00.000Z");

describe("OutreachApi", () => {
  it("should return 404 when lead not found", async () => {
    const deps = makeDeps({
      getLead: async () => undefined,
    });

    const api = createOutreachApi(deps, () => now);
    const result = await api.getStatus("L1");

    expect(result).toEqual({
      status: 404,
      json: { error: "lead not found" },
    });
  });

  it("should return status 200 with action and capabilities", async () => {
    const deps = makeDeps({
      getConsentRows: async () => [],
      getLastInboundAt: async () => null,
    });

    const api = createOutreachApi(deps, () => now);
    const result = await api.getStatus("L1");

    expect(result.status).toBe(200);
    const json = result.json as Record<string, unknown>;
    const status = json.status as OutreachStatus;
    expect(status.action).toBe("offer_click_to_chat");
    expect(json.capabilities).toEqual({
      canSendFollowup: false,
      canRecordConsent: true,
      canCopyLink: true,
    });
    expect(json.history).toEqual([]);
  });

  it("should normalize history: drop invalid dates, sort newest first, truncate wording", async () => {
    const historyRows: ConsentHistoryRow[] = [];

    for (let i = 1; i <= 12; i++) {
      historyRows.push({
        status: "granted",
        source: "staff_recorded",
        wording: "note",
        captured_at: `2026-10-${String(i).padStart(2, "0")}T00:00:00.000Z`,
      });
    }

    historyRows[0] = {
      ...historyRows[0],
      captured_at: new Date("2026-10-01T00:00:00.000Z"),
    };

    historyRows[1] = {
      ...historyRows[1],
      captured_at: new Date("2026-10-02T00:00:00.000Z"),
    };

    historyRows.push({
      status: "granted",
      source: "staff_recorded",
      wording: "note",
      captured_at: "garbage",
    });

    historyRows[11] = {
      status: "granted",
      source: "staff_recorded",
      wording: "x".repeat(400),
      captured_at: "2026-10-12T00:00:00.000Z",
    };

    const deps = makeDeps({
      getConsentHistory: async () => historyRows,
    });

    const api = createOutreachApi(deps, () => now);
    const result = await api.getStatus("L1");

    expect(result.status).toBe(200);
    const json = result.json as Record<string, unknown>;
    const history = json.history as Array<{ status: string; source: string; wording: string | null; captured_at: string }>;

    expect(history.length).toBe(10);
    expect(history[0].captured_at).toBe("2026-10-12T00:00:00.000Z");
    expect(typeof history[0].captured_at).toBe("string");
    expect(history.find((h) => h.captured_at === "garbage")).toBeUndefined();
    expect(history[0].wording?.length).toBe(300);
  });

  it("should record consent with staff name", async () => {
    const deps = makeDeps();

    const api = createOutreachApi(deps, () => now);
    const result = await api.postConsent("L1", {
      note: "  agreed on call ",
      staff: "admin@x.com",
    });

    expect(result.status).toBe(200);
    expect(result.json).toEqual({ ok: true });

    const consentCall = deps.calls.find((c) => c.fn === "recordConsent");
    expect(consentCall).toBeDefined();
    if (consentCall) {
      const params = consentCall.args[0] as Record<string, unknown>;
      expect(params.wording).toBe("agreed on call [recorded by admin@x.com]");
      expect(params.source).toBe("staff_recorded");
      expect(params.contactId).toBe("C1");
    }
  });

  it("should return 400 for invalid consent bodies", async () => {
    const deps = makeDeps();
    const api = createOutreachApi(deps, () => now);

    const bodies = [null, "x", {}, { note: 5 }, { note: "   " }];

    for (const body of bodies) {
      const result = await api.postConsent("L1", body);
      expect(result.status).toBe(400);
      expect((result.json as Record<string, unknown>).code).toBe("note_required");
    }

    const longResult = await api.postConsent("L1", { note: "x".repeat(401) });
    expect(longResult.status).toBe(400);
    expect((longResult.json as Record<string, unknown>).code).toBe("note_too_long");

    const recordConsentCalls = deps.calls.filter((c) => c.fn === "recordConsent");
    expect(recordConsentCalls.length).toBe(0);
  });

  it("should return 409 when customer opted out", async () => {
    const withdrawnRow: ConsentRow = {
      channel: "whatsapp",
      scope: "follow_up",
      status: "withdrawn",
      captured_at: new Date("2026-10-15T00:00:00.000Z"),
    };

    const deps = makeDeps({
      getConsentRows: async () => [withdrawnRow],
    });

    const api = createOutreachApi(deps, () => now);
    const result = await api.postConsent("L1", { note: "agreed" });

    expect(result.status).toBe(409);
    expect((result.json as Record<string, unknown>).code).toBe("opted_out");

    const recordConsentCalls = deps.calls.filter((c) => c.fn === "recordConsent");
    expect(recordConsentCalls.length).toBe(0);
  });

  it("should send followup with granted consent", async () => {
    const deps = makeDeps({
      getConsentRows: async () => [grantedRow],
    });

    const api = createOutreachApi(deps, () => now);
    const result = await api.postFollowup("L1");

    expect(result.status).toBe(200);
    expect(result.json).toEqual({ ok: true, wamid: "wamid.T1" });

    expect(deps.calls.find((c) => c.fn === "sendTemplate")).toBeDefined();
    expect(deps.calls.find((c) => c.fn === "recordOutboundMessage")).toBeDefined();
  });

  it("should return 409 not_allowed when no consent", async () => {
    const deps = makeDeps({
      getConsentRows: async () => [],
      getLastInboundAt: async () => null,
    });

    const api = createOutreachApi(deps, () => now);
    const result = await api.postFollowup("L1");

    expect(result.status).toBe(409);
    const json = result.json as Record<string, unknown>;
    expect(json.code).toBe("not_allowed");
    expect(json.action).toBe("offer_click_to_chat");
    expect(typeof json.reason).toBe("string");
    expect((json.reason as string).length).toBeGreaterThan(0);

    const sendTemplateCalls = deps.calls.filter((c) => c.fn === "sendTemplate");
    expect(sendTemplateCalls.length).toBe(0);
  });

  it("should return 502 send_failed when template throws", async () => {
    const deps = makeDeps({
      getConsentRows: async () => [grantedRow],
      sendTemplate: async () => {
        throw new Error("boom");
      },
    });

    const api = createOutreachApi(deps, () => now);
    const result = await api.postFollowup("L1");

    expect(result.status).toBe(502);
    const json = result.json as Record<string, unknown>;
    expect(json.code).toBe("send_failed");
    expect((json.reason as string).includes("boom")).toBe(true);
  });

  it("should return 409 lead_closed for closed lead and 404 for missing lead", async () => {
    const closedLead: OutreachLead = {
      id: "L1",
      contact_id: "C1",
      contact_name: "Devansh Sawant",
      origin: "Pune",
      destination: "Mumbai",
      closed_at: "2026-10-15T00:00:00.000Z",
    };

    const deps1 = makeDeps({
      getLead: async () => closedLead,
      getConsentRows: async () => [grantedRow],
    });

    const api1 = createOutreachApi(deps1, () => now);
    const result1 = await api1.postFollowup("L1");

    expect(result1.status).toBe(409);
    expect((result1.json as Record<string, unknown>).code).toBe("lead_closed");

    const deps2 = makeDeps({
      getLead: async () => undefined,
    });

    const api2 = createOutreachApi(deps2, () => now);
    const result2 = await api2.postFollowup("L1");

    expect(result2.status).toBe(404);
    expect((result2.json as Record<string, unknown>).code).toBe("lead_not_found");
  });
});

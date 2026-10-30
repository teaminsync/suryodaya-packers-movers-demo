/**
 * Tests for automation API
 */

import { describe, it, expect } from "@jest/globals";
import { createAutomationApi, type AutomationApiDeps } from "../api.js";
import type { AutomationConfig } from "../config.js";
import type { FollowupSnapshot } from "../rules.js";

describe("createAutomationApi", () => {
  const cfg: AutomationConfig = {
    enabled: true,
    dryRun: false,
    tickMinutes: 5,
    dailyCap: 20,
    sendFromHour: 9,
    sendUntilHour: 20,
    nudgeInWindowHours: 22,
    nudgeTemplateHours: 48,
    missingDetailsHours: 3,
    reminderHoursBefore: 24,
    reminderLateHours: 3,
    maxNudges: 2,
  };

  it("returns 404 when snapshot is null", async () => {
    const deps: AutomationApiDeps = {
      getConfig: () => cfg,
      loadSnapshot: async () => null,
      listHistory: async () => [],
      insertCancelled: async () => "inserted",
      now: () => new Date(),
    };

    const api = createAutomationApi(deps);
    const result = await api.getAutomation("lead1");

    expect(result.status).toBe(404);
    expect((result.json as any).code).toBe("not_found");
  });

  it("returns upcoming actions with labels", async () => {
    const now = new Date("2024-01-20T14:00:00+05:30");
    const lastInbound = new Date("2024-01-19T12:00:00+05:30");
    
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const deps: AutomationApiDeps = {
      getConfig: () => cfg,
      loadSnapshot: async () => snap,
      listHistory: async () => [],
      insertCancelled: async () => "inserted",
      now: () => now,
    };

    const api = createAutomationApi(deps);
    const result = await api.getAutomation("lead1");

    expect(result.status).toBe(200);
    const json = result.json as any;
    expect(json.ok).toBe(true);
    expect(json.enabled).toBe(true);
    expect(json.dryRun).toBe(false);
    expect(json.upcoming.length).toBeGreaterThan(0);
    expect(json.upcoming[0]).toHaveProperty("kind");
    expect(json.upcoming[0]).toHaveProperty("label");
    expect(json.upcoming[0]).toHaveProperty("dueAt");
    expect(json.upcoming[0]).toHaveProperty("expiresAt");
  });

  it("excludes forceSkip actions from upcoming", async () => {
    const now = new Date("2024-01-21T22:00:00+05:30");
    const lastInbound = new Date("2024-01-20T23:00:00+05:30");
    
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const deps: AutomationApiDeps = {
      getConfig: () => cfg,
      loadSnapshot: async () => snap,
      listHistory: async () => [],
      insertCancelled: async () => "inserted",
      now: () => now,
    };

    const api = createAutomationApi(deps);
    const result = await api.getAutomation("lead1");

    const json = result.json as any;
    expect(json.upcoming.some((a: any) => a.kind === "nudge_inwindow")).toBe(false);
  });

  it("excludes expired actions from upcoming", async () => {
    const now = new Date("2024-01-21T14:00:00+05:30");
    const lastInbound = new Date("2024-01-20T10:00:00+05:30");
    
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: null, destination: null, moveType: "local", urgency: null, estimatedVolume: "unknown" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const deps: AutomationApiDeps = {
      getConfig: () => cfg,
      loadSnapshot: async () => snap,
      listHistory: async () => [],
      insertCancelled: async () => "inserted",
      now: () => now,
    };

    const api = createAutomationApi(deps);
    const result = await api.getAutomation("lead1");

    const json = result.json as any;
    const missingDetails = json.upcoming.find((a: any) => a.kind === "missing_details");
    expect(missingDetails).toBeUndefined();
  });

  it("maps history with labels", async () => {
    const now = new Date("2024-01-20T14:00:00+05:30");
    const lastInbound = new Date("2024-01-19T12:00:00+05:30");
    
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const deps: AutomationApiDeps = {
      getConfig: () => cfg,
      loadSnapshot: async () => snap,
      listHistory: async () => [{
        id: "h1",
        kind: "nudge_inwindow",
        status: "sent",
        reason: null,
        channel: "freeform",
        templateName: null,
        dueAt: "2024-01-20T10:00:00+05:30",
        processedAt: "2024-01-20T10:05:00+05:30",
      }],
      insertCancelled: async () => "inserted",
      now: () => now,
    };

    const api = createAutomationApi(deps);
    const result = await api.getAutomation("lead1");

    const json = result.json as any;
    expect(json.history.length).toBe(1);
    expect(json.history[0].kind).toBe("nudge_inwindow");
    expect(json.history[0].label).toBe("Check-in message");
  });

  it("validates cancel body", async () => {
    const deps: AutomationApiDeps = {
      getConfig: () => cfg,
      loadSnapshot: async () => null,
      listHistory: async () => [],
      insertCancelled: async () => "inserted",
      now: () => new Date(),
    };

    const api = createAutomationApi(deps);

    expect((await api.cancelAction("lead1", null)).status).toBe(400);
    expect((await api.cancelAction("lead1", "string")).status).toBe(400);
    expect((await api.cancelAction("lead1", { kind: "bad_kind", ref: "ref" })).status).toBe(400);
    expect((await api.cancelAction("lead1", { kind: "nudge_inwindow", ref: "" })).status).toBe(400);
    expect((await api.cancelAction("lead1", { kind: "nudge_inwindow", ref: "a".repeat(201) })).status).toBe(400);
  });

  it("sanitises staff field", async () => {
    const now = new Date("2024-01-20T14:00:00+05:30");
    const lastInbound = new Date("2024-01-19T12:00:00+05:30");
    
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    let reason: string | null = null;
    const deps: AutomationApiDeps = {
      getConfig: () => cfg,
      loadSnapshot: async () => snap,
      listHistory: async () => [],
      insertCancelled: async (a) => { reason = a.reason; return "inserted"; },
      now: () => now,
    };

    const api = createAutomationApi(deps);
    await api.cancelAction("lead1", { kind: "nudge_inwindow", ref: lastInbound.toISOString(), staff: "  John   Doe  " });

    expect(reason).toBe("cancelled by John Doe");
  });

  it("returns 404 when snapshot null for cancel", async () => {
    const deps: AutomationApiDeps = {
      getConfig: () => cfg,
      loadSnapshot: async () => null,
      listHistory: async () => [],
      insertCancelled: async () => "inserted",
      now: () => new Date(),
    };

    const api = createAutomationApi(deps);
    const result = await api.cancelAction("lead1", { kind: "nudge_inwindow", ref: "ref" });

    expect(result.status).toBe(404);
    expect((result.json as any).code).toBe("not_found");
  });

  it("returns 409 when action not in plan", async () => {
    const now = new Date("2024-01-20T14:00:00+05:30");
    const lastInbound = new Date("2024-01-19T12:00:00+05:30");
    
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const deps: AutomationApiDeps = {
      getConfig: () => cfg,
      loadSnapshot: async () => snap,
      listHistory: async () => [],
      insertCancelled: async () => "inserted",
      now: () => now,
    };

    const api = createAutomationApi(deps);
    const result = await api.cancelAction("lead1", { kind: "survey_reminder", ref: "nonexistent" });

    expect(result.status).toBe(409);
    expect((result.json as any).code).toBe("not_cancellable");
  });

  it("returns 409 when already processed", async () => {
    const now = new Date("2024-01-20T14:00:00+05:30");
    const lastInbound = new Date("2024-01-19T12:00:00+05:30");
    
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const deps: AutomationApiDeps = {
      getConfig: () => cfg,
      loadSnapshot: async () => snap,
      listHistory: async () => [],
      insertCancelled: async () => "exists",
      now: () => now,
    };

    const api = createAutomationApi(deps);
    const result = await api.cancelAction("lead1", { kind: "nudge_inwindow", ref: lastInbound.toISOString() });

    expect(result.status).toBe(409);
    expect((result.json as any).code).toBe("already_processed");
  });

  it("returns 200 on successful cancel", async () => {
    const now = new Date("2024-01-20T14:00:00+05:30");
    const lastInbound = new Date("2024-01-19T12:00:00+05:30");
    
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const deps: AutomationApiDeps = {
      getConfig: () => cfg,
      loadSnapshot: async () => snap,
      listHistory: async () => [],
      insertCancelled: async () => "inserted",
      now: () => now,
    };

    const api = createAutomationApi(deps);
    const result = await api.cancelAction("lead1", { kind: "nudge_inwindow", ref: lastInbound.toISOString() });

    expect(result.status).toBe(200);
    expect((result.json as any).ok).toBe(true);
  });
});

/**
 * Tests for follow-up scheduler
 */

import { describe, it, expect } from "@jest/globals";
import { runFollowupTick, type SchedulerDeps } from "../scheduler.js";
import type { AutomationConfig } from "../config.js";
import type { FollowupSnapshot } from "../rules.js";

describe("runFollowupTick", () => {
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

  it("returns zeros when disabled", async () => {
    const deps: SchedulerDeps = {
      now: () => new Date(),
      config: { ...cfg, enabled: false },
      listCandidateLeadIds: async () => [],
      loadSnapshot: async () => null,
      countSentToday: async () => 0,
      claim: async () => true,
      recordSkipped: async () => {},
      markSent: async () => {},
      markFailed: async () => {},
      sendFreeform: async () => ({ wamid: null }),
      sendTemplate: async () => ({ wamid: null }),
      log: () => {},
    };

    const result = await runFollowupTick(deps);
    expect(result).toEqual({ considered: 0, sent: 0, skipped: 0, failed: 0, stoppedByCap: false, dryRun: 0 });
  });

  it("sends freeform when window open", async () => {
    const now = new Date("2024-01-20T14:00:00+05:30");
    const lastInbound = new Date("2024-01-20T10:00:00+05:30");
    
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: null, destination: null, moveType: "local", urgency: null, estimatedVolume: "unknown" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    let sentCount = 0;
    const deps: SchedulerDeps = {
      now: () => now,
      config: cfg,
      listCandidateLeadIds: async () => ["lead1"],
      loadSnapshot: async () => snap,
      countSentToday: async () => 0,
      claim: async () => true,
      recordSkipped: async () => {},
      markSent: async (a) => {
        expect(a.channel).toBe("freeform");
        sentCount++;
      },
      markFailed: async () => {},
      sendFreeform: async () => ({ wamid: "wam1" }),
      sendTemplate: async () => ({ wamid: null }),
      log: () => {},
    };

    const result = await runFollowupTick(deps);
    expect(result.sent).toBe(1);
    expect(sentCount).toBe(1);
  });

  it("skips nudge_template when window open", async () => {
    const now = new Date("2024-01-20T14:00:00+05:30");
    const lastInbound = new Date("2024-01-20T08:00:00+05:30");
    
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const skippedRecords: Array<{ kind: string; reason: string }> = [];
    const sentKinds: string[] = [];
    const deps: SchedulerDeps = {
      now: () => now,
      config: { ...cfg, nudgeTemplateHours: 5 },
      listCandidateLeadIds: async () => ["lead1"],
      loadSnapshot: async () => snap,
      countSentToday: async () => 0,
      claim: async () => true,
      recordSkipped: async (a) => { skippedRecords.push({ kind: a.kind, reason: a.reason }); },
      markSent: async (a) => { sentKinds.push(a.kind); },
      markFailed: async () => {},
      sendFreeform: async () => ({ wamid: null }),
      sendTemplate: async () => ({ wamid: null }),
      log: () => {},
    };

    await runFollowupTick(deps);
    expect(skippedRecords.some(r => r.kind === "nudge_template" && r.reason === "window_open")).toBe(true);
    expect(sentKinds.includes("nudge_template")).toBe(false);
  });

  it("expired actions write no row", async () => {
    const now = new Date("2024-01-20T14:00:00+05:30");
    const lastInbound = new Date("2024-01-18T10:00:00+05:30");
    
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const skippedRecords: Array<{ kind: string; reason: string }> = [];
    const deps: SchedulerDeps = {
      now: () => now,
      config: cfg,
      listCandidateLeadIds: async () => ["lead1"],
      loadSnapshot: async () => snap,
      countSentToday: async () => 0,
      claim: async () => true,
      recordSkipped: async (a) => { skippedRecords.push({ kind: a.kind, reason: a.reason }); },
      markSent: async () => {},
      markFailed: async () => {},
      sendFreeform: async () => ({ wamid: null }),
      sendTemplate: async () => ({ wamid: null }),
      log: () => {},
    };

    await runFollowupTick(deps);
    expect(skippedRecords.filter(r => r.reason === "expired").length).toBe(0);
    expect(skippedRecords.filter(r => r.kind === "nudge_inwindow").length).toBe(0);
  });

  it("skips when consent unknown", async () => {
    const now = new Date("2024-01-20T14:00:00+05:30");
    const lastInbound = new Date("2024-01-18T10:00:00+05:30");
    
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "unknown",
      booking: null,
      existing: [],
    };

    const skippedRecords: Array<{ kind: string; reason: string }> = [];
    const deps: SchedulerDeps = {
      now: () => now,
      config: cfg,
      listCandidateLeadIds: async () => ["lead1"],
      loadSnapshot: async () => snap,
      countSentToday: async () => 0,
      claim: async () => true,
      recordSkipped: async (a) => { skippedRecords.push({ kind: a.kind, reason: a.reason }); },
      markSent: async () => {},
      markFailed: async () => {},
      sendFreeform: async () => ({ wamid: null }),
      sendTemplate: async () => ({ wamid: null }),
      log: () => {},
    };

    await runFollowupTick(deps);
    expect(skippedRecords.some(r => r.kind === "nudge_template" && r.reason === "no_consent")).toBe(true);
  });

  it("skips when opted out", async () => {
    const now = new Date("2024-01-20T14:00:00+05:30");
    const lastInbound = new Date("2024-01-18T10:00:00+05:30");
    
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "withdrawn",
      booking: null,
      existing: [],
    };

    const skippedRecords: Array<{ kind: string; reason: string }> = [];
    const sentKinds: string[] = [];
    const claimedActions: string[] = [];
    const deps: SchedulerDeps = {
      now: () => now,
      config: cfg,
      listCandidateLeadIds: async () => ["lead1"],
      loadSnapshot: async () => snap,
      countSentToday: async () => 0,
      claim: async (a) => { claimedActions.push(a.kind); return true; },
      recordSkipped: async (a) => { skippedRecords.push({ kind: a.kind, reason: a.reason }); },
      markSent: async (a) => { sentKinds.push(a.kind); },
      markFailed: async () => {},
      sendFreeform: async () => ({ wamid: null }),
      sendTemplate: async () => ({ wamid: null }),
      log: () => {},
    };

    await runFollowupTick(deps);
    expect(sentKinds.length).toBe(0);
    expect(skippedRecords.length).toBe(0);
    expect(claimedActions.length).toBe(0);
  });

  it("skips expired actions", async () => {
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

    const skippedRecords: Array<{ kind: string; reason: string }> = [];
    let logOutput: string[] = [];
    const deps: SchedulerDeps = {
      now: () => now,
      config: cfg,
      listCandidateLeadIds: async () => ["lead1"],
      loadSnapshot: async () => snap,
      countSentToday: async () => 0,
      claim: async () => true,
      recordSkipped: async (a) => { skippedRecords.push({ kind: a.kind, reason: a.reason }); },
      markSent: async () => {},
      markFailed: async () => {},
      sendFreeform: async () => ({ wamid: null }),
      sendTemplate: async () => ({ wamid: null }),
      log: (msg) => { logOutput.push(msg); },
    };

    await runFollowupTick(deps);
    expect(skippedRecords.filter(r => r.kind === "missing_details" && r.reason === "expired").length).toBe(0);
    expect(logOutput.some(l => l.includes("[Followups] expired, not sent"))).toBe(true);
  });

  it("skips when forceSkip is set", async () => {
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

    const skippedRecords: Array<{ kind: string; reason: string }> = [];
    const deps: SchedulerDeps = {
      now: () => now,
      config: cfg,
      listCandidateLeadIds: async () => ["lead1"],
      loadSnapshot: async () => snap,
      countSentToday: async () => 0,
      claim: async () => true,
      recordSkipped: async (a) => { skippedRecords.push({ kind: a.kind, reason: a.reason }); },
      markSent: async () => {},
      markFailed: async () => {},
      sendFreeform: async () => ({ wamid: null }),
      sendTemplate: async () => ({ wamid: null }),
      log: () => {},
    };

    await runFollowupTick(deps);
    expect(skippedRecords.some(r => r.kind === "nudge_inwindow" && r.reason === "quiet_hours")).toBe(true);
  });

  it("sends nothing when claim returns false", async () => {
    const now = new Date("2024-01-20T14:00:00+05:30");
    const lastInbound = new Date("2024-01-20T10:00:00+05:30");
    
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: null, destination: null, moveType: "local", urgency: null, estimatedVolume: "unknown" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const deps: SchedulerDeps = {
      now: () => now,
      config: cfg,
      listCandidateLeadIds: async () => ["lead1"],
      loadSnapshot: async () => snap,
      countSentToday: async () => 0,
      claim: async () => false,
      recordSkipped: async () => {},
      markSent: async () => {},
      markFailed: async () => {},
      sendFreeform: async () => ({ wamid: null }),
      sendTemplate: async () => ({ wamid: null }),
      log: () => {},
    };

    const result = await runFollowupTick(deps);
    expect(result.sent).toBe(0);
  });

  it("marks failed when send throws", async () => {
    const now = new Date("2024-01-20T14:00:00+05:30");
    const lastInbound = new Date("2024-01-20T10:00:00+05:30");
    
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: null, destination: null, moveType: "local", urgency: null, estimatedVolume: "unknown" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    let failedError: string | null = null;
    const deps: SchedulerDeps = {
      now: () => now,
      config: cfg,
      listCandidateLeadIds: async () => ["lead1"],
      loadSnapshot: async () => snap,
      countSentToday: async () => 0,
      claim: async () => true,
      recordSkipped: async () => {},
      markSent: async () => {},
      markFailed: async (a) => { failedError = a.error; },
      sendFreeform: async () => { throw new Error("Network error"); },
      sendTemplate: async () => ({ wamid: null }),
      log: () => {},
    };

    const result = await runFollowupTick(deps);
    expect(result.failed).toBe(1);
    expect(failedError).toContain("Network error");
    expect(failedError!.length).toBeLessThanOrEqual(200);
  });

  it("stops at daily cap", async () => {
    const now = new Date("2024-01-20T14:00:00+05:30");
    const lastInbound = new Date("2024-01-20T10:00:00+05:30");
    
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: null, destination: null, moveType: "local", urgency: null, estimatedVolume: "unknown" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const deps: SchedulerDeps = {
      now: () => now,
      config: { ...cfg, dailyCap: 0 },
      listCandidateLeadIds: async () => ["lead1"],
      loadSnapshot: async () => snap,
      countSentToday: async () => 0,
      claim: async () => true,
      recordSkipped: async () => {},
      markSent: async () => {},
      markFailed: async () => {},
      sendFreeform: async () => ({ wamid: null }),
      sendTemplate: async () => ({ wamid: null }),
      log: () => {},
    };

    const result = await runFollowupTick(deps);
    expect(result.stoppedByCap).toBe(true);
    expect(result.sent).toBe(0);
  });

  it("dry run records nothing", async () => {
    const now = new Date("2024-01-20T14:00:00+05:30");
    const lastInbound = new Date("2024-01-20T10:00:00+05:30");
    
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: null, destination: null, moveType: "local", urgency: null, estimatedVolume: "unknown" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    let sent = 0;
    const deps: SchedulerDeps = {
      now: () => now,
      config: { ...cfg, dryRun: true },
      listCandidateLeadIds: async () => ["lead1"],
      loadSnapshot: async () => snap,
      countSentToday: async () => 0,
      claim: async () => true,
      recordSkipped: async () => {},
      markSent: async () => { sent++; },
      markFailed: async () => {},
      sendFreeform: async () => ({ wamid: null }),
      sendTemplate: async () => ({ wamid: null }),
      log: () => {},
    };

    const result = await runFollowupTick(deps);
    expect(result.dryRun).toBeGreaterThan(0);
    expect(result.sent).toBe(0);
    expect(sent).toBe(0);
  });

  it("one lead throwing does not stop next lead", async () => {
    const now = new Date("2024-01-20T14:00:00+05:30");
    const lastInbound = new Date("2024-01-20T10:00:00+05:30");
    
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: null, destination: null, moveType: "local", urgency: null, estimatedVolume: "unknown" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    let loadCount = 0;
    const deps: SchedulerDeps = {
      now: () => now,
      config: cfg,
      listCandidateLeadIds: async () => ["lead1", "lead2"],
      loadSnapshot: async (id) => {
        loadCount++;
        if (id === "lead1") throw new Error("Load failed");
        return snap;
      },
      countSentToday: async () => 0,
      claim: async () => true,
      recordSkipped: async () => {},
      markSent: async () => {},
      markFailed: async () => {},
      sendFreeform: async () => ({ wamid: null }),
      sendTemplate: async () => ({ wamid: null }),
      log: () => {},
    };

    await runFollowupTick(deps);
    expect(loadCount).toBe(2);
  });

  it("sends template when window closed and consent granted", async () => {
    const now = new Date("2024-01-22T14:00:00+05:30");
    const surveyStart = new Date("2024-01-23T10:00:00+05:30");
    const lastInbound = new Date("2024-01-20T10:00:00+05:30");
    
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "booked", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: { offerId: "o1", startsAt: surveyStart, confirmedAt: null },
      existing: [],
    };

    let channel: string | null = null;
    const deps: SchedulerDeps = {
      now: () => now,
      config: cfg,
      listCandidateLeadIds: async () => ["lead1"],
      loadSnapshot: async () => snap,
      countSentToday: async () => 0,
      claim: async () => true,
      recordSkipped: async () => {},
      markSent: async (a) => { channel = a.channel; },
      markFailed: async () => {},
      sendFreeform: async () => ({ wamid: null }),
      sendTemplate: async () => ({ wamid: "wam1" }),
      log: () => {},
    };

    const result = await runFollowupTick(deps);
    expect(result.sent).toBe(1);
    expect(channel).toBe("template");
  });
});

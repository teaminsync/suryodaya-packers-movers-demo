/**
 * Tests for follow-up planning rules
 */

import { describe, it, expect } from "@jest/globals";
import { shiftIntoSendHours, missingDetailLabels, planFollowups, isExpired, type FollowupSnapshot } from "../rules.js";
import type { AutomationConfig } from "../config.js";

describe("shiftIntoSendHours", () => {
  it("leaves time inside hours unchanged", () => {
    const due = new Date("2024-01-15T10:00:00+05:30"); // IST
    const result = shiftIntoSendHours(due, 9, 20);
    expect(result).toEqual(due);
  });

  it("shifts early morning to 09:00 same day", () => {
    const due = new Date("2024-01-15T02:30:00+05:30"); // 02:30 IST
    const result = shiftIntoSendHours(due, 9, 20);
    const expected = new Date("2024-01-15T09:00:00+05:30");
    expect(result.toISOString()).toBe(expected.toISOString());
  });

  it("shifts late evening to 09:00 next day", () => {
    const due = new Date("2024-01-15T21:00:00+05:30"); // 21:00 IST
    const result = shiftIntoSendHours(due, 9, 20);
    const expected = new Date("2024-01-16T09:00:00+05:30");
    expect(result.toISOString()).toBe(expected.toISOString());
  });

  it("handles sendUntil=24 without shifting late", () => {
    const due = new Date("2024-01-15T23:00:00+05:30"); // 23:00 IST
    const result = shiftIntoSendHours(due, 9, 24);
    expect(result).toEqual(due);
  });
});

describe("missingDetailLabels", () => {
  it("returns empty when all present", () => {
    const labels = missingDetailLabels({
      origin: "Pune",
      destination: "Mumbai",
      estimatedVolume: "2bhk",
      urgency: "medium",
    });
    expect(labels).toEqual([]);
  });

  it("detects missing origin", () => {
    const labels = missingDetailLabels({
      origin: null,
      destination: "Mumbai",
      estimatedVolume: "2bhk",
      urgency: "medium",
    });
    expect(labels).toEqual(["pickup city"]);
  });

  it("detects missing destination", () => {
    const labels = missingDetailLabels({
      origin: "Pune",
      destination: "",
      estimatedVolume: "2bhk",
      urgency: "medium",
    });
    expect(labels).toEqual(["destination city"]);
  });

  it('counts "unknown" volume as missing', () => {
    const labels = missingDetailLabels({
      origin: "Pune",
      destination: "Mumbai",
      estimatedVolume: "unknown",
      urgency: "medium",
    });
    expect(labels).toEqual(["home size"]);
  });

  it("detects missing urgency", () => {
    const labels = missingDetailLabels({
      origin: "Pune",
      destination: "Mumbai",
      estimatedVolume: "2bhk",
      urgency: null,
    });
    expect(labels).toEqual(["move timing"]);
  });

  it("returns labels in correct order", () => {
    const labels = missingDetailLabels({
      origin: null,
      destination: null,
      estimatedVolume: "unknown",
      urgency: null,
    });
    expect(labels).toEqual(["pickup city", "destination city", "home size", "move timing"]);
  });

  it("treats blank strings as missing", () => {
    const labels = missingDetailLabels({
      origin: "  ",
      destination: " ",
      estimatedVolume: "   ",
      urgency: "  ",
    });
    expect(labels).toEqual(["pickup city", "destination city", "home size", "move timing"]);
  });
});

describe("planFollowups", () => {
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

  const now = new Date("2024-01-20T14:00:00+05:30");

  it("plans nudge_inwindow with correct dueAt and expiresAt", () => {
    const lastInbound = new Date("2024-01-19T12:00:00+05:30");
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const actions = planFollowups(snap, cfg, now);
    const nudgeInwindow = actions.find(a => a.kind === "nudge_inwindow");

    expect(nudgeInwindow).toBeDefined();
    expect(nudgeInwindow!.ref).toBe(lastInbound.toISOString());
    expect(nudgeInwindow!.dueAt.getTime()).toBe(lastInbound.getTime() + 22 * 3600 * 1000);
    expect(nudgeInwindow!.expiresAt.getTime()).toBe(lastInbound.getTime() + 24 * 3600 * 1000 - 30 * 60 * 1000);
  });

  it("plans nudge_template with correct timing", () => {
    const lastInbound = new Date("2024-01-18T10:00:00+05:30");
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const actions = planFollowups(snap, cfg, now);
    const nudgeTemplate = actions.find(a => a.kind === "nudge_template");

    expect(nudgeTemplate).toBeDefined();
    expect(nudgeTemplate!.dueAt.getTime()).toBe(lastInbound.getTime() + 48 * 3600 * 1000);
    expect(nudgeTemplate!.expiresAt.getTime()).toBe(lastInbound.getTime() + 7 * 24 * 3600 * 1000);
  });

  it("removes nudges when lead is closed", () => {
    const lastInbound = new Date("2024-01-19T12:00:00+05:30");
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: "2024-01-20T10:00:00+05:30", origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const actions = planFollowups(snap, cfg, now);
    expect(actions.filter(a => a.kind === "nudge_inwindow" || a.kind === "nudge_template")).toEqual([]);
  });

  it("removes nudges when lead is booked", () => {
    const lastInbound = new Date("2024-01-19T12:00:00+05:30");
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "booked", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const actions = planFollowups(snap, cfg, now);
    expect(actions.filter(a => a.kind === "nudge_inwindow" || a.kind === "nudge_template")).toEqual([]);
  });

  it("removes nudges when humanTakeover is true", () => {
    const lastInbound = new Date("2024-01-19T12:00:00+05:30");
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: true, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const actions = planFollowups(snap, cfg, now);
    expect(actions.filter(a => a.kind === "nudge_inwindow" || a.kind === "nudge_template")).toEqual([]);
  });

  it("removes nudges when phoneE164 is null", () => {
    const lastInbound = new Date("2024-01-19T12:00:00+05:30");
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: null, displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const actions = planFollowups(snap, cfg, now);
    expect(actions.filter(a => a.kind === "nudge_inwindow" || a.kind === "nudge_template")).toEqual([]);
  });

  it("removes nudges when consent is withdrawn", () => {
    const lastInbound = new Date("2024-01-19T12:00:00+05:30");
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "withdrawn",
      booking: null,
      existing: [],
    };

    const actions = planFollowups(snap, cfg, now);
    expect(actions.filter(a => a.kind === "nudge_inwindow" || a.kind === "nudge_template")).toEqual([]);
  });

  it("removes nudges when no inbound", () => {
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: null,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const actions = planFollowups(snap, cfg, now);
    expect(actions.filter(a => a.kind === "nudge_inwindow" || a.kind === "nudge_template")).toEqual([]);
  });

  it("booked lead still gets survey_reminder", () => {
    const surveyStart = new Date("2024-01-22T10:00:00+05:30");
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "booked", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: new Date("2024-01-19T12:00:00+05:30"),
      consent: "granted",
      booking: { offerId: "o1", startsAt: surveyStart, confirmedAt: null },
      existing: [],
    };

    const actions = planFollowups(snap, cfg, now);
    const reminder = actions.find(a => a.kind === "survey_reminder");
    expect(reminder).toBeDefined();
  });

  it("uses S-late when booking confirmed late", () => {
    const surveyStart = new Date("2024-01-21T14:00:00+05:30");
    const confirmedAt = new Date("2024-01-20T16:00:00+05:30"); // 22 hours before survey
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "booked", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: new Date("2024-01-19T12:00:00+05:30"),
      consent: "granted",
      booking: { offerId: "o1", startsAt: surveyStart, confirmedAt },
      existing: [],
    };

    const actions = planFollowups(snap, cfg, now);
    const reminder = actions.find(a => a.kind === "survey_reminder");

    expect(reminder).toBeDefined();
    expect(reminder!.dueAt.getTime()).toBe(surveyStart.getTime() - 3 * 3600 * 1000);
  });

  it("plans nothing when booking within late window", () => {
    const surveyStart = new Date("2024-01-20T16:00:00+05:30");
    const confirmedAt = new Date("2024-01-20T14:00:00+05:30"); // 2 hours before
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "booked", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: new Date("2024-01-19T12:00:00+05:30"),
      consent: "granted",
      booking: { offerId: "o1", startsAt: surveyStart, confirmedAt },
      existing: [],
    };

    const actions = planFollowups(snap, cfg, now);
    const reminder = actions.find(a => a.kind === "survey_reminder");
    expect(reminder).toBeUndefined();
  });

  it("suppresses actions already in existing (any status)", () => {
    const lastInbound = new Date("2024-01-19T12:00:00+05:30");
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: null, destination: null, moveType: "local", urgency: null, estimatedVolume: "unknown" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [{ kind: "nudge_inwindow", ref: lastInbound.toISOString(), status: "sent" }],
    };

    const actions = planFollowups(snap, cfg, now);
    expect(actions.filter(a => a.kind === "nudge_inwindow")).toEqual([]);
  });

  it("suppresses nudges after maxNudges sent", () => {
    const lastInbound = new Date("2024-01-19T12:00:00+05:30");
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [
        { kind: "nudge_inwindow", ref: "old1", status: "sent" },
        { kind: "nudge_template", ref: "old2", status: "sent" },
      ],
    };

    const actions = planFollowups(snap, cfg, now);
    expect(actions.filter(a => a.kind === "nudge_inwindow" || a.kind === "nudge_template")).toEqual([]);
  });

  it("applies quiet hours shift", () => {
    const lastInbound = new Date("2024-01-20T04:00:00+05:30");
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: null, destination: null, moveType: "local", urgency: null, estimatedVolume: "unknown" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const now = new Date("2024-01-20T14:00:00+05:30");
    const actions = planFollowups(snap, cfg, now);
    const missing = actions.find(a => a.kind === "missing_details");

    expect(missing).toBeDefined();
    expect(missing!.dueAt.toISOString()).toBe(new Date("2024-01-20T09:00:00+05:30").toISOString());
    expect(missing!.forceSkip).toBeNull();
  });

  it("shift past expiresAt sets forceSkip", () => {
    const lastInbound = new Date("2024-01-20T23:00:00+05:30");
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: null,
      existing: [],
    };

    const now = new Date("2024-01-20T14:00:00+05:30");
    const actions = planFollowups(snap, cfg, now);
    const nudge = actions.find(a => a.kind === "nudge_inwindow");

    expect(nudge).toBeDefined();
    expect(nudge!.forceSkip).toBe("quiet_hours");
    expect(nudge!.dueAt.toISOString()).toBe(new Date("2024-01-21T21:00:00+05:30").toISOString());
  });

  it("survey_morning only for pre-noon surveys", () => {
    const surveyStart = new Date("2024-01-21T10:00:00+05:30");
    const lastInbound = new Date("2024-01-20T13:00:00+05:30");
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "booked", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: { offerId: "o1", startsAt: surveyStart, confirmedAt: new Date("2024-01-20T14:00:00+05:30") },
      existing: [{ kind: "survey_reminder", ref: "o1", status: "sent" }],
    };

    const now = new Date("2024-01-20T14:00:00+05:30");
    const actions = planFollowups(snap, cfg, now);
    const morning = actions.find(a => a.kind === "survey_morning");
    expect(morning).toBeDefined();
    expect(morning!.dueAt.toISOString()).toBe(new Date("2024-01-21T09:00:00+05:30").toISOString());
  });

  it("survey_morning closed window", () => {
    const surveyStart = new Date("2024-01-21T10:00:00+05:30");
    const lastInbound = new Date("2024-01-19T12:00:00+05:30");
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "booked", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: { offerId: "o1", startsAt: surveyStart, confirmedAt: new Date("2024-01-19T15:00:00+05:30") },
      existing: [{ kind: "survey_reminder", ref: "o1", status: "sent" }],
    };

    const now = new Date("2024-01-20T14:00:00+05:30");
    const actions = planFollowups(snap, cfg, now);
    const morning = actions.find(a => a.kind === "survey_morning");
    expect(morning).toBeUndefined();
  });

  it("survey_morning not for afternoon surveys", () => {
    const surveyStart = new Date("2024-01-21T14:00:00+05:30");
    const lastInbound = new Date("2024-01-19T12:00:00+05:30");
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "booked", humanTakeover: false, closedAt: null, origin: "Pune", destination: "Mumbai", moveType: "local", urgency: "medium", estimatedVolume: "2bhk" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: { offerId: "o1", startsAt: surveyStart, confirmedAt: new Date("2024-01-19T15:00:00+05:30") },
      existing: [{ kind: "survey_reminder", ref: "o1", status: "sent" }],
    };

    const actions = planFollowups(snap, cfg, now);
    const morning = actions.find(a => a.kind === "survey_morning");
    expect(morning).toBeUndefined();
  });

  it("output sorted by dueAt", () => {
    const lastInbound = new Date("2024-01-18T12:00:00+05:30");
    const surveyStart = new Date("2024-01-22T10:00:00+05:30");
    const snap: FollowupSnapshot = {
      lead: { id: "lead1", status: "gathering", humanTakeover: false, closedAt: null, origin: null, destination: null, moveType: "local", urgency: null, estimatedVolume: "unknown" },
      contact: { id: "c1", phoneE164: "+919876543210", displayName: "Test" },
      lastInboundAt: lastInbound,
      consent: "granted",
      booking: { offerId: "o1", startsAt: surveyStart, confirmedAt: null },
      existing: [],
    };

    const actions = planFollowups(snap, cfg, now);
    for (let i = 1; i < actions.length; i++) {
      expect(actions[i].dueAt.getTime()).toBeGreaterThanOrEqual(actions[i - 1].dueAt.getTime());
    }
  });
});

describe("isExpired", () => {
  it("returns true when now > expiresAt", () => {
    const now = new Date("2024-01-20T15:00:00+05:30");
    const action = {
      kind: "nudge_inwindow" as const,
      ref: "ref",
      dueAt: new Date("2024-01-20T10:00:00+05:30"),
      expiresAt: new Date("2024-01-20T14:00:00+05:30"),
      forceSkip: null,
    };
    expect(isExpired(action, now)).toBe(true);
  });

  it("returns false when now <= expiresAt", () => {
    const now = new Date("2024-01-20T14:00:00+05:30");
    const action = {
      kind: "nudge_inwindow" as const,
      ref: "ref",
      dueAt: new Date("2024-01-20T10:00:00+05:30"),
      expiresAt: new Date("2024-01-20T14:00:00+05:30"),
      forceSkip: null,
    };
    expect(isExpired(action, now)).toBe(false);
  });
});

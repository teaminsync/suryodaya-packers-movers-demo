/**
 * Tests for notifier logic
 */

import { createNotifier } from "../notifier.js";
import { isRecentlySent, dedupeKeyFor } from "../dedupe.js";
import type { AdminEvent } from "../types.js";

describe("dedupeKeyFor", () => {
  it("returns trimmed slot label for booking_confirmed", () => {
    const result = dedupeKeyFor({
      type: "booking_confirmed",
      slotLabel: "  Mon, 21 Oct at 10:00 AM  ",
    });
    expect(result).toBe("Mon, 21 Oct at 10:00 AM");
  });

  it("returns null for booking_confirmed with null slotLabel", () => {
    const result = dedupeKeyFor({
      type: "booking_confirmed",
      slotLabel: null,
    });
    expect(result).toBeNull();
  });

  it("returns null for booking_confirmed with blank slotLabel", () => {
    const result = dedupeKeyFor({
      type: "booking_confirmed",
      slotLabel: "   ",
    });
    expect(result).toBeNull();
  });

  it("returns null for human_requested even with slotLabel", () => {
    const result = dedupeKeyFor({
      type: "human_requested",
      slotLabel: "Mon, 21 Oct at 10:00 AM",
    });
    expect(result).toBeNull();
  });

  it("returns null for needs_followup even with slotLabel", () => {
    const result = dedupeKeyFor({
      type: "needs_followup",
      slotLabel: "Mon, 21 Oct at 10:00 AM",
    });
    expect(result).toBeNull();
  });
});

describe("isRecentlySent", () => {
  const now = new Date("2026-10-20T12:00:00.000Z");

  it("returns true when sent within window", () => {
    const rows = [
      { status: "sent", created_at: new Date("2026-10-20T11:55:00.000Z") },
    ];

    expect(isRecentlySent(rows, now, 10)).toBe(true);
  });

  it("returns false for failed or dry_run status", () => {
    const rows = [
      { status: "failed", created_at: new Date("2026-10-20T11:55:00.000Z") },
      { status: "dry_run", created_at: new Date("2026-10-20T11:55:00.000Z") },
    ];

    expect(isRecentlySent(rows, now, 10)).toBe(false);
  });

  it("returns false when older than window", () => {
    const rows = [
      { status: "sent", created_at: new Date("2026-10-20T11:00:00.000Z") },
    ];

    expect(isRecentlySent(rows, now, 10)).toBe(false);
  });

  it("ignores invalid dates", () => {
    const rows = [
      { status: "sent", created_at: "invalid" },
    ];

    expect(isRecentlySent(rows, now, 10)).toBe(false);
  });
});

describe("createNotifier", () => {
  const baseEvent: AdminEvent = {
    type: "booking_confirmed",
    leadId: "L1",
    source: "whatsapp",
    customerName: "Test User",
    phone: "+911234567890",
    moveType: "residential",
    origin: "Pune",
    destination: "Mumbai",
    estimatedVolume: "3bhk",
    urgency: "high",
    specialItems: [],
    lastMessage: "book it",
    slotLabel: "Mon, 21 Oct at 10:00 AM",
  };

  it("logs when no channel configured", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    const notifier = createNotifier({
      emailConfig: null,
      whatsappConfig: null,
      dashboardBaseUrl: null,
      dryRun: false,
      now: () => new Date(),
      sendEmail: async () => {},
      sendWhatsappTemplate: async () => {},
      recentlySent: async () => false,
      record: async () => {},
    });

    await notifier.notify(baseEvent);

    expect(logs.some((log) => log.includes("No admin channel configured"))).toBe(true);
    console.log = originalLog;
  });

  it("sends both channels and records sent status with dedupeKey", async () => {
    const calls: string[] = [];
    let capturedDedupeKey: string | null | undefined = undefined;
    let recordedDedupeKeys: Array<string | null> = [];

    const notifier = createNotifier({
      emailConfig: { apiKey: "key1", to: "admin@test.com", from: "alerts@test.com" },
      whatsappConfig: { to: "1234567890", template: "admin_alert" },
      dashboardBaseUrl: "http://localhost:3001",
      dryRun: false,
      now: () => new Date(),
      sendEmail: async (input) => {
        calls.push(`email:${input.subject}`);
      },
      sendWhatsappTemplate: async (input) => {
        calls.push(`whatsapp:${input.templateName}:${input.bodyParams.join(",")}`);
      },
      recentlySent: async (_leadId, _type, _since, dedupeKey) => {
        capturedDedupeKey = dedupeKey;
        return false;
      },
      record: async (row) => {
        calls.push(`record:${row.channel}:${row.status}`);
        recordedDedupeKeys.push(row.dedupeKey);
      },
    });

    await notifier.notify(baseEvent);

    expect(calls.filter((c) => c.startsWith("email:"))).toHaveLength(1);
    expect(calls.find((c) => c.startsWith("email:"))).toContain("Survey booked");
    expect(calls.filter((c) => c.startsWith("whatsapp:"))).toHaveLength(1);
    expect(calls.find((c) => c.startsWith("whatsapp:"))).toContain("admin_alert");
    expect(calls.filter((c) => c.includes("record:email:sent"))).toHaveLength(1);
    expect(calls.filter((c) => c.includes("record:whatsapp:sent"))).toHaveLength(1);
    expect(capturedDedupeKey).toBe("Mon, 21 Oct at 10:00 AM");
    expect(recordedDedupeKeys).toEqual(["Mon, 21 Oct at 10:00 AM", "Mon, 21 Oct at 10:00 AM"]);
  });

  it("records failed status when email throws", async () => {
    const records: Array<{ channel: string; status: string; dedupeKey: string | null }> = [];

    const notifier = createNotifier({
      emailConfig: { apiKey: "key1", to: "admin@test.com", from: "alerts@test.com" },
      whatsappConfig: { to: "1234567890", template: "admin_alert" },
      dashboardBaseUrl: null,
      dryRun: false,
      now: () => new Date(),
      sendEmail: async () => {
        throw new Error("Email send failed");
      },
      sendWhatsappTemplate: async () => {},
      recentlySent: async () => false,
      record: async (row) => {
        records.push({ channel: row.channel, status: row.status, dedupeKey: row.dedupeKey });
      },
    });

    await notifier.notify(baseEvent);

    expect(records.find((r) => r.channel === "email")?.status).toBe("failed");
    expect(records.find((r) => r.channel === "whatsapp")?.status).toBe("sent");
    expect(records.find((r) => r.channel === "email")?.dedupeKey).toBe("Mon, 21 Oct at 10:00 AM");
  });

  it("skips when dedupe returns true", async () => {
    const calls: string[] = [];

    const notifier = createNotifier({
      emailConfig: { apiKey: "key1", to: "admin@test.com", from: "alerts@test.com" },
      whatsappConfig: { to: "1234567890", template: "admin_alert" },
      dashboardBaseUrl: null,
      dryRun: false,
      now: () => new Date(),
      sendEmail: async () => {
        calls.push("email");
      },
      sendWhatsappTemplate: async () => {
        calls.push("whatsapp");
      },
      recentlySent: async () => true,
      record: async () => {
        calls.push("record");
      },
    });

    await notifier.notify(baseEvent);

    expect(calls).toHaveLength(0);
  });

  it("records dry_run status in dry run mode", async () => {
    const records: Array<{ channel: string; status: string; dedupeKey: string | null }> = [];

    const notifier = createNotifier({
      emailConfig: { apiKey: "key1", to: "admin@test.com", from: "alerts@test.com" },
      whatsappConfig: { to: "1234567890", template: "admin_alert" },
      dashboardBaseUrl: null,
      dryRun: true,
      now: () => new Date(),
      sendEmail: async () => {},
      sendWhatsappTemplate: async () => {},
      recentlySent: async () => false,
      record: async (row) => {
        records.push({ channel: row.channel, status: row.status, dedupeKey: row.dedupeKey });
      },
    });

    await notifier.notify(baseEvent);

    expect(records.filter((r) => r.status === "dry_run")).toHaveLength(2);
    expect(records.every((r) => r.dedupeKey === "Mon, 21 Oct at 10:00 AM")).toBe(true);
  });

  it("resolves when record throws", async () => {
    const notifier = createNotifier({
      emailConfig: { apiKey: "key1", to: "admin@test.com", from: "alerts@test.com" },
      whatsappConfig: null,
      dashboardBaseUrl: null,
      dryRun: false,
      now: () => new Date(),
      sendEmail: async () => {},
      sendWhatsappTemplate: async () => {},
      recentlySent: async () => false,
      record: async () => {
        throw new Error("Record failed");
      },
    });

    await expect(notifier.notify(baseEvent)).resolves.toBeUndefined();
  });

  it("sends when recentlySent throws", async () => {
    const calls: string[] = [];

    const notifier = createNotifier({
      emailConfig: { apiKey: "key1", to: "admin@test.com", from: "alerts@test.com" },
      whatsappConfig: null,
      dashboardBaseUrl: null,
      dryRun: false,
      now: () => new Date(),
      sendEmail: async () => {
        calls.push("email");
      },
      sendWhatsappTemplate: async () => {},
      recentlySent: async () => {
        throw new Error("Dedupe check failed");
      },
      record: async () => {},
    });

    await notifier.notify(baseEvent);

    expect(calls).toHaveLength(1);
  });

  it("sends alert with matching dedupe key but skips non-matching", async () => {
    const calls: string[] = [];

    const notifier = createNotifier({
      emailConfig: { apiKey: "key1", to: "admin@test.com", from: "alerts@test.com" },
      whatsappConfig: { to: "1234567890", template: "admin_alert" },
      dashboardBaseUrl: null,
      dryRun: false,
      now: () => new Date(),
      sendEmail: async () => {
        calls.push("email");
      },
      sendWhatsappTemplate: async () => {
        calls.push("whatsapp");
      },
      recentlySent: async (_leadId, _type, _since, dedupeKey) => {
        return dedupeKey === "Mon, 26 Oct at 10:00 AM";
      },
      record: async () => {},
    });

    // First event with "Mon, 26 Oct at 10:00 AM" should be skipped
    await notifier.notify({
      ...baseEvent,
      slotLabel: "Mon, 26 Oct at 10:00 AM",
    });

    expect(calls).toHaveLength(0);

    // Second event with "Tue, 27 Oct at 2:00 PM" should go through
    await notifier.notify({
      ...baseEvent,
      slotLabel: "Tue, 27 Oct at 2:00 PM",
    });

    expect(calls).toHaveLength(2);
    expect(calls).toContain("email");
    expect(calls).toContain("whatsapp");
  });
});

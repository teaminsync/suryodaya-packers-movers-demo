/**
 * Tests for consent state evaluation
 */

import { currentConsent, type ConsentRow } from "../consent.js";

describe("currentConsent", () => {
  it("returns unknown for empty array", () => {
    expect(currentConsent([], "whatsapp")).toBe("unknown");
  });

  it("returns granted for single granted row", () => {
    const rows: ConsentRow[] = [
      {
        channel: "whatsapp",
        scope: "follow_up",
        status: "granted",
        captured_at: "2026-10-01T00:00:00.000Z",
      },
    ];

    expect(currentConsent(rows, "whatsapp", "follow_up")).toBe("granted");
  });

  it("returns the status of the latest row", () => {
    const rows1: ConsentRow[] = [
      {
        channel: "whatsapp",
        scope: "follow_up",
        status: "granted",
        captured_at: "2026-10-01T00:00:00.000Z",
      },
      {
        channel: "whatsapp",
        scope: "follow_up",
        status: "withdrawn",
        captured_at: "2026-10-02T00:00:00.000Z",
      },
    ];

    expect(currentConsent(rows1, "whatsapp", "follow_up")).toBe("withdrawn");

    const rows2: ConsentRow[] = [
      {
        channel: "whatsapp",
        scope: "follow_up",
        status: "withdrawn",
        captured_at: "2026-10-01T00:00:00.000Z",
      },
      {
        channel: "whatsapp",
        scope: "follow_up",
        status: "granted",
        captured_at: "2026-10-02T00:00:00.000Z",
      },
    ];

    expect(currentConsent(rows2, "whatsapp", "follow_up")).toBe("granted");
  });

  it("filters by channel and scope", () => {
    const rows: ConsentRow[] = [
      {
        channel: "email",
        scope: "follow_up",
        status: "granted",
        captured_at: "2026-10-01T00:00:00.000Z",
      },
      {
        channel: "whatsapp",
        scope: "marketing",
        status: "granted",
        captured_at: "2026-10-01T00:00:00.000Z",
      },
    ];

    expect(currentConsent(rows, "whatsapp", "follow_up")).toBe("unknown");
    expect(currentConsent(rows, "whatsapp", "marketing")).toBe("granted");
    expect(currentConsent(rows, "whatsapp")).toBe("granted");
  });

  it("ignores non-granted/withdrawn statuses and handles Date objects", () => {
    const rows: ConsentRow[] = [
      {
        channel: "whatsapp",
        scope: "follow_up",
        status: "granted",
        captured_at: "2026-10-01T00:00:00.000Z",
      },
      {
        channel: "whatsapp",
        scope: "follow_up",
        status: "pending",
        captured_at: new Date("2026-10-02T00:00:00.000Z"),
      },
    ];

    expect(currentConsent(rows, "whatsapp", "follow_up")).toBe("granted");
  });
});

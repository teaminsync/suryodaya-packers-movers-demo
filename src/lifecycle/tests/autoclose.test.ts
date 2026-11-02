/**
 * Tests for auto-close logic
 */

import { describe, it, expect } from "@jest/globals";
import { parseAutocloseConfig, isReadyToAutoClose } from "../autoclose.js";

describe("parseAutocloseConfig", () => {
  it("returns 48 by default when undefined", () => {
    const result = parseAutocloseConfig({});
    expect(result.hours).toBe(48);
    expect(result.warnings).toEqual([]);
  });

  it("returns 48 by default when blank", () => {
    const result = parseAutocloseConfig({ LEAD_AUTOCLOSE_HOURS: "  " });
    expect(result.hours).toBe(48);
    expect(result.warnings).toEqual([]);
  });

  it("parses valid integer", () => {
    const result = parseAutocloseConfig({ LEAD_AUTOCLOSE_HOURS: "72" });
    expect(result.hours).toBe(72);
    expect(result.warnings).toEqual([]);
  });

  it("accepts 0 to disable", () => {
    const result = parseAutocloseConfig({ LEAD_AUTOCLOSE_HOURS: "0" });
    expect(result.hours).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it("rejects 721 with warning", () => {
    const result = parseAutocloseConfig({ LEAD_AUTOCLOSE_HOURS: "721" });
    expect(result.hours).toBe(48);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("LEAD_AUTOCLOSE_HOURS");
    expect(result.warnings[0]).toContain("721");
  });

  it("rejects abc with warning", () => {
    const result = parseAutocloseConfig({ LEAD_AUTOCLOSE_HOURS: "abc" });
    expect(result.hours).toBe(48);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("abc");
  });

  it("rejects negative with warning", () => {
    const result = parseAutocloseConfig({ LEAD_AUTOCLOSE_HOURS: "-5" });
    expect(result.hours).toBe(48);
    expect(result.warnings.length).toBe(1);
  });

  it("accepts max value 720", () => {
    const result = parseAutocloseConfig({ LEAD_AUTOCLOSE_HOURS: "720" });
    expect(result.hours).toBe(720);
    expect(result.warnings).toEqual([]);
  });
});

describe("isReadyToAutoClose", () => {
  const now = new Date("2024-10-25T10:00:00.000Z");

  it("returns true when all conditions met", () => {
    const result = isReadyToAutoClose({
      status: "booked",
      closedAt: null,
      latestSurveyStartsAt: new Date("2024-10-23T08:00:00.000Z"),
      lastInboundAt: null,
      now,
      hours: 48,
    });

    expect(result).toBe(true);
  });

  it("returns false when hours is 0", () => {
    const result = isReadyToAutoClose({
      status: "booked",
      closedAt: null,
      latestSurveyStartsAt: new Date("2024-10-23T08:00:00.000Z"),
      lastInboundAt: null,
      now,
      hours: 0,
    });

    expect(result).toBe(false);
  });

  it("returns false when status is not booked", () => {
    const result = isReadyToAutoClose({
      status: "gathering",
      closedAt: null,
      latestSurveyStartsAt: new Date("2024-10-23T08:00:00.000Z"),
      lastInboundAt: null,
      now,
      hours: 48,
    });

    expect(result).toBe(false);
  });

  it("returns false when already closed", () => {
    const result = isReadyToAutoClose({
      status: "booked",
      closedAt: new Date("2024-10-24T10:00:00.000Z"),
      latestSurveyStartsAt: new Date("2024-10-23T08:00:00.000Z"),
      lastInboundAt: null,
      now,
      hours: 48,
    });

    expect(result).toBe(false);
  });

  it("returns false when survey is 1 hour too recent", () => {
    const result = isReadyToAutoClose({
      status: "booked",
      closedAt: null,
      latestSurveyStartsAt: new Date("2024-10-23T11:00:00.000Z"),
      lastInboundAt: null,
      now,
      hours: 48,
    });

    expect(result).toBe(false);
  });

  it("returns false when no survey time", () => {
    const result = isReadyToAutoClose({
      status: "booked",
      closedAt: null,
      latestSurveyStartsAt: null,
      lastInboundAt: null,
      now,
      hours: 48,
    });

    expect(result).toBe(false);
  });

  it("returns false when customer wrote within the window", () => {
    const result = isReadyToAutoClose({
      status: "booked",
      closedAt: null,
      latestSurveyStartsAt: new Date("2024-10-23T08:00:00.000Z"),
      lastInboundAt: new Date("2024-10-23T11:00:00.000Z"),
      now,
      hours: 48,
    });

    expect(result).toBe(false);
  });

  it("returns true when lastInboundAt is null", () => {
    const result = isReadyToAutoClose({
      status: "booked",
      closedAt: null,
      latestSurveyStartsAt: new Date("2024-10-23T08:00:00.000Z"),
      lastInboundAt: null,
      now,
      hours: 48,
    });

    expect(result).toBe(true);
  });

  it("returns true when lastInboundAt is before cutoff", () => {
    const result = isReadyToAutoClose({
      status: "booked",
      closedAt: null,
      latestSurveyStartsAt: new Date("2024-10-23T08:00:00.000Z"),
      lastInboundAt: new Date("2024-10-23T07:00:00.000Z"),
      now,
      hours: 48,
    });

    expect(result).toBe(true);
  });

  it("returns false when latestSurveyStartsAt is invalid string", () => {
    const result = isReadyToAutoClose({
      status: "booked",
      closedAt: null,
      latestSurveyStartsAt: "invalid" as any,
      lastInboundAt: null,
      now,
      hours: 48,
    });

    expect(result).toBe(false);
  });
});

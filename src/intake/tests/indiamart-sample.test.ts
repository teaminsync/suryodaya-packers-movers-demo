/**
 * Tests for IndiaMART sample builder
 */

import { buildIndiaMartSample, formatIndiaMartTime } from "../indiamart-sample.js";
import { parseIndiaMartPush } from "../indiamart.js";

const now = new Date("2026-10-16T05:30:00.000Z");

describe("buildIndiaMartSample", () => {
  it("builds a parseable sample with all expected fields", () => {
    const sample = buildIndiaMartSample({ uniqueId: "555", now });
    const parsed = parseIndiaMartPush(sample, now);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.event.externalRef).toBe("555");
    expect(parsed.event.contactName).toBe("Rahul Verma");
    expect(parsed.event.phoneRaw).toBe("+91-9876543210");
    expect(parsed.event.queryType).toBe("W");
    expect(parsed.event.text).toMatch(/^Need to shift a 3BHK/);
    expect(parsed.event.receivedAt.getTime()).toBe(now.getTime());
  });

  it("builds parseable samples in all three shapes", () => {
    const wrapped = buildIndiaMartSample({ uniqueId: "777", shape: "wrapped", now });
    const parsedWrapped = parseIndiaMartPush(wrapped, now);
    expect(parsedWrapped.ok).toBe(true);
    if (parsedWrapped.ok) {
      expect(parsedWrapped.event.externalRef).toBe("777");
    }

    const body = buildIndiaMartSample({ uniqueId: "777", shape: "body", now });
    const parsedBody = parseIndiaMartPush(body, now);
    expect(parsedBody.ok).toBe(true);
    if (parsedBody.ok) {
      expect(parsedBody.event.externalRef).toBe("777");
    }

    const flat = buildIndiaMartSample({ uniqueId: "777", shape: "flat", now });
    const parsedFlat = parseIndiaMartPush(flat, now);
    expect(parsedFlat.ok).toBe(true);
    if (parsedFlat.ok) {
      expect(parsedFlat.event.externalRef).toBe("777");
    }
  });

  it("handles null name, null phone with email, and null phone without email", () => {
    const nullName = buildIndiaMartSample({ name: null, now });
    const parsedNullName = parseIndiaMartPush(nullName, now);
    expect(parsedNullName.ok).toBe(true);
    if (parsedNullName.ok) {
      expect(parsedNullName.event.contactName).toBe(null);
    }

    const nullPhoneWithEmail = buildIndiaMartSample({ phone: null, email: "a@b.com", now });
    const parsedNullPhoneEmail = parseIndiaMartPush(nullPhoneWithEmail, now);
    expect(parsedNullPhoneEmail.ok).toBe(true);
    if (parsedNullPhoneEmail.ok) {
      expect(parsedNullPhoneEmail.event.phoneRaw).toBe(null);
      expect(parsedNullPhoneEmail.event.email).toBe("a@b.com");
    }

    const nullPhoneNoEmail = buildIndiaMartSample({ phone: null, now });
    const parsedNullPhone = parseIndiaMartPush(nullPhoneNoEmail, now);
    expect(parsedNullPhone.ok).toBe(false);
  });

  it("formats IndiaMART time correctly for IST", () => {
    const formatted1 = formatIndiaMartTime(now);
    expect(formatted1).toBe("2026-10-16 11:00:00");

    const formatted2 = formatIndiaMartTime(new Date("2026-12-31T20:00:05.000Z"));
    expect(formatted2).toBe("2027-01-01 01:30:05");
  });
});

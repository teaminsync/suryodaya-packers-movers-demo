/**
 * Tests for phone number normalization
 */

import { normalizePhoneE164 } from "../phone.js";

describe("Phone number normalization", () => {
  it("Indian formats all give +919082210545", () => {
    expect(normalizePhoneE164("+91-9082210545")).toBe("+919082210545");
    expect(normalizePhoneE164("919082210545")).toBe("+919082210545");
    expect(normalizePhoneE164("9082210545")).toBe("+919082210545");
    expect(normalizePhoneE164("09082210545")).toBe("+919082210545");
    expect(normalizePhoneE164("0091 90822 10545")).toBe("+919082210545");
    expect(normalizePhoneE164("+91 90822 10545")).toBe("+919082210545");
  });

  it("a non-Indian number with country code passes through", () => {
    expect(normalizePhoneE164("14155550123")).toBe("+14155550123");
  });

  it("international 00 prefix", () => {
    expect(normalizePhoneE164("0044 7911 123456")).toBe("+447911123456");
  });

  it("invalid inputs return null", () => {
    expect(normalizePhoneE164("")).toBe(null);
    expect(normalizePhoneE164(null)).toBe(null);
    expect(normalizePhoneE164(undefined)).toBe(null);
    expect(normalizePhoneE164("12345")).toBe(null);
    expect(normalizePhoneE164("abc")).toBe(null);
    expect(normalizePhoneE164("0120-22222222")).toBe(null);
    expect(normalizePhoneE164("5551234567")).toBe(null);
    expect(normalizePhoneE164("1234567890123456")).toBe(null);
  });

  it("idempotent", () => {
    expect(normalizePhoneE164(normalizePhoneE164("9082210545")!)).toBe("+919082210545");
  });

  it("a wa_id and a formatted IndiaMART style number for the same person match", () => {
    expect(normalizePhoneE164("919082210545")).toBe(normalizePhoneE164("+91-9082210545"));
  });
});

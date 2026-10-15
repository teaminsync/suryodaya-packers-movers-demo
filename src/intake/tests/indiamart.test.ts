/**
 * Tests for IndiaMART Push API parser
 */

import { describe, it, expect } from "@jest/globals";
import { parseIndiaMartPush, INDIAMART_SOURCE } from "../indiamart.js";

const now = new Date("2026-10-14T12:00:00.000Z");

const sampleFields = {
  UNIQUE_QUERY_ID: "621654886",
  QUERY_TYPE: "B",
  QUERY_TIME: "2024-04-10 11:17:14",
  SENDER_NAME: "Prabhat",
  SENDER_MOBILE: "+91-9999999999",
  SENDER_EMAIL: "AbcdePrabhat@gmail.com",
  SUBJECT: "Requirement for Empty Mineral Water Bottle",
  SENDER_COUNTRY_ISO: "IN",
  SENDER_PHONE: "0120-22222222",
  QUERY_MESSAGE: "I want to purchase an Empty Mineral Water Bottle. Kindly send me price and other details.",
};

describe("parseIndiaMartPush", () => {
  it("parses wrapped RESPONSE payload with all fields", () => {
    const body = {
      CODE: 200,
      STATUS: "SUCCESS",
      RESPONSE: sampleFields,
    };

    const result = parseIndiaMartPush(body, now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.event.externalRef).toBe("621654886");
    expect(result.event.phoneRaw).toBe("+91-9999999999");
    expect(result.event.email).toBe("abcdeprabhat@gmail.com");
    expect(result.event.contactName).toBe("Prabhat");
    expect(result.event.text).toBe(sampleFields.QUERY_MESSAGE);
    expect(result.event.queryType).toBe("B");
    expect(result.event.source).toBe(INDIAMART_SOURCE);
    expect(result.event.receivedAt.getTime()).toBe(
      new Date("2024-04-10T11:17:14+05:30").getTime()
    );
    expect(result.event.rawPayload).toBe(JSON.stringify(body));
  });

  it("parses nested body.RESPONSE payload", () => {
    const body = {
      body: {
        CODE: 200,
        STATUS: "SUCCESS",
        RESPONSE: sampleFields,
      },
    };

    const result = parseIndiaMartPush(body, now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.externalRef).toBe("621654886");
  });

  it("parses flat payload without wrapper", () => {
    const result = parseIndiaMartPush(sampleFields, now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.externalRef).toBe("621654886");
  });

  it("rejects payload without UNIQUE_QUERY_ID", () => {
    const body = {
      SENDER_NAME: "Test",
      SENDER_MOBILE: "+91-9999999999",
    };

    const result = parseIndiaMartPush(body, now);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("UNIQUE_QUERY_ID");
  });

  it("rejects payload with only landline phone and no email", () => {
    const body = {
      UNIQUE_QUERY_ID: "123",
      SENDER_NAME: "Test",
      SENDER_PHONE: "0120-22222222",
    };

    const result = parseIndiaMartPush(body, now);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("mobile");
  });

  it("accepts email without mobile phone", () => {
    const body = {
      UNIQUE_QUERY_ID: "123",
      SENDER_NAME: "Test",
      SENDER_EMAIL: "test@example.com",
      QUERY_MESSAGE: "Hello",
    };

    const result = parseIndiaMartPush(body, now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.phoneRaw).toBe(null);
    expect(result.event.email).toBe("test@example.com");
  });

  it("handles IndiaMART Buyer name, missing QUERY_MESSAGE, and missing SUBJECT", () => {
    const body = {
      UNIQUE_QUERY_ID: "123",
      SENDER_NAME: "IndiaMART Buyer",
      SENDER_MOBILE: "+91-9999999999",
      SUBJECT: "Test Subject",
      QUERY_MESSAGE: "",
    };

    const result1 = parseIndiaMartPush(body, now);
    expect(result1.ok).toBe(true);
    if (!result1.ok) return;
    expect(result1.event.contactName).toBe(null);
    expect(result1.event.text).toBe("Test Subject");

    const body2 = {
      UNIQUE_QUERY_ID: "456",
      SENDER_NAME: "indiamart buyer",
      SENDER_EMAIL: "test@example.com",
      QUERY_TYPE: "P",
    };

    const result2 = parseIndiaMartPush(body2, now);
    expect(result2.ok).toBe(true);
    if (!result2.ok) return;
    expect(result2.event.contactName).toBe(null);
    expect(result2.event.text).toBe("[IndiaMART enquiry, type P]");
  });

  it("handles invalid QUERY_TIME and numeric UNIQUE_QUERY_ID", () => {
    const body = {
      UNIQUE_QUERY_ID: 123,
      SENDER_MOBILE: "+91-9999999999",
      QUERY_TIME: "not a date",
      QUERY_MESSAGE: "Test",
    };

    const result = parseIndiaMartPush(body, now);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.receivedAt).toEqual(now);
    expect(result.event.externalRef).toBe("123");
  });

  it("rejects non-object bodies", () => {
    const result1 = parseIndiaMartPush(null, now);
    expect(result1.ok).toBe(false);

    const result2 = parseIndiaMartPush("x", now);
    expect(result2.ok).toBe(false);

    const result3 = parseIndiaMartPush([], now);
    expect(result3.ok).toBe(false);
  });
});

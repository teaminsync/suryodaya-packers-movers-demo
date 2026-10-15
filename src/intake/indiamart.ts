/**
 * IndiaMART Push API parser
 */

import type { InquiryEvent } from "./types.js";

export const INDIAMART_SOURCE = "indiamart";

export type IndiaMartParseResult =
  | { ok: true; event: InquiryEvent }
  | { ok: false; reason: string };

/**
 * Parse IndiaMART datetime (sent without timezone; assume IST +05:30)
 */
export function parseIndiaMartTime(
  value: string | null | undefined,
  fallback: Date
): Date {
  if (!value) {
    return fallback;
  }

  const trimmed = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(trimmed);

  if (!match) {
    return fallback;
  }

  const [, y, m, d, h, mi, s] = match;
  // IndiaMART sends timestamps without timezone; assume IST (+05:30)
  const date = new Date(`${y}-${m}-${d}T${h}:${mi}:${s}+05:30`);

  if (isNaN(date.getTime())) {
    return fallback;
  }

  return date;
}

/**
 * Parse IndiaMART Push API payload
 */
export function parseIndiaMartPush(body: unknown, now: Date): IndiaMartParseResult {
  try {
    // Body must be a non-null object and not an array
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false, reason: "body is not a JSON object" };
    }

    // Find the field object, trying candidates in order
    let fields: any = null;
    const bodyObj = body as any;

    const candidates = [
      bodyObj.RESPONSE,
      bodyObj.body?.RESPONSE,
      bodyObj.body,
      bodyObj,
    ];

    for (const candidate of candidates) {
      if (
        candidate &&
        typeof candidate === "object" &&
        !Array.isArray(candidate) &&
        candidate.UNIQUE_QUERY_ID != null &&
        candidate.UNIQUE_QUERY_ID !== ""
      ) {
        fields = candidate;
        break;
      }
    }

    if (!fields) {
      return { ok: false, reason: "missing UNIQUE_QUERY_ID" };
    }

    // Helper to extract string
    const str = (v: any): string | null => {
      let s: string;
      if (typeof v === "string") {
        s = v.trim();
      } else if (typeof v === "number") {
        s = String(v);
      } else {
        s = "";
      }
      return s === "" ? null : s;
    };

    const externalRef = str(fields.UNIQUE_QUERY_ID);
    if (!externalRef) {
      return { ok: false, reason: "missing UNIQUE_QUERY_ID" };
    }

    // Phone and email
    const phoneRaw = str(fields.SENDER_MOBILE) ?? str(fields.SENDER_MOBILE_ALT);
    let email = str(fields.SENDER_EMAIL) ?? str(fields.SENDER_EMAIL_ALT);
    if (email) {
      email = email.toLowerCase();
    }

    if (!phoneRaw && !email) {
      return { ok: false, reason: "no mobile number or email" };
    }

    // Contact name
    let contactName = str(fields.SENDER_NAME);
    if (contactName && contactName.toLowerCase() === "indiamart buyer") {
      contactName = null;
    }

    // Query type
    const queryType = str(fields.QUERY_TYPE);

    // Text
    let text = str(fields.QUERY_MESSAGE) ?? str(fields.SUBJECT);
    if (!text) {
      text = `[IndiaMART enquiry, type ${queryType ?? "unknown"}]`;
    }

    // Received at
    const receivedAt = parseIndiaMartTime(str(fields.QUERY_TIME), now);

    // Raw payload
    const rawPayload = JSON.stringify(body);

    const event: InquiryEvent = {
      source: INDIAMART_SOURCE,
      externalRef,
      receivedAt,
      contactName,
      phoneRaw,
      email,
      text,
      rawPayload,
      queryType,
    };

    return { ok: true, event };
  } catch {
    return { ok: false, reason: "unparseable payload" };
  }
}

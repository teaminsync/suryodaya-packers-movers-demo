/**
 * Tests for outreach HTTP layer (pure transformation functions)
 */

import { describe, it, expect } from "@jest/globals";
import {
  describeOutreach,
  buildStaffNote,
  mapConsentResult,
  mapFollowupResult,
} from "../http.js";
import type { OutreachStatus } from "../service.js";

describe("describeOutreach", () => {
  it("should enable canSendFollowup when action is send_template and not closed", () => {
    const status: OutreachStatus = {
      action: "send_template",
      consent: "granted",
      closed: false,
      clickToChatLink: null,
      reason: "",
      windowOpen: false,
    };

    const capabilities = describeOutreach(status);

    expect(capabilities).toEqual({
      canSendFollowup: true,
      canRecordConsent: false,
      canCopyLink: false,
    });
  });

  it("should enable canRecordConsent and canCopyLink for offer_click_to_chat with unknown consent", () => {
    const status: OutreachStatus = {
      action: "offer_click_to_chat",
      consent: "unknown",
      closed: false,
      clickToChatLink: "https://wa.me/1",
      reason: "",
      windowOpen: false,
    };

    const capabilities = describeOutreach(status);

    expect(capabilities).toEqual({
      canSendFollowup: false,
      canRecordConsent: true,
      canCopyLink: true,
    });
  });

  it("should disable all capabilities when closed is true", () => {
    const status: OutreachStatus = {
      action: "offer_click_to_chat",
      consent: "unknown",
      closed: true,
      clickToChatLink: "https://wa.me/1",
      reason: "",
      windowOpen: false,
    };

    const capabilities = describeOutreach(status);

    expect(capabilities).toEqual({
      canSendFollowup: false,
      canRecordConsent: false,
      canCopyLink: false,
    });
  });

  it("should disable all for blocked_opted_out, needs_human_call, and reply_freeform", () => {
    const blockedStatus: OutreachStatus = {
      action: "blocked_opted_out",
      consent: "withdrawn",
      closed: false,
      clickToChatLink: null,
      reason: "",
      windowOpen: false,
    };

    const needsCallStatus: OutreachStatus = {
      action: "needs_human_call",
      consent: "unknown",
      closed: false,
      clickToChatLink: null,
      reason: "",
      windowOpen: false,
    };

    const replyStatus: OutreachStatus = {
      action: "reply_freeform",
      consent: "unknown",
      closed: false,
      clickToChatLink: null,
      reason: "",
      windowOpen: false,
    };

    expect(describeOutreach(blockedStatus)).toEqual({
      canSendFollowup: false,
      canRecordConsent: false,
      canCopyLink: false,
    });

    expect(describeOutreach(needsCallStatus)).toEqual({
      canSendFollowup: false,
      canRecordConsent: false,
      canCopyLink: false,
    });

    expect(describeOutreach(replyStatus)).toEqual({
      canSendFollowup: false,
      canRecordConsent: false,
      canCopyLink: false,
    });
  });
});

describe("buildStaffNote", () => {
  it("should build note with staff name and without staff name", () => {
    const result1 = buildStaffNote("  agreed on call  ", " admin@x.com ");
    expect(result1).toEqual({
      ok: true,
      note: "agreed on call [recorded by admin@x.com]",
    });

    const result2 = buildStaffNote("agreed", undefined);
    expect(result2).toEqual({
      ok: true,
      note: "agreed",
    });

    const result3 = buildStaffNote("agreed", 5);
    expect(result3).toEqual({
      ok: true,
      note: "agreed",
    });
  });

  it("should return note_required for invalid or empty notes", () => {
    expect(buildStaffNote(5, undefined)).toEqual({
      ok: false,
      code: "note_required",
    });

    expect(buildStaffNote(null, undefined)).toEqual({
      ok: false,
      code: "note_required",
    });

    expect(buildStaffNote("", undefined)).toEqual({
      ok: false,
      code: "note_required",
    });

    expect(buildStaffNote("   ", undefined)).toEqual({
      ok: false,
      code: "note_required",
    });

    expect(buildStaffNote("x".repeat(401), undefined)).toEqual({
      ok: false,
      code: "note_too_long",
    });

    const result400 = buildStaffNote("x".repeat(400), undefined);
    expect(result400).toEqual({
      ok: true,
      note: "x".repeat(400),
    });
  });

  it("should truncate staff name to 80 chars and collapse whitespace", () => {
    const longStaff = "x".repeat(100);
    const result = buildStaffNote("agreed", longStaff);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const staffPart = result.note.substring(result.note.indexOf("[recorded by ") + "[recorded by ".length, result.note.length - 1);
      expect(staffPart.length).toBe(80);
    }

    const result2 = buildStaffNote("agreed", "Asha   Rao");
    expect(result2).toEqual({
      ok: true,
      note: "agreed [recorded by Asha Rao]",
    });

    const maxNote = "x".repeat(400);
    const maxStaff = "y".repeat(80);
    const result3 = buildStaffNote(maxNote, maxStaff);
    expect(result3.ok).toBe(true);
    if (result3.ok) {
      expect(result3.note.length).toBeLessThanOrEqual(500);
    }
  });
});

describe("mapConsentResult", () => {
  it("should map success to 200", () => {
    const result = mapConsentResult({ ok: true });
    expect(result).toEqual({
      status: 200,
      json: { ok: true },
    });
  });

  it("should return a new object each call", () => {
    const result1 = mapConsentResult({ ok: true });
    const result2 = mapConsentResult({ ok: true });
    expect(result1).toEqual(result2);
    expect(result1).not.toBe(result2);
  });

  it("should map failure codes to correct statuses", () => {
    expect(mapConsentResult({ ok: false, code: "lead_not_found" })).toEqual({
      status: 404,
      json: { ok: false, code: "lead_not_found" },
    });

    expect(mapConsentResult({ ok: false, code: "no_contact" })).toEqual({
      status: 409,
      json: { ok: false, code: "no_contact" },
    });

    expect(mapConsentResult({ ok: false, code: "note_required" })).toEqual({
      status: 400,
      json: { ok: false, code: "note_required" },
    });

    expect(mapConsentResult({ ok: false, code: "note_too_long" })).toEqual({
      status: 400,
      json: { ok: false, code: "note_too_long" },
    });

    expect(mapConsentResult({ ok: false, code: "opted_out" })).toEqual({
      status: 409,
      json: { ok: false, code: "opted_out" },
    });
  });
});

describe("mapFollowupResult", () => {
  it("should map success with wamid to 200", () => {
    const result1 = mapFollowupResult({ ok: true, wamid: "w1" });
    expect(result1).toEqual({
      status: 200,
      json: { ok: true, wamid: "w1" },
    });

    const result2 = mapFollowupResult({ ok: true, wamid: null });
    expect(result2).toEqual({
      status: 200,
      json: { ok: true, wamid: null },
    });
  });

  it("should map failure codes to correct statuses and truncate reason", () => {
    expect(
      mapFollowupResult({ ok: false, code: "lead_not_found", reason: "not found" })
    ).toEqual({
      status: 404,
      json: { ok: false, code: "lead_not_found", reason: "not found" },
    });

    expect(
      mapFollowupResult({ ok: false, code: "lead_closed", reason: "closed" })
    ).toEqual({
      status: 409,
      json: { ok: false, code: "lead_closed", reason: "closed" },
    });

    expect(
      mapFollowupResult({
        ok: false,
        code: "not_allowed",
        action: "offer_click_to_chat",
        reason: "no consent",
      })
    ).toEqual({
      status: 409,
      json: {
        ok: false,
        code: "not_allowed",
        reason: "no consent",
        action: "offer_click_to_chat",
      },
    });

    expect(
      mapFollowupResult({ ok: false, code: "send_failed", reason: "boom" })
    ).toEqual({
      status: 502,
      json: { ok: false, code: "send_failed", reason: "boom" },
    });

    const longReason = "x".repeat(500);
    const result = mapFollowupResult({
      ok: false,
      code: "send_failed",
      reason: longReason,
    });
    expect(result.status).toBe(502);
    expect((result.json.reason as string).length).toBe(300);
  });
});

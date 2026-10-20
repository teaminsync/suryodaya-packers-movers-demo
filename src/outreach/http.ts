/**
 * HTTP layer for outreach API: pure transformation functions
 */

import type { OutreachStatus, SendFollowupResult, StaffConsentResult } from "./service.js";

export interface ApiResponse {
  status: number;
  json: Record<string, unknown>;
}

export interface OutreachCapabilities {
  canSendFollowup: boolean;
  canRecordConsent: boolean;
  canCopyLink: boolean;
}

export function describeOutreach(status: OutreachStatus): OutreachCapabilities {
  const blockedActions = ["blocked_opted_out", "needs_human_call", "reply_freeform"];
  
  if (blockedActions.includes(status.action)) {
    return {
      canSendFollowup: false,
      canRecordConsent: false,
      canCopyLink: false,
    };
  }

  const canSendFollowup = status.action === "send_template" && !status.closed;
  const canRecordConsent =
    status.consent === "unknown" &&
    status.action !== "needs_human_call" &&
    !status.closed;
  const canCopyLink = status.clickToChatLink !== null && !status.closed;

  return {
    canSendFollowup,
    canRecordConsent,
    canCopyLink,
  };
}

export function buildStaffNote(
  note: unknown,
  staff: unknown
): { ok: true; note: string } | { ok: false; code: "note_required" | "note_too_long" } {
  if (typeof note !== "string") {
    return { ok: false, code: "note_required" };
  }

  const trimmed = note.trim();
  if (trimmed === "") {
    return { ok: false, code: "note_required" };
  }

  if (trimmed.length > 400) {
    return { ok: false, code: "note_too_long" };
  }

  let staffName = "";
  if (typeof staff === "string") {
    staffName = staff
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80)
      .trim();
  }

  const finalNote = staffName
    ? `${trimmed} [recorded by ${staffName}]`
    : trimmed;

  return { ok: true, note: finalNote };
}

export function friendlySendError(reason: string): string | null {
  const match = /"code"\s*:\s*(\d{3,6})/.exec(reason);
  if (!match) {
    return null;
  }

  const code = Number(match[1]);

  const errorMap: Record<number, string> = {
    131030: "WhatsApp only delivers to numbers on the sandbox recipient list. Add this number in Meta's API setup, or message a verified number.",
    131047: "More than 24 hours have passed since the customer last wrote, so a template is required.",
    131026: "This number cannot receive WhatsApp messages (it may not be on WhatsApp).",
    131048: "WhatsApp is limiting messages to this number right now. Try again later.",
    131056: "WhatsApp is limiting messages to this number right now. Try again later.",
    190: "The WhatsApp access token has expired. Ask an administrator to renew it.",
  };

  return errorMap[code] ?? `WhatsApp rejected the message (error ${code}).`;
}

export function mapConsentResult(result: StaffConsentResult): ApiResponse {
  if (result.ok) {
    return {
      status: 200,
      json: { ok: true },
    };
  }

  const codeToStatus: Record<string, number> = {
    lead_not_found: 404,
    no_contact: 409,
    note_required: 400,
    note_too_long: 400,
    opted_out: 409,
  };

  return {
    status: codeToStatus[result.code] ?? 500,
    json: { ok: false, code: result.code },
  };
}

export function mapFollowupResult(result: SendFollowupResult): ApiResponse {
  if (result.ok) {
    return {
      status: 200,
      json: { ok: true, wamid: result.wamid },
    };
  }

  const codeToStatus: Record<string, number> = {
    lead_not_found: 404,
    lead_closed: 409,
    not_allowed: 409,
    send_failed: 502,
  };

  let reason = result.reason;
  if (result.code === "send_failed") {
    const friendly = friendlySendError(result.reason);
    if (friendly !== null) {
      reason = friendly;
    }
  }
  reason = reason.slice(0, 300);

  const json: Record<string, unknown> = {
    ok: false,
    code: result.code,
    reason,
  };

  if (result.code === "not_allowed" && result.action !== undefined) {
    json.action = result.action;
  }

  return {
    status: codeToStatus[result.code] ?? 500,
    json,
  };
}

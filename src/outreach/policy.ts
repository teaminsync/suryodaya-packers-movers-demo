/**
 * Outreach policy decision logic
 */

import type { ConsentState } from "./consent.js";

export type OutreachAction =
  | "reply_freeform"
  | "send_template"
  | "offer_click_to_chat"
  | "needs_human_call"
  | "blocked_opted_out";

export interface OutreachInput {
  phoneE164: string | null;
  consent: ConsentState;
  windowOpen: boolean;
}

export interface OutreachDecision {
  action: OutreachAction;
  reason: string;
}

export function decideOutreach(input: OutreachInput): OutreachDecision {
  if (input.phoneE164 === null) {
    return {
      action: "needs_human_call",
      reason: "no phone number",
    };
  }

  if (input.consent === "withdrawn") {
    return {
      action: "blocked_opted_out",
      reason: "customer opted out",
    };
  }

  if (input.windowOpen) {
    return {
      action: "reply_freeform",
      reason: "customer messaged within the last 24 hours",
    };
  }

  if (input.consent === "granted") {
    return {
      action: "send_template",
      reason: "consent recorded, service window closed",
    };
  }

  return {
    action: "offer_click_to_chat",
    reason: "no recorded consent",
  };
}

export function isServiceWindowOpen(
  lastInboundAt: string | Date | null,
  now: Date
): boolean {
  if (lastInboundAt === null) {
    return false;
  }

  const t = new Date(lastInboundAt).getTime();
  if (isNaN(t)) {
    return false;
  }

  return now.getTime() - t <= 24 * 3600 * 1000;
}

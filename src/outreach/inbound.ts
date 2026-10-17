/**
 * Inbound outreach handler: process template button replies and opt-outs
 */

import { CONSENT_CHANNEL_WHATSAPP, CONSENT_SCOPE_FOLLOWUP } from "./consent.js";
import type { InboundIntent } from "./messages.js";

export const ACK_OPT_OUT = "You have been unsubscribed from follow-up messages from Suryodaya Packers & Movers. If you need help with a move later, just message us here.";
export const ACK_NOT_NOW = "No problem. If you need help with your move later, just message us here and we will pick it up.";
export const CLOSE_REASON_DECLINED = "declined_followup";

export interface InboundOutreachDeps {
  recordConsent(params: {
    contactId: string;
    channel: string;
    scope: string;
    status: "granted" | "withdrawn";
    source: string;
    wording: string | null;
    evidenceRef: string | null;
    capturedAt: string;
  }): Promise<void>;
  closeLead(params: { leadId: string; reason: string; nowIso: string }): Promise<void>;
  sendText(params: { to: string; leadId: string; body: string }): Promise<void>;
}

export interface InboundOutreachInput {
  intent: InboundIntent;
  leadId: string;
  contactId: string;
  to: string;
  wamid: string | null;
  rawText: string | null;
  now: Date;
}

export type InboundOutreachAction = "none" | "opted_out" | "consent_granted" | "declined";

export interface InboundOutreachResult {
  handled: boolean;
  continueWithAi: boolean;
  action: InboundOutreachAction;
  ackSent: boolean;
}

export async function handleInboundOutreach(
  input: InboundOutreachInput,
  deps: InboundOutreachDeps
): Promise<InboundOutreachResult> {
  if (input.intent.kind === "none") {
    return {
      handled: false,
      continueWithAi: true,
      action: "none",
      ackSent: false,
    };
  }

  if (input.intent.kind === "followup_yes") {
    await deps.recordConsent({
      contactId: input.contactId,
      channel: CONSENT_CHANNEL_WHATSAPP,
      scope: CONSENT_SCOPE_FOLLOWUP,
      status: "granted",
      source: "template_reply",
      wording: input.rawText,
      evidenceRef: input.wamid,
      capturedAt: input.now.toISOString(),
    });

    return {
      handled: true,
      continueWithAi: true,
      action: "consent_granted",
      ackSent: false,
    };
  }

  if (input.intent.kind === "opt_out") {
    await deps.recordConsent({
      contactId: input.contactId,
      channel: CONSENT_CHANNEL_WHATSAPP,
      scope: CONSENT_SCOPE_FOLLOWUP,
      status: "withdrawn",
      source: "customer_stop",
      wording: input.rawText,
      evidenceRef: input.wamid,
      capturedAt: input.now.toISOString(),
    });

    let ackSent = false;
    try {
      await deps.sendText({
        to: input.to,
        leadId: input.leadId,
        body: ACK_OPT_OUT,
      });
      ackSent = true;
    } catch (error) {
      console.error(
        "[Outreach] Acknowledgement failed:",
        error instanceof Error ? error.message : String(error)
      );
      ackSent = false;
    }

    return {
      handled: true,
      continueWithAi: false,
      action: "opted_out",
      ackSent,
    };
  }

  if (input.intent.kind === "followup_not_now") {
    await deps.closeLead({
      leadId: input.leadId,
      reason: CLOSE_REASON_DECLINED,
      nowIso: input.now.toISOString(),
    });

    let ackSent = false;
    try {
      await deps.sendText({
        to: input.to,
        leadId: input.leadId,
        body: ACK_NOT_NOW,
      });
      ackSent = true;
    } catch (error) {
      console.error(
        "[Outreach] Acknowledgement failed:",
        error instanceof Error ? error.message : String(error)
      );
      ackSent = false;
    }

    return {
      handled: true,
      continueWithAi: false,
      action: "declined",
      ackSent,
    };
  }

  return {
    handled: false,
    continueWithAi: true,
    action: "none",
    ackSent: false,
  };
}

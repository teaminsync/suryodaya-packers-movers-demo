/**
 * Outreach service: record consent, check outreach status, send follow-up
 */

import { currentConsent, type ConsentRow, CONSENT_CHANNEL_WHATSAPP, CONSENT_SCOPE_FOLLOWUP } from "./consent.js";
import { decideOutreach, isServiceWindowOpen, type OutreachAction } from "./policy.js";
import { buildFollowupTemplateParams, buildClickToChatLink, renderFollowupTemplateText, TEMPLATE_ENQUIRY_FOLLOWUP, TEMPLATE_LANGUAGE, BUTTON_PAYLOAD_YES, BUTTON_PAYLOAD_NOT_NOW } from "./messages.js";
import type { ConsentState } from "./consent.js";

export interface OutreachLead {
  id: string;
  contact_id: string | null;
  contact_name: string | null;
  origin: string | null;
  destination: string | null;
  closed_at: string | Date | null;
}

export interface OutreachContact {
  id: string;
  phone_e164: string | null;
  display_name: string | null;
}

export interface OutreachDeps {
  getLead(leadId: string): Promise<OutreachLead | undefined>;
  getContact(contactId: string): Promise<OutreachContact | undefined>;
  getConsentRows(contactId: string): Promise<ConsentRow[]>;
  getLastInboundAt(contactId: string): Promise<string | Date | null>;
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
  sendTemplate(params: {
    to: string;
    templateName: string;
    languageCode: string;
    bodyParams: string[];
    buttonPayloads: string[];
  }): Promise<{ wamid: string | null }>;
  recordOutboundMessage(params: {
    leadId: string;
    wamid: string | null;
    body: string;
  }): Promise<void>;
  businessNumber: string | undefined;
}

export interface OutreachStatus {
  action: OutreachAction;
  reason: string;
  consent: ConsentState;
  windowOpen: boolean;
  closed: boolean;
  clickToChatLink: string | null;
}

interface EvaluateResult {
  lead: OutreachLead | undefined;
  contact: OutreachContact | undefined;
  status: OutreachStatus;
}

async function evaluate(leadId: string, now: Date, deps: OutreachDeps): Promise<EvaluateResult> {
  const lead = await deps.getLead(leadId);

  if (!lead) {
    return {
      lead: undefined,
      contact: undefined,
      status: {
        action: "needs_human_call",
        reason: "lead not found",
        consent: "unknown",
        windowOpen: false,
        closed: false,
        clickToChatLink: null,
      },
    };
  }

  let contact: OutreachContact | undefined = undefined;
  if (lead.contact_id !== null) {
    contact = await deps.getContact(lead.contact_id);
  }

  const phone = contact?.phone_e164 ?? null;

  const consentRows = contact ? await deps.getConsentRows(contact.id) : [];
  const consent = currentConsent(consentRows, CONSENT_CHANNEL_WHATSAPP, CONSENT_SCOPE_FOLLOWUP);

  const lastInbound = contact ? await deps.getLastInboundAt(contact.id) : null;
  const windowOpen = isServiceWindowOpen(lastInbound, now);

  const decision = decideOutreach({ phoneE164: phone, consent, windowOpen });

  const closed = lead.closed_at !== null && lead.closed_at !== undefined;

  const clickToChatLink = decision.action === "offer_click_to_chat" && deps.businessNumber
    ? buildClickToChatLink({ businessNumber: deps.businessNumber, leadId })
    : null;

  return {
    lead,
    contact,
    status: {
      action: decision.action,
      reason: decision.reason,
      consent,
      windowOpen,
      closed,
      clickToChatLink,
    },
  };
}

export async function getOutreachStatus(leadId: string, now: Date, deps: OutreachDeps): Promise<OutreachStatus | null> {
  const { lead, status } = await evaluate(leadId, now, deps);
  if (!lead) {
    return null;
  }
  return status;
}

export type SendFollowupResult =
  | { ok: true; wamid: string | null }
  | { ok: false; code: "lead_not_found" | "lead_closed" | "not_allowed" | "send_failed"; action?: OutreachAction; reason: string };

export async function sendFollowup(leadId: string, now: Date, deps: OutreachDeps): Promise<SendFollowupResult> {
  const { lead, contact, status } = await evaluate(leadId, now, deps);

  if (!lead) {
    return { ok: false, code: "lead_not_found", reason: "lead not found" };
  }

  if (status.closed) {
    return { ok: false, code: "lead_closed", reason: "enquiry is closed" };
  }

  if (status.action !== "send_template") {
    let reason = status.reason;
    if (status.action === "reply_freeform") {
      reason = "customer messaged within the last 24 hours: reply in the chat instead";
    }
    return { ok: false, code: "not_allowed", action: status.action, reason };
  }

  const params = buildFollowupTemplateParams({
    contactName: contact?.display_name ?? lead.contact_name,
    origin: lead.origin,
    destination: lead.destination,
  });

  const phone = contact?.phone_e164 ?? "";
  const to = phone.replace(/\D/g, "");

  let sent: { wamid: string | null };
  try {
    sent = await deps.sendTemplate({
      to,
      templateName: TEMPLATE_ENQUIRY_FOLLOWUP,
      languageCode: TEMPLATE_LANGUAGE,
      bodyParams: params,
      buttonPayloads: [BUTTON_PAYLOAD_YES, BUTTON_PAYLOAD_NOT_NOW],
    });
  } catch (error) {
    return {
      ok: false,
      code: "send_failed",
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  await deps.recordOutboundMessage({
    leadId,
    wamid: sent.wamid,
    body: renderFollowupTemplateText(params),
  });

  return { ok: true, wamid: sent.wamid };
}

export type StaffConsentResult =
  | { ok: true }
  | { ok: false; code: "lead_not_found" | "no_contact" | "note_required" | "note_too_long" };

export async function recordStaffConsent(leadId: string, note: string, now: Date, deps: OutreachDeps): Promise<StaffConsentResult> {
  const lead = await deps.getLead(leadId);

  if (!lead) {
    return { ok: false, code: "lead_not_found" };
  }

  if (lead.contact_id === null) {
    return { ok: false, code: "no_contact" };
  }

  const contact = await deps.getContact(lead.contact_id);
  if (!contact) {
    return { ok: false, code: "no_contact" };
  }

  const trimmed = note.trim();

  if (trimmed === "") {
    return { ok: false, code: "note_required" };
  }

  if (trimmed.length > 500) {
    return { ok: false, code: "note_too_long" };
  }

  await deps.recordConsent({
    contactId: contact.id,
    channel: CONSENT_CHANNEL_WHATSAPP,
    scope: CONSENT_SCOPE_FOLLOWUP,
    status: "granted",
    source: "staff_recorded",
    wording: trimmed,
    evidenceRef: null,
    capturedAt: now.toISOString(),
  });

  return { ok: true };
}

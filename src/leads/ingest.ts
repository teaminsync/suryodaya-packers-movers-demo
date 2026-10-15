/**
 * Inquiry ingestion logic
 */

import { normalizePhoneE164 } from "./phone.js";
import { decideEnquiry, type EnquiryCreateReason } from "./enquiry-policy.js";
import type { InquiryEvent } from "../intake/types.js";
import type { Contact, Lead } from "./types.js";

export interface IngestDeps {
  touchpointExists(source: string, externalRef: string): Promise<boolean>;
  findContactByIdentity(channel: string, externalId: string): Promise<Contact | undefined>;
  upsertContactByPhone(phoneE164: string, displayName: string | null): Promise<Contact>;
  createContactWithoutPhone(displayName: string | null): Promise<Contact>;
  ensureIdentity(contactId: string, channel: string, externalId: string): Promise<void>;
  findLatestLeadForContact(contactId: string): Promise<Lead | undefined>;
  touchLead(leadId: string, nowIso: string): Promise<void>;
  createLeadForContact(params: {
    whatsappNumber: string;
    contactName: string | null;
    rawEnquiryText: string;
    contactId: string;
    source: string;
  }): Promise<Lead>;
  recordTouchpoint(params: {
    leadId: string;
    contactId: string;
    source: string;
    externalRef: string | null;
    rawPayload: string | null;
    receivedAt: string;
  }): Promise<boolean>;
  recordInboundMessage(params: {
    leadId: string;
    channel: string;
    body: string;
  }): Promise<void>;
}

export interface IngestResult {
  duplicate: boolean;
  lead?: Lead;
  contact?: Contact;
  createdEnquiry?: boolean;
  reason: "duplicate" | "attached" | EnquiryCreateReason;
}

export async function ingestInquiry(
  event: InquiryEvent,
  now: Date,
  deps: IngestDeps
): Promise<IngestResult> {
  // Check for duplicate
  if (await deps.touchpointExists(event.source, event.externalRef)) {
    return { duplicate: true, reason: "duplicate" };
  }

  // Normalize phone
  const phone = normalizePhoneE164(event.phoneRaw);

  // Find or create contact
  let contact: Contact;
  if (phone !== null) {
    contact = await deps.upsertContactByPhone(phone, event.contactName);
  } else if (event.email !== null) {
    const existing = await deps.findContactByIdentity("email", event.email);
    if (existing) {
      contact = existing;
    } else {
      contact = await deps.createContactWithoutPhone(event.contactName);
    }
  } else {
    contact = await deps.createContactWithoutPhone(event.contactName);
  }

  // Ensure email identity
  if (event.email !== null) {
    await deps.ensureIdentity(contact.id, "email", event.email);
  }

  // Decide enquiry action
  const latest = await deps.findLatestLeadForContact(contact.id);
  const decision = decideEnquiry(latest, now);

  // Attach or create
  let lead: Lead;
  let createdEnquiry: boolean;
  let reason: "attached" | EnquiryCreateReason;

  if (decision.action === "attach") {
    await deps.touchLead(latest!.id, now.toISOString());
    lead = latest!;
    createdEnquiry = false;
    reason = "attached";
  } else {
    lead = await deps.createLeadForContact({
      whatsappNumber: phone !== null ? phone.slice(1) : "",
      contactName: event.contactName,
      rawEnquiryText: event.text,
      contactId: contact.id,
      source: event.source,
    });
    createdEnquiry = true;
    reason = decision.reason;
  }

  // Record touchpoint
  const inserted = await deps.recordTouchpoint({
    leadId: lead.id,
    contactId: contact.id,
    source: event.source,
    externalRef: event.externalRef,
    rawPayload: event.rawPayload,
    receivedAt: event.receivedAt.toISOString(),
  });

  if (!inserted) {
    return {
      duplicate: true,
      lead,
      contact,
      createdEnquiry,
      reason: "duplicate",
    };
  }

  // Record inbound message
  await deps.recordInboundMessage({
    leadId: lead.id,
    channel: event.source,
    body: event.text,
  });

  return {
    duplicate: false,
    lead,
    contact,
    createdEnquiry,
    reason,
  };
}

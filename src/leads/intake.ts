/**
 * Contact and enquiry resolution (intake logic)
 */

import { normalizePhoneE164 } from "./phone.js";
import { decideEnquiry } from "./enquiry-policy.js";
import type { Contact, Lead } from "./types.js";
import type { EnquiryCreateReason } from "./enquiry-policy.js";

export interface IntakeDeps {
  findContactByIdentity(channel: string, externalId: string): Promise<Contact | undefined>;
  upsertContactByPhone(phoneE164: string, displayName: string | null): Promise<Contact>;
  createContactWithoutPhone(displayName: string | null): Promise<Contact>;
  setDisplayNameIfMissing(contactId: string, displayName: string): Promise<void>;
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
}

export interface ResolveEnquiryInput {
  channel: string;
  externalId: string;
  contactName: string | null;
  firstMessageText: string;
  externalRef: string | null;
  now: Date;
  forceAttachToLatest?: boolean;
}

export interface ResolveEnquiryResult {
  lead: Lead;
  contact: Contact;
  createdEnquiry: boolean;
  reason: "attached" | EnquiryCreateReason;
}

export async function resolveEnquiry(
  input: ResolveEnquiryInput,
  deps: IntakeDeps
): Promise<ResolveEnquiryResult> {
  let contact = await deps.findContactByIdentity(input.channel, input.externalId);

  if (contact && !contact.display_name && input.contactName) {
    await deps.setDisplayNameIfMissing(contact.id, input.contactName);
  }

  if (!contact) {
    const phone = normalizePhoneE164(input.externalId);
    if (phone !== null) {
      contact = await deps.upsertContactByPhone(phone, input.contactName);
    } else {
      contact = await deps.createContactWithoutPhone(input.contactName);
    }
    await deps.ensureIdentity(contact.id, input.channel, input.externalId);
  }

  const latest = await deps.findLatestLeadForContact(contact.id);
  const decision = decideEnquiry(latest, input.now);

  if (decision.action === "attach" || (input.forceAttachToLatest === true && latest !== undefined)) {
    await deps.touchLead(latest!.id, input.now.toISOString());
    return {
      lead: latest!,
      contact,
      createdEnquiry: false,
      reason: "attached",
    };
  }

  const lead = await deps.createLeadForContact({
    whatsappNumber: input.externalId,
    contactName: input.contactName,
    rawEnquiryText: input.firstMessageText,
    contactId: contact.id,
    source: input.channel,
  });

  await deps.recordTouchpoint({
    leadId: lead.id,
    contactId: contact.id,
    source: input.channel,
    externalRef: input.externalRef,
    rawPayload: null,
    receivedAt: input.now.toISOString(),
  });

  return {
    lead,
    contact,
    createdEnquiry: true,
    reason: decision.reason,
  };
}

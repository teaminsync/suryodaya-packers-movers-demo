/**
 * Database wiring for intake dependencies
 */

import { sql } from "./db.js";
import { createLead } from "./repository.js";
import {
  findContactByIdentity,
  upsertContactByPhone,
  createContactWithoutPhone,
  setDisplayNameIfMissing,
  ensureIdentity,
  recordTouchpoint,
} from "./contacts.js";
import type { IntakeDeps } from "./intake.js";
import type { Lead } from "./types.js";

export const intakeDeps: IntakeDeps = {
  findContactByIdentity,
  upsertContactByPhone,
  createContactWithoutPhone,
  setDisplayNameIfMissing,
  ensureIdentity,
  recordTouchpoint,

  async findLatestLeadForContact(contactId: string): Promise<Lead | undefined> {
    const result = await sql<Lead[]>`
      SELECT * FROM leads
      WHERE contact_id = ${contactId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return result[0];
  },

  async touchLead(leadId: string, nowIso: string): Promise<void> {
    await sql`
      UPDATE leads
      SET updated_at = ${nowIso}
      WHERE id = ${leadId}
    `;
  },

  async createLeadForContact(params: {
    whatsappNumber: string;
    contactName: string | null;
    rawEnquiryText: string;
    contactId: string;
    source: string;
  }): Promise<Lead> {
    return createLead(params.whatsappNumber, params.contactName, params.rawEnquiryText, {
      contactId: params.contactId,
      source: params.source,
    });
  },
};

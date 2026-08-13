/**
 * CRUD operations for leads, conversation state, and processed messages
 */

import { randomUUID } from "crypto";
import { sql } from "./db.js";
import type {
  Lead,
  BookingOffer,
  SlotOption,
  LeadStatus,
} from "./types.js";

/**
 * Check if a message has already been processed (idempotency)
 */
export async function isMessageProcessed(wamid: string): Promise<boolean> {
  const result = await sql`
    SELECT wamid FROM processed_messages WHERE wamid = ${wamid}
  `;
  return result.length > 0;
}

/**
 * Mark a message as processed
 */
export async function markMessageProcessed(
  wamid: string,
  leadId: string | null
): Promise<void> {
  await sql`
    INSERT INTO processed_messages (wamid, lead_id, processed_at)
    VALUES (${wamid}, ${leadId}, ${new Date().toISOString()})
  `;
}

/**
 * Find an active lead by WhatsApp number (not yet booked)
 */
export async function findActiveLead(
  whatsappNumber: string
): Promise<Lead | undefined> {
  const result = await sql<Lead[]>`
    SELECT * FROM leads
    WHERE whatsapp_number = ${whatsappNumber}
    AND status != 'booked'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return result[0];
}

/**
 * Create a new lead
 */
export async function createLead(
  whatsappNumber: string,
  contactName: string | null,
  rawEnquiryText: string
): Promise<Lead> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const result = await sql<Lead[]>`
    INSERT INTO leads (
      id, whatsapp_number, contact_name, status, raw_enquiry_text, created_at, updated_at
    ) VALUES (
      ${id}, ${whatsappNumber}, ${contactName}, 'new', ${rawEnquiryText}, ${now}, ${now}
    )
    RETURNING *
  `;

  return result[0];
}

/**
 * Find lead by ID
 */
export async function findLeadById(id: string): Promise<Lead | undefined> {
  const result = await sql<Lead[]>`
    SELECT * FROM leads WHERE id = ${id}
  `;
  return result[0];
}

/**
 * Merge lead fields incrementally - only updates provided fields
 */
export async function mergeLeadFields(
  leadId: string,
  fields: Partial<{
    moveType: string;
    origin: string;
    destination: string;
    urgency: string;
    hasSpecialItems: boolean;
    specialItems: string[];
    estimatedVolume: string;
    requiresPacking: boolean;
  }>,
  aiProviderUsed?: string,
  aiWasFailover?: boolean
): Promise<void> {
  // Skip if no fields to update
  if (Object.keys(fields).length === 0 && !aiProviderUsed) {
    return;
  }

  const updates: any[] = [new Date().toISOString()]; // updated_at is always first
  const setClauses: string[] = ["updated_at = $1"];
  let paramIndex = 2;

  if (fields.moveType !== undefined) {
    setClauses.push(`move_type = $${paramIndex++}`);
    updates.push(fields.moveType);
  }
  if (fields.origin !== undefined) {
    setClauses.push(`origin = $${paramIndex++}`);
    updates.push(fields.origin);
  }
  if (fields.destination !== undefined) {
    setClauses.push(`destination = $${paramIndex++}`);
    updates.push(fields.destination);
  }
  if (fields.urgency !== undefined) {
    setClauses.push(`urgency = $${paramIndex++}`);
    updates.push(fields.urgency);
  }
  if (fields.hasSpecialItems !== undefined) {
    setClauses.push(`has_special_items = $${paramIndex++}`);
    updates.push(fields.hasSpecialItems);
  }
  if (fields.specialItems !== undefined) {
    setClauses.push(`special_items = $${paramIndex++}`);
    updates.push(JSON.stringify(fields.specialItems));
  }
  if (fields.estimatedVolume !== undefined) {
    setClauses.push(`estimated_volume = $${paramIndex++}`);
    updates.push(fields.estimatedVolume);
  }
  if (fields.requiresPacking !== undefined) {
    setClauses.push(`requires_packing = $${paramIndex++}`);
    updates.push(fields.requiresPacking);
  }
  if (aiProviderUsed !== undefined) {
    setClauses.push(`ai_provider_used = $${paramIndex++}`);
    updates.push(aiProviderUsed);
  }
  if (aiWasFailover !== undefined) {
    setClauses.push(`ai_was_failover = $${paramIndex++}`);
    updates.push(aiWasFailover);
  }

  updates.push(leadId);

  await sql.unsafe(`
    UPDATE leads 
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex}
  `, updates);
}

/**
 * Set lead escalation status
 */
export async function setLeadEscalated(leadId: string): Promise<void> {
  await sql`
    UPDATE leads SET
      escalated = TRUE,
      escalated_at = ${new Date().toISOString()},
      updated_at = ${new Date().toISOString()}
    WHERE id = ${leadId}
  `;
}

/**
 * Update lead status explicitly
 */
export async function setLeadStatus(
  leadId: string,
  status: LeadStatus
): Promise<void> {
  await sql`
    UPDATE leads SET
      status = ${status},
      updated_at = ${new Date().toISOString()}
    WHERE id = ${leadId}
  `;
}

/**
 * Create a booking offer
 */
export async function createBookingOffer(
  leadId: string,
  slotOptions: SlotOption[]
): Promise<BookingOffer> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const result = await sql<BookingOffer[]>`
    INSERT INTO booking_offers (id, lead_id, slot_options, offered_at)
    VALUES (${id}, ${leadId}, ${JSON.stringify(slotOptions)}, ${now})
    RETURNING *
  `;

  return result[0];
}

/**
 * Find booking offer by ID
 */
export async function findBookingOfferById(
  id: string
): Promise<BookingOffer | undefined> {
  const result = await sql<BookingOffer[]>`
    SELECT * FROM booking_offers WHERE id = ${id}
  `;
  return result[0];
}

/**
 * Find open booking offer for a lead
 */
export async function findOpenBookingOffer(
  leadId: string
): Promise<BookingOffer | undefined> {
  const result = await sql<BookingOffer[]>`
    SELECT * FROM booking_offers
    WHERE lead_id = ${leadId}
    AND selected_slot IS NULL
    ORDER BY offered_at DESC
    LIMIT 1
  `;
  return result[0];
}

/**
 * Record slot selection
 */
export async function recordSlotSelection(
  offerId: string,
  selectedSlot: string
): Promise<void> {
  await sql`
    UPDATE booking_offers SET
      selected_slot = ${selectedSlot},
      responded_at = ${new Date().toISOString()}
    WHERE id = ${offerId}
  `;
}

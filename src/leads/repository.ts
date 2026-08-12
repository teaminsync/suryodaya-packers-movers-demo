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
 * Update lead with qualification data
 */
export async function updateLeadQualification(
  leadId: string,
  qualificationData: {
    moveType: string;
    origin: string;
    destination: string;
    urgency: string;
    hasSpecialItems: boolean;
    specialItems?: string[];
    estimatedVolume: string;
    requiresPacking: boolean;
  },
  aiProviderUsed: string,
  aiWasFailover: boolean
): Promise<void> {
  await sql`
    UPDATE leads SET
      move_type = ${qualificationData.moveType},
      origin = ${qualificationData.origin},
      destination = ${qualificationData.destination},
      urgency = ${qualificationData.urgency},
      has_special_items = ${qualificationData.hasSpecialItems},
      special_items = ${
        qualificationData.specialItems
          ? JSON.stringify(qualificationData.specialItems)
          : null
      },
      estimated_volume = ${qualificationData.estimatedVolume},
      requires_packing = ${qualificationData.requiresPacking},
      ai_provider_used = ${aiProviderUsed},
      ai_was_failover = ${aiWasFailover},
      status = 'qualified',
      updated_at = ${new Date().toISOString()}
    WHERE id = ${leadId}
  `;
}

/**
 * Update lead status
 */
export async function updateLeadStatus(
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

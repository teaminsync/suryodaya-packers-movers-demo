/**
 * CRUD operations for leads, conversation state, and processed messages
 */

import { randomUUID } from "crypto";
import { getDb, saveDatabase } from "./db.js";
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
  const db = await getDb();
  const result = db.exec("SELECT wamid FROM processed_messages WHERE wamid = ?", [wamid]);
  return result.length > 0 && result[0].values.length > 0;
}

/**
 * Mark a message as processed
 */
export async function markMessageProcessed(
  wamid: string,
  leadId: string | null
): Promise<void> {
  const db = await getDb();
  db.run(
    "INSERT INTO processed_messages (wamid, lead_id, processed_at) VALUES (?, ?, ?)",
    [wamid, leadId, new Date().toISOString()]
  );
  saveDatabase();
}

/**
 * Find an active lead by WhatsApp number (not yet booked)
 */
export async function findActiveLead(whatsappNumber: string): Promise<Lead | undefined> {
  const db = await getDb();
  const result = db.exec(
    "SELECT * FROM leads WHERE whatsapp_number = ? AND status != 'booked' ORDER BY created_at DESC LIMIT 1",
    [whatsappNumber]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return undefined;
  }

  return rowToLead(result[0].columns, result[0].values[0]);
}

/**
 * Create a new lead
 */
export async function createLead(
  whatsappNumber: string,
  contactName: string | null,
  rawEnquiryText: string
): Promise<Lead> {
  const db = await getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO leads (
      id, whatsapp_number, contact_name, status, raw_enquiry_text, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, whatsappNumber, contactName, "new", rawEnquiryText, now, now]
  );

  saveDatabase();
  return (await findLeadById(id))!;
}

/**
 * Find lead by ID
 */
export async function findLeadById(id: string): Promise<Lead | undefined> {
  const db = await getDb();
  const result = db.exec("SELECT * FROM leads WHERE id = ?", [id]);

  if (result.length === 0 || result[0].values.length === 0) {
    return undefined;
  }

  return rowToLead(result[0].columns, result[0].values[0]);
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
  const db = await getDb();

  db.run(
    `UPDATE leads SET
      move_type = ?,
      origin = ?,
      destination = ?,
      urgency = ?,
      has_special_items = ?,
      special_items = ?,
      estimated_volume = ?,
      requires_packing = ?,
      ai_provider_used = ?,
      ai_was_failover = ?,
      status = 'qualified',
      updated_at = ?
    WHERE id = ?`,
    [
      qualificationData.moveType,
      qualificationData.origin,
      qualificationData.destination,
      qualificationData.urgency,
      qualificationData.hasSpecialItems ? 1 : 0,
      qualificationData.specialItems
        ? JSON.stringify(qualificationData.specialItems)
        : null,
      qualificationData.estimatedVolume,
      qualificationData.requiresPacking ? 1 : 0,
      aiProviderUsed,
      aiWasFailover ? 1 : 0,
      new Date().toISOString(),
      leadId,
    ]
  );

  saveDatabase();
}

/**
 * Update lead status
 */
export async function updateLeadStatus(leadId: string, status: LeadStatus): Promise<void> {
  const db = await getDb();
  db.run(
    "UPDATE leads SET status = ?, updated_at = ? WHERE id = ?",
    [status, new Date().toISOString(), leadId]
  );
  saveDatabase();
}

/**
 * Create a booking offer
 */
export async function createBookingOffer(
  leadId: string,
  slotOptions: SlotOption[]
): Promise<BookingOffer> {
  const db = await getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO booking_offers (id, lead_id, slot_options, offered_at)
    VALUES (?, ?, ?, ?)`,
    [id, leadId, JSON.stringify(slotOptions), now]
  );

  saveDatabase();
  return (await findBookingOfferById(id))!;
}

/**
 * Find booking offer by ID
 */
export async function findBookingOfferById(id: string): Promise<BookingOffer | undefined> {
  const db = await getDb();
  const result = db.exec("SELECT * FROM booking_offers WHERE id = ?", [id]);

  if (result.length === 0 || result[0].values.length === 0) {
    return undefined;
  }

  return rowToBookingOffer(result[0].columns, result[0].values[0]);
}

/**
 * Find open booking offer for a lead
 */
export async function findOpenBookingOffer(
  leadId: string
): Promise<BookingOffer | undefined> {
  const db = await getDb();
  const result = db.exec(
    "SELECT * FROM booking_offers WHERE lead_id = ? AND selected_slot IS NULL ORDER BY offered_at DESC LIMIT 1",
    [leadId]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return undefined;
  }

  return rowToBookingOffer(result[0].columns, result[0].values[0]);
}

/**
 * Record slot selection
 */
export async function recordSlotSelection(
  offerId: string,
  selectedSlot: string
): Promise<void> {
  const db = await getDb();
  db.run(
    "UPDATE booking_offers SET selected_slot = ?, responded_at = ? WHERE id = ?",
    [selectedSlot, new Date().toISOString(), offerId]
  );
  saveDatabase();
}

/**
 * Helper: Convert sql.js row to Lead object
 */
function rowToLead(columns: string[], values: any[]): Lead {
  const obj: any = {};
  columns.forEach((col, idx) => {
    obj[col] = values[idx];
  });
  return obj as Lead;
}

/**
 * Helper: Convert sql.js row to BookingOffer object
 */
function rowToBookingOffer(columns: string[], values: any[]): BookingOffer {
  const obj: any = {};
  columns.forEach((col, idx) => {
    obj[col] = values[idx];
  });
  return obj as BookingOffer;
}

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

/**
 * Create a media capture record
 */
export async function createMediaCapture(params: {
  leadId: string;
  wamid: string;
  mediaType: "image" | "video";
  storagePath: string | null;
  assetType: string;
  suggestedRoomLabel: string | null;
  items: unknown[];
  totalEstimatedCubicFeet: number;
  totalEstimatedWeightKg: number;
  packingComplexity: string;
  specialHandlingNotes: string[];
  confidence: string;
  aiProviderUsed: string;
  aiWasFailover: boolean;
}): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();

  await sql`
    INSERT INTO media_captures (
      id, lead_id, wamid, media_type, storage_path,
      asset_type, suggested_room_label, items,
      total_estimated_cubic_feet, total_estimated_weight_kg,
      packing_complexity, special_handling_notes, confidence,
      ai_provider_used, ai_was_failover, created_at
    ) VALUES (
      ${id}, ${params.leadId}, ${params.wamid}, ${params.mediaType}, ${params.storagePath},
      ${params.assetType}, ${params.suggestedRoomLabel}, ${JSON.stringify(params.items)},
      ${params.totalEstimatedCubicFeet}, ${params.totalEstimatedWeightKg},
      ${params.packingComplexity}, ${JSON.stringify(params.specialHandlingNotes)}, ${params.confidence},
      ${params.aiProviderUsed}, ${params.aiWasFailover}, ${now}
    )
  `;
  
  return id;
}

/**
 * Row interface for media capture aggregation
 */
export interface MediaCaptureRow {
  id: string;
  media_type: string;
  suggested_room_label: string | null;
  items: string; // JSON text, parse with JSON.parse
  total_estimated_cubic_feet: number;
  total_estimated_weight_kg: number;
  confidence: string;
}

/**
 * Get all media captures for a lead
 */
export async function getMediaCapturesForLead(
  leadId: string
): Promise<MediaCaptureRow[]> {
  const result = await sql<MediaCaptureRow[]>`
    SELECT 
      id, media_type, suggested_room_label, items,
      total_estimated_cubic_feet, total_estimated_weight_kg, confidence
    FROM media_captures
    WHERE lead_id = ${leadId}
    ORDER BY created_at ASC
  `;
  return result;
}

/**
 * Message history row interface
 */
export interface MessageRow {
  id: string;
  lead_id: string;
  wamid: string | null;
  direction: "inbound" | "outbound";
  sender_type: "customer" | "ai" | "system" | "human";
  message_type: "text" | "image" | "video" | "interactive" | "list";
  body: string | null;
  media_capture_id: string | null;
  created_at: string;
}

/**
 * Create a message record
 */
export async function createMessage(params: {
  leadId: string;
  wamid: string | null;
  direction: "inbound" | "outbound";
  senderType: "customer" | "ai" | "system" | "human";
  messageType: "text" | "image" | "video" | "interactive" | "list";
  body: string | null;
  mediaCaptureId?: string | null;
}): Promise<void> {
  const id = randomUUID();
  const now = new Date().toISOString();

  await sql`
    INSERT INTO messages (
      id, lead_id, wamid, direction, sender_type, message_type, body,
      media_capture_id, created_at
    ) VALUES (
      ${id}, ${params.leadId}, ${params.wamid}, ${params.direction},
      ${params.senderType}, ${params.messageType}, ${params.body},
      ${params.mediaCaptureId || null}, ${now}
    )
    ON CONFLICT DO NOTHING
  `;
}

/**
 * Get all messages for a lead
 */
export async function getMessagesForLead(leadId: string): Promise<MessageRow[]> {
  const result = await sql<MessageRow[]>`
    SELECT * FROM messages WHERE lead_id = ${leadId} ORDER BY created_at ASC
  `;
  return result;
}

/**
 * Set human takeover flag for a lead
 */
export async function setHumanTakeover(leadId: string, enabled: boolean): Promise<void> {
  await sql`
    UPDATE leads SET 
      human_takeover = ${enabled}, 
      updated_at = ${new Date().toISOString()}
    WHERE id = ${leadId}
  `;
}

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
 * Unmark a message as processed (for retry after failed handling)
 */
export async function unmarkMessageProcessed(wamid: string): Promise<void> {
  await sql`
    DELETE FROM processed_messages WHERE wamid = ${wamid}
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
  rawEnquiryText: string,
  options?: { contactId?: string | null; source?: string | null }
): Promise<Lead> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const result = await sql<Lead[]>`
    INSERT INTO leads (
      id, whatsapp_number, contact_name, status, raw_enquiry_text, contact_id, source, created_at, updated_at
    ) VALUES (
      ${id}, ${whatsappNumber}, ${contactName}, 'new', ${rawEnquiryText}, ${options?.contactId ?? null}, ${options?.source ?? null}, ${now}, ${now}
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
  const now = new Date().toISOString();
  
  await sql`
    UPDATE booking_offers SET
      selected_slot = ${selectedSlot},
      responded_at = ${now}
    WHERE id = ${offerId}
  `;

  await sql`
    UPDATE booking_offers SET
      superseded_at = ${now}
    WHERE lead_id = (SELECT lead_id FROM booking_offers WHERE id = ${offerId})
      AND id <> ${offerId}
      AND selected_slot IS NOT NULL
      AND superseded_at IS NULL
  `;
}

/**
 * Record survey calendar details for a booking offer
 */
export async function recordSurveyCalendar(
  offerId: string,
  info: {
    startsAt: Date;
    endsAt: Date;
    status: string;
    eventId: string | null;
    eventLink: string | null;
  }
): Promise<void> {
  await sql`
    UPDATE booking_offers SET
      survey_starts_at = ${info.startsAt.toISOString()},
      survey_ends_at = ${info.endsAt.toISOString()},
      calendar_status = ${info.status},
      calendar_event_id = ${info.eventId},
      calendar_event_link = ${info.eventLink}
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
  roomKey: string;
  roomQualifier: string | null;
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
      asset_type, room_key, room_qualifier, suggested_room_label, items,
      total_estimated_cubic_feet, total_estimated_weight_kg,
      packing_complexity, special_handling_notes, confidence,
      ai_provider_used, ai_was_failover, created_at
    ) VALUES (
      ${id}, ${params.leadId}, ${params.wamid}, ${params.mediaType}, ${params.storagePath},
      ${params.assetType}, ${params.roomKey}, ${params.roomQualifier}, ${params.suggestedRoomLabel}, ${JSON.stringify(params.items)},
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
  room_key: string | null;
  room_qualifier: string | null;
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
      id, media_type, room_key, room_qualifier, suggested_room_label, items,
      total_estimated_cubic_feet, total_estimated_weight_kg, confidence
    FROM media_captures
    WHERE lead_id = ${leadId}
    ORDER BY created_at ASC
  `;
  return result;
}

/**
 * Get media captures for de-duplication context (lightweight)
 */
export async function getMediaCapturesForDedupe(
  leadId: string
): Promise<Array<{ id: string; room_key: string | null; room_qualifier: string | null; items: string }>> {
  const result = await sql<Array<{ id: string; room_key: string | null; room_qualifier: string | null; items: string }>>`
    SELECT id, room_key, room_qualifier, items
    FROM media_captures
    WHERE lead_id = ${leadId}
    ORDER BY created_at ASC
  `;
  return result;
}

/**
 * Get the latest media capture for a lead
 */
export async function getLatestMediaCaptureForLead(
  leadId: string
): Promise<{ id: string; room_key: string | null; room_qualifier: string | null; suggested_room_label: string | null; items: string; created_at: string } | undefined> {
  const result = await sql<Array<{ id: string; room_key: string | null; room_qualifier: string | null; suggested_room_label: string | null; items: string; created_at: string }>>`
    SELECT id, room_key, room_qualifier, suggested_room_label, items, created_at
    FROM media_captures
    WHERE lead_id = ${leadId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return result[0];
}

/**
 * Update media capture room information
 */
export async function updateMediaCaptureRoom(params: {
  captureId: string;
  roomKey: string;
  roomQualifier: string | null;
  label: string;
  itemsJson: string | null;
  cubicFeet: number | null;
  weightKg: number | null;
}): Promise<void> {
  if (params.itemsJson !== null && params.cubicFeet !== null && params.weightKg !== null) {
    await sql`
      UPDATE media_captures SET
        room_key = ${params.roomKey},
        room_qualifier = ${params.roomQualifier},
        suggested_room_label = ${params.label},
        items = ${params.itemsJson},
        total_estimated_cubic_feet = ${params.cubicFeet},
        total_estimated_weight_kg = ${params.weightKg}
      WHERE id = ${params.captureId}
    `;
  } else {
    await sql`
      UPDATE media_captures SET
        room_key = ${params.roomKey},
        room_qualifier = ${params.roomQualifier},
        suggested_room_label = ${params.label}
      WHERE id = ${params.captureId}
    `;
  }
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
  message_type: "text" | "image" | "video" | "interactive" | "list" | "button";
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
  messageType: "text" | "image" | "video" | "interactive" | "list" | "button";
  body: string | null;
  mediaCaptureId?: string | null;
  channel?: string;
}): Promise<void> {
  const id = randomUUID();
  const now = new Date().toISOString();

  await sql`
    INSERT INTO messages (
      id, lead_id, wamid, direction, sender_type, message_type, body,
      media_capture_id, channel, created_at
    ) VALUES (
      ${id}, ${params.leadId}, ${params.wamid}, ${params.direction},
      ${params.senderType}, ${params.messageType}, ${params.body},
      ${params.mediaCaptureId || null}, ${params.channel ?? "whatsapp"}, ${now}
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

export async function findPreviousConfirmedOffer(
  leadId: string,
  excludeOfferId: string
): Promise<{ id: string; calendar_event_id: string } | undefined> {
  const result = await sql<Array<{ id: string; calendar_event_id: string }>>`
    SELECT id, calendar_event_id
    FROM booking_offers
    WHERE lead_id = ${leadId}
      AND id <> ${excludeOfferId}
      AND selected_slot IS NOT NULL
      AND superseded_at IS NULL
      AND calendar_status = 'created'
      AND calendar_event_id IS NOT NULL
    ORDER BY responded_at DESC
    LIMIT 1
  `;
  return result[0];
}

export async function markOfferCalendarCancelled(offerId: string): Promise<void> {
  await sql`
    UPDATE booking_offers
    SET calendar_status = 'cancelled'
    WHERE id = ${offerId}
  `;
}

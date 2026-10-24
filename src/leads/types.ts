/**
 * Lead and conversation state types
 */

export type LeadStatus =
  | "new"
  | "gathering"
  | "booking_offered"
  | "booked";

export interface Lead {
  id: string;
  whatsapp_number: string;
  contact_name: string | null;
  status: LeadStatus;
  move_type: string | null;
  origin: string | null;
  destination: string | null;
  urgency: string | null;
  has_special_items: boolean;
  special_items: string | null; // JSON array as text
  estimated_volume: string | null;
  requires_packing: boolean;
  ai_provider_used: string | null; // 'claude' | 'gemini'
  ai_was_failover: boolean;
  escalated: boolean;
  escalated_at: string | null;
  human_takeover: boolean;
  raw_enquiry_text: string | null;
  contact_id: string | null;
  source: string | null;
  closed_at: string | null;
  closed_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcessedMessage {
  wamid: string;
  lead_id: string | null;
  processed_at: string;
}

export interface BookingOffer {
  id: string;
  lead_id: string;
  slot_options: string; // JSON array of {label, datetime}
  selected_slot: string | null;
  offered_at: string;
  responded_at: string | null;
}

export interface SlotOption {
  label: string;
  datetime: string; // ISO 8601
}

export interface Contact {
  id: string;
  phone_e164: string | null;
  display_name: string | null;
  instagram_username: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactIdentity {
  id: string;
  contact_id: string;
  channel: string;
  external_id: string;
  created_at: string;
}

export interface Touchpoint {
  id: string;
  lead_id: string;
  contact_id: string;
  source: string;
  external_ref: string | null;
  raw_payload: string | null;
  received_at: string;
  created_at: string;
}

export interface Consent {
  id: string;
  contact_id: string;
  channel: string;
  scope: string;
  status: string;
  source: string;
  wording: string | null;
  evidence_ref: string | null;
  captured_at: string;
  created_at: string;
}

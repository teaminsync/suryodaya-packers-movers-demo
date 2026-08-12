/**
 * Lead and conversation state types
 */

export type LeadStatus =
  | "new"
  | "qualified"
  | "ack_sent"
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
  raw_enquiry_text: string | null;
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

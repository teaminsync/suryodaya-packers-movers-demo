/**
 * Admin notification types
 */

export type AdminEventType = "booking_confirmed" | "human_requested" | "needs_followup";

export interface AdminEvent {
  type: AdminEventType;
  leadId: string;
  source: string | null;
  customerName: string | null;
  phone: string | null;
  moveType: string | null;
  origin: string | null;
  destination: string | null;
  estimatedVolume: string | null;
  urgency: string | null;
  specialItems: string[];
  lastMessage: string | null;
  slotLabel: string | null;
}

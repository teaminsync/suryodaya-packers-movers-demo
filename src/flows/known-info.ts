/**
 * Build known lead information from database lead fields
 */

import type { LeadInfo } from "./qualification.js";

export interface KnownInfoLead {
  move_type: string | null;
  origin: string | null;
  destination: string | null;
  urgency: string | null;
  estimated_volume: string | null;
  has_special_items: boolean | null;
  special_items: string | string[] | null;
  requires_packing: boolean | null;
}

export function buildKnownInfo(lead: KnownInfoLead): Partial<LeadInfo> {
  const result: Partial<LeadInfo> = {};

  const moveType = typeof lead.move_type === "string" ? lead.move_type.trim() : "";
  if (moveType !== "") {
    result.moveType = moveType as "local" | "intercity";
  }

  const origin = typeof lead.origin === "string" ? lead.origin.trim() : "";
  if (origin !== "") {
    result.origin = origin;
  }

  const destination = typeof lead.destination === "string" ? lead.destination.trim() : "";
  if (destination !== "") {
    result.destination = destination;
  }

  const urgency = typeof lead.urgency === "string" ? lead.urgency.trim() : "";
  if (urgency !== "") {
    result.urgency = urgency as "low" | "medium" | "high" | "urgent";
  }

  const estimatedVolume = typeof lead.estimated_volume === "string" ? lead.estimated_volume.trim() : "";
  if (estimatedVolume !== "") {
    result.estimatedVolume = estimatedVolume as "unknown" | "1bhk" | "2bhk" | "3bhk" | "office" | "commercial";
  }

  let items: string[] = [];
  if (Array.isArray(lead.special_items)) {
    items = lead.special_items
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item !== "");
  } else if (typeof lead.special_items === "string") {
    try {
      const parsed = JSON.parse(lead.special_items);
      if (Array.isArray(parsed)) {
        items = parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item !== "");
      }
    } catch {
      // Invalid JSON, no items
    }
  }

  if (items.length > 0) {
    result.specialItems = items;
  }

  if (lead.has_special_items === true || items.length > 0) {
    result.hasSpecialItems = true;
  }

  if (lead.requires_packing === true) {
    result.requiresPacking = true;
  }

  return result;
}

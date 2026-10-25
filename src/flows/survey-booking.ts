/**
 * Pure helper module for survey booking flow logic
 */

import type { ClaimResult } from "../calendar/survey-calendar.js";
import { NO_SLOTS_MESSAGE, buildFreshSlotsMessage, buildConfirmationMessage } from "./booking.js";
import type { SlotReplyResult } from "./slot-reply.js";

export interface SurveyBookingDeps {
  getSlotOptions(now: Date): Promise<Array<{ label: string; datetime: string }>>;
  claimSlot(input: { leadId: string; slot: { label: string; datetime: string } }): Promise<ClaimResult>;
}

/**
 * Build the initial slot offer message with numbered options
 */
export function buildSlotOfferMessage(slots: Array<{ label: string }>): string {
  const numbered = slots
    .map((slot, i) => `${i + 1}. ${slot.label}`)
    .join("\n");
  
  return `Great! Here are available survey times:\n\n${numbered}\n\nReply with the number of your preferred time.`;
}

/**
 * Offer survey slots to the user
 */
export async function offerSurveySlots(
  deps: SurveyBookingDeps,
  now: Date
): Promise<
  | { kind: "offered"; slots: Array<{ label: string; datetime: string }>; message: string }
  | { kind: "none"; message: string }
> {
  const slots = await deps.getSlotOptions(now);
  
  if (slots.length === 0) {
    return { kind: "none", message: NO_SLOTS_MESSAGE };
  }
  
  return {
    kind: "offered",
    slots,
    message: buildSlotOfferMessage(slots),
  };
}

/**
 * Resolve a user's slot choice, handling selection, staleness, and conflicts
 */
export async function resolveSlotChoice(
  deps: SurveyBookingDeps,
  input: {
    leadId: string;
    slots: Array<{ label: string; datetime: string }>;
    evaluation: SlotReplyResult;
    now: Date;
  }
): Promise<
  | { kind: "not_a_choice" }
  | { kind: "confirmed"; slot: { label: string; datetime: string }; message: string; claim: Extract<ClaimResult, { ok: true }> }
  | { kind: "refreshed"; reason: "stale" | "taken"; slots: Array<{ label: string; datetime: string }>; message: string }
  | { kind: "none_left"; message: string }
> {
  // Handle non-choice
  if (input.evaluation.kind === "none") {
    return { kind: "not_a_choice" };
  }

  // Handle stale slots (no claim attempt)
  if (input.evaluation.kind === "stale") {
    const fresh = await deps.getSlotOptions(input.now);
    
    if (fresh.length === 0) {
      return { kind: "none_left", message: NO_SLOTS_MESSAGE };
    }
    
    return {
      kind: "refreshed",
      reason: "stale",
      slots: fresh,
      message: buildFreshSlotsMessage(fresh, "stale"),
    };
  }

  // Handle selection
  if (input.evaluation.kind === "select") {
    const slot = input.slots[input.evaluation.index];
    
    // Guard against out-of-range index
    if (!slot) {
      return { kind: "not_a_choice" };
    }
    
    // Attempt to claim the slot
    const claim = await deps.claimSlot({ leadId: input.leadId, slot });
    
    if (claim.ok) {
      return {
        kind: "confirmed",
        slot,
        message: buildConfirmationMessage(slot),
        claim,
      };
    }
    
    // Conflict - refresh slots
    const fresh = await deps.getSlotOptions(input.now);
    
    if (fresh.length === 0) {
      return { kind: "none_left", message: NO_SLOTS_MESSAGE };
    }
    
    return {
      kind: "refreshed",
      reason: "taken",
      slots: fresh,
      message: buildFreshSlotsMessage(fresh, "taken"),
    };
  }

  // This should never be reached, but TypeScript needs it
  return { kind: "not_a_choice" };
}

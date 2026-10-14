/**
 * Policy for when to offer fresh survey slot options
 */

export const SLOT_REOFFER_AFTER_MINUTES = 15;

export function shouldOfferSurveySlots(input: {
  status: string;
  openOffer: { offered_at: string | Date; slot_options: string } | undefined;
  now: Date;
  reofferAfterMinutes?: number;
}): boolean {
  // If not in booking_offered status, always offer
  if (input.status !== "booking_offered") {
    return true;
  }

  // If no open offer exists, offer slots
  if (input.openOffer === undefined) {
    return true;
  }

  // Try to parse slot_options JSON
  let slots: unknown;
  try {
    slots = JSON.parse(input.openOffer.slot_options);
  } catch {
    // Invalid JSON, offer fresh slots
    return true;
  }

  // If not an array, offer fresh slots
  if (!Array.isArray(slots)) {
    return true;
  }

  // Check if any slot has passed
  const nowTime = input.now.getTime();
  for (const slot of slots) {
    if (slot && typeof slot === "object" && "datetime" in slot) {
      const slotTime = new Date(slot.datetime as string).getTime();
      if (slotTime <= nowTime) {
        // At least one slot has passed, offer fresh slots
        return true;
      }
    }
  }

  // Check if offer is stale (older than reoffer threshold)
  const offeredAt = new Date(input.openOffer.offered_at);
  const ageMs = nowTime - offeredAt.getTime();
  const thresholdMs = (input.reofferAfterMinutes ?? SLOT_REOFFER_AFTER_MINUTES) * 60000;
  
  if (ageMs > thresholdMs) {
    // Offer is stale, send fresh slots
    return true;
  }

  // Offer is fresh and all slots are in the future
  return false;
}

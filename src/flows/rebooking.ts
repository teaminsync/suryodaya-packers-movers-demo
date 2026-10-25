/**
 * Pure rebooking logic module
 */

export function planCancelPrevious(
  previous: { id: string; calendar_event_id: string | null } | undefined
):
  | { kind: "none" }
  | { kind: "cancel"; offerId: string; eventId: string } {
  if (previous === undefined) {
    return { kind: "none" };
  }

  const eventId = previous.calendar_event_id?.trim();
  if (!eventId) {
    return { kind: "none" };
  }

  return {
    kind: "cancel",
    offerId: previous.id,
    eventId,
  };
}

export function shouldHandleSlotReply(input: {
  status: string;
  openOffer: { offered_at: string | Date } | undefined;
  now: Date;
  maxAgeMinutes?: number;
}): boolean {
  if (input.openOffer === undefined) {
    return false;
  }

  if (input.status === "booking_offered") {
    return true;
  }

  if (input.status === "booked") {
    const offeredAt = new Date(input.openOffer.offered_at);
    if (isNaN(offeredAt.getTime())) {
      return false;
    }

    const nowTime = input.now.getTime();
    const offeredTime = offeredAt.getTime();

    if (offeredTime - nowTime > 60000) {
      return false;
    }

    const ageMs = nowTime - offeredTime;
    const maxAgeMs = (input.maxAgeMinutes ?? 1440) * 60000;

    return ageMs <= maxAgeMs;
  }

  return false;
}

export function statusWhenOfferingSlots(currentStatus: string): "booked" | "booking_offered" {
  if (currentStatus === "booked") {
    return "booked";
  }
  return "booking_offered";
}

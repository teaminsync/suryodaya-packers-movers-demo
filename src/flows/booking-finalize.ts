/**
 * Shared confirmed-booking finalization logic
 * Pure: no database, network, process.env, or console usage
 */

import { planCancelPrevious } from "./rebooking.js";

export interface FinalizeDeps {
  findPreviousConfirmedOffer(leadId: string, excludeOfferId: string): Promise<{ id: string; calendar_event_id: string } | undefined>;
  recordSlotSelection(offerId: string, label: string): Promise<void>;
  recordSurveyCalendar(offerId: string, info: { startsAt: Date; endsAt: Date; status: string; eventId: string | null; eventLink: string | null }): Promise<void>;
  setBooked(leadId: string): Promise<void>;
  sendConfirmation(text: string): Promise<void>;
  notifyBooked(slotLabel: string): void;
  cancelEvent(eventId: string): Promise<{ ok: true; status: "cancelled" | "not_configured" } | { ok: false; error: string }>;
  markOfferCalendarCancelled(offerId: string): Promise<void>;
  warn(message: string, detail?: unknown): void;
}

export async function finalizeConfirmedBooking(
  deps: FinalizeDeps,
  input: {
    leadId: string;
    offerId: string;
    slot: { label: string };
    message: string;
    claim: { status: string; startsAt: Date; endsAt: Date; eventId: string | null; eventLink: string | null };
  }
): Promise<{ cancel: "none" | "cancelled" | "not_configured" | "failed" }> {
  // Step 1: Plan cancellation of previous offer (only if claim status is "created")
  let cancelPlan = planCancelPrevious(undefined);
  if (input.claim.status === "created") {
    try {
      const previous = await deps.findPreviousConfirmedOffer(input.leadId, input.offerId);
      cancelPlan = planCancelPrevious(previous);
    } catch (error) {
      deps.warn("Could not look up the previous survey booking", error);
    }
  }

  // Step 2: Record slot selection (errors propagate)
  await deps.recordSlotSelection(input.offerId, input.slot.label);

  // Step 3: Record survey calendar (errors do not block)
  try {
    await deps.recordSurveyCalendar(input.offerId, {
      startsAt: input.claim.startsAt,
      endsAt: input.claim.endsAt,
      status: input.claim.status,
      eventId: input.claim.eventId,
      eventLink: input.claim.eventLink,
    });
  } catch (error) {
    deps.warn("Could not record survey calendar details", error);
  }

  // Step 4: Set lead to booked (errors propagate)
  await deps.setBooked(input.leadId);

  // Step 5: Send confirmation (errors propagate)
  await deps.sendConfirmation(input.message);

  // Step 6: Notify (fire-and-forget)
  deps.notifyBooked(input.slot.label);

  // Step 7: Execute cancellation plan if needed
  let cancelResult: "none" | "cancelled" | "not_configured" | "failed" = "none";
  if (cancelPlan.kind === "cancel") {
    try {
      const cancelled = await deps.cancelEvent(cancelPlan.eventId);
      if (cancelled.ok) {
        cancelResult = cancelled.status;
        if (cancelled.status === "cancelled") {
          await deps.markOfferCalendarCancelled(cancelPlan.offerId);
        }
      } else {
        cancelResult = "failed";
      }
    } catch (error) {
      deps.warn("Could not cancel the previous survey event", error);
      cancelResult = "failed";
    }
  }

  return { cancel: cancelResult };
}

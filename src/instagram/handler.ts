/**
 * Instagram message handler
 */

import type { InstagramInbound } from "./parse.js";
import { IG_ACK_OPT_OUT, IG_ATTACHMENT_REPLY, IG_ACK_HUMAN } from "./messages.js";
import { evaluateSlotReply } from "../flows/slot-reply.js";
import { promisesTeamFollowUp } from "../flows/followup.js";
import { shouldOfferSurveySlots } from "../flows/slot-offer-policy.js";
import { classifyInboundIntent } from "../outreach/messages.js";
import { looksLikeHumanRequest } from "../notify/human-request.js";
import { offerSurveySlots, resolveSlotChoice, type SurveyBookingDeps } from "../flows/survey-booking.js";
import { shouldHandleSlotReply, statusWhenOfferingSlots } from "../flows/rebooking.js";
import { finalizeConfirmedBooking, type FinalizeDeps } from "../flows/booking-finalize.js";

export type InstagramStatus =
  | "duplicate"
  | "opted_out"
  | "human_takeover"
  | "attachment_reply"
  | "slot_confirmed"
  | "slot_stale"
  | "slot_taken"
  | "no_slots"
  | "replied";

export interface InstagramResult {
  status: InstagramStatus;
}

export interface InstagramDeps {
  isProcessed(mid: string): Promise<boolean>;
  markProcessed(mid: string): Promise<void>;
  resolveEnquiry(input: {
    igsid: string;
    displayName: string | null;
    firstMessageText: string;
    mid: string;
    forceAttachToLatest: boolean;
  }): Promise<{
    leadId: string;
    contactId: string;
    contactNeedsProfile: boolean;
    status: string;
    humanTakeover: boolean;
    createdEnquiry: boolean;
  }>;
  ensureProfile(contactId: string, igsid: string): Promise<void>;
  logMessage(input: {
    leadId: string;
    mid: string;
    direction: "inbound" | "outbound";
    senderType: "customer" | "ai" | "system";
    body: string;
  }): Promise<void>;
  recordConsent(params: {
    contactId: string;
    channel: string;
    scope: string;
    status: string;
    source: string;
    wording: string | null;
    evidenceRef: string;
    capturedAt: string;
  }): Promise<void>;
  sendText(input: {
    igsid: string;
    leadId: string;
    text: string;
    senderType: "ai" | "system";
  }): Promise<void>;
  getOpenOffer(leadId: string): Promise<{ id: string; slotOptions: string; offeredAt: string | Date } | undefined>;
  createOffer(leadId: string, slots: { label: string; datetime: string }[]): Promise<void>;
  setStatus(leadId: string, status: string): Promise<void>;
  getKnownInfo(leadId: string): Promise<Record<string, unknown>>;
  runTurn(
    text: string,
    known: Record<string, unknown>
  ): Promise<{
    data: {
      replyMessage: string;
      extractedFields: Record<string, unknown>;
      wantsToBookSurvey: boolean;
      wantsHuman: boolean;
      needsTeamFollowUp: boolean;
    };
    providerUsed: string;
    wasFailover: boolean;
  }>;
  mergeFields(
    leadId: string,
    fields: Record<string, unknown>,
    provider: string,
    failover: boolean
  ): Promise<void>;
  setEscalated(leadId: string): Promise<void>;
  notifyAdmin(input: {
    type: "booking_confirmed" | "human_requested" | "needs_followup";
    leadId: string;
    lastMessage: string | null;
    slotLabel: string | null;
  }): Promise<void>;
  surveyBooking: SurveyBookingDeps;
  finalizeDeps(ctx: { leadId: string; igsid: string }): FinalizeDeps;
}

export async function handleInstagramMessage(
  event: InstagramInbound,
  deps: InstagramDeps,
  now: Date
): Promise<InstagramResult> {
  if (await deps.isProcessed(event.mid)) {
    return { status: "duplicate" };
  }

  await deps.markProcessed(event.mid);

  const isStop =
    event.text !== null &&
    classifyInboundIntent({ type: "text", text: event.text, buttonPayload: null, buttonText: null }).kind ===
      "opt_out";

  const resolved = await deps.resolveEnquiry({
    igsid: event.igsid,
    displayName: null,
    firstMessageText: event.text ?? "[Instagram attachment]",
    mid: event.mid,
    forceAttachToLatest: isStop,
  });

  if (resolved.contactNeedsProfile) {
    try {
      await deps.ensureProfile(resolved.contactId, event.igsid);
    } catch (error) {
      console.log(
        "[Instagram] Profile lookup failed:",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  await deps.logMessage({
    leadId: resolved.leadId,
    mid: event.mid,
    direction: "inbound",
    senderType: "customer",
    body: event.text ?? `[Instagram attachment: ${event.attachmentType}]`,
  });

  if (isStop) {
    await deps.recordConsent({
      contactId: resolved.contactId,
      channel: "instagram",
      scope: "follow_up",
      status: "withdrawn",
      source: "customer_stop",
      wording: event.text,
      evidenceRef: event.mid,
      capturedAt: now.toISOString(),
    });

    try {
      await deps.sendText({
        igsid: event.igsid,
        leadId: resolved.leadId,
        text: IG_ACK_OPT_OUT,
        senderType: "ai",
      });
    } catch (error) {
      console.log(
        "[Instagram] Opt-out ack send failed:",
        error instanceof Error ? error.message : String(error)
      );
    }

    return { status: "opted_out" };
  }

  if (resolved.humanTakeover) {
    return { status: "human_takeover" };
  }

  if (event.text === null) {
    await deps.sendText({
      igsid: event.igsid,
      leadId: resolved.leadId,
      text: IG_ATTACHMENT_REPLY,
      senderType: "ai",
    });

    return { status: "attachment_reply" };
  }

  if (resolved.status === "booking_offered" || resolved.status === "booked") {
    const offer = await deps.getOpenOffer(resolved.leadId);

    if (offer && shouldHandleSlotReply({ status: resolved.status, openOffer: { offered_at: offer.offeredAt }, now })) {
      let slots;
      try {
        slots = JSON.parse(offer.slotOptions);
      } catch {
        slots = null;
      }

      if (Array.isArray(slots)) {
        const evaluation = evaluateSlotReply({ text: event.text, slots, now });
        const resolution = await resolveSlotChoice(deps.surveyBooking, { leadId: resolved.leadId, slots, evaluation, now });

        if (resolution.kind === "confirmed") {
          await finalizeConfirmedBooking(deps.finalizeDeps({ leadId: resolved.leadId, igsid: event.igsid }), {
            leadId: resolved.leadId,
            offerId: offer.id,
            slot: resolution.slot,
            message: resolution.message,
            claim: resolution.claim,
          });
          return { status: "slot_confirmed" };
        }

        if (resolution.kind === "refreshed") {
          await deps.sendText({
            igsid: event.igsid,
            leadId: resolved.leadId,
            text: resolution.message,
            senderType: "system",
          });
          await deps.createOffer(resolved.leadId, resolution.slots);
          return { status: resolution.reason === "stale" ? "slot_stale" : "slot_taken" };
        }

        if (resolution.kind === "none_left") {
          await deps.sendText({
            igsid: event.igsid,
            leadId: resolved.leadId,
            text: resolution.message,
            senderType: "system",
          });
          await deps.setEscalated(resolved.leadId);
          try {
            await deps.notifyAdmin({
              type: "needs_followup",
              leadId: resolved.leadId,
              lastMessage: "No survey times were available to offer",
              slotLabel: null,
            });
          } catch (error) {
            console.log(
              "[Instagram] Admin notify failed:",
              error instanceof Error ? error.message : String(error)
            );
          }
          return { status: "no_slots" };
        }

        // resolution.kind === "not_a_choice": fall through to AI turn
      }
    }
  }

  const known = await deps.getKnownInfo(resolved.leadId);
  const turn = await deps.runTurn(event.text, known);

  const fieldsToMerge: Record<string, unknown> = {};
  const extracted = turn.data.extractedFields;
  if (extracted.moveType) fieldsToMerge.moveType = extracted.moveType;
  if (extracted.origin) fieldsToMerge.origin = extracted.origin;
  if (extracted.destination) fieldsToMerge.destination = extracted.destination;
  if (extracted.urgency) fieldsToMerge.urgency = extracted.urgency;
  if (extracted.hasSpecialItems !== undefined) fieldsToMerge.hasSpecialItems = extracted.hasSpecialItems;
  if (extracted.specialItems) fieldsToMerge.specialItems = extracted.specialItems;
  if (extracted.estimatedVolume) fieldsToMerge.estimatedVolume = extracted.estimatedVolume;
  if (extracted.requiresPacking !== undefined) fieldsToMerge.requiresPacking = extracted.requiresPacking;

  if (Object.keys(fieldsToMerge).length > 0 || turn.providerUsed) {
    await deps.mergeFields(resolved.leadId, fieldsToMerge, turn.providerUsed, turn.wasFailover);
  }

  const humanRequested = turn.data.wantsHuman || looksLikeHumanRequest(event.text);

  if (humanRequested || turn.data.needsTeamFollowUp) {
    await deps.setEscalated(resolved.leadId);
  }

  const followUpNeeded = !humanRequested && (turn.data.needsTeamFollowUp || promisesTeamFollowUp(turn.data.replyMessage));

  await deps.sendText({
    igsid: event.igsid,
    leadId: resolved.leadId,
    text: turn.data.replyMessage,
    senderType: "ai",
  });

  if (humanRequested) {
    await deps.sendText({
      igsid: event.igsid,
      leadId: resolved.leadId,
      text: IG_ACK_HUMAN,
      senderType: "system",
    });

    try {
      await deps.notifyAdmin({
        type: "human_requested",
        leadId: resolved.leadId,
        lastMessage: event.text,
        slotLabel: null,
      });
    } catch (error) {
      console.log(
        "[Instagram] Admin notify failed:",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  if (followUpNeeded) {
    try {
      await deps.notifyAdmin({
        type: "needs_followup",
        leadId: resolved.leadId,
        lastMessage: event.text,
        slotLabel: null,
      });
    } catch (error) {
      console.log(
        "[Instagram] Admin notify failed:",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  if (turn.data.wantsToBookSurvey) {
    const openOfferForSlots = await deps.getOpenOffer(resolved.leadId);
    const offerSlotsNow = shouldOfferSurveySlots({
      status: resolved.status,
      openOffer: openOfferForSlots ? {
        offered_at: openOfferForSlots.offeredAt,
        slot_options: openOfferForSlots.slotOptions
      } : undefined,
      now,
    });

    if (offerSlotsNow) {
      const offered = await offerSurveySlots(deps.surveyBooking, now);

      await deps.sendText({
        igsid: event.igsid,
        leadId: resolved.leadId,
        text: offered.message,
        senderType: "system",
      });

      if (offered.kind === "none") {
        await deps.setEscalated(resolved.leadId);
        try {
          await deps.notifyAdmin({
            type: "needs_followup",
            leadId: resolved.leadId,
            lastMessage: "No survey times were available to offer",
            slotLabel: null,
          });
        } catch (error) {
          console.log(
            "[Instagram] Admin notify failed:",
            error instanceof Error ? error.message : String(error)
          );
        }
      } else {
        await deps.createOffer(resolved.leadId, offered.slots);
        await deps.setStatus(resolved.leadId, statusWhenOfferingSlots(resolved.status));
      }
    }
  }

  return { status: "replied" };
}

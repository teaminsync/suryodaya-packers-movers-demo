/**
 * Instagram message handler
 */

import type { InstagramInbound } from "./parse.js";
import { IG_ACK_OPT_OUT, IG_ATTACHMENT_REPLY } from "./messages.js";
import { evaluateSlotReply } from "../flows/slot-reply.js";
import { buildConfirmationMessage, generateSlotOptions } from "../flows/booking.js";
import { promisesTeamFollowUp } from "../flows/followup.js";
import { shouldOfferSurveySlots } from "../flows/slot-offer-policy.js";
import { classifyInboundIntent } from "../outreach/messages.js";

export type InstagramStatus =
  | "duplicate"
  | "opted_out"
  | "human_takeover"
  | "attachment_reply"
  | "slot_confirmed"
  | "slot_stale"
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
  getOpenOffer(leadId: string): Promise<{ id: string; slotOptions: string } | undefined>;
  createOffer(leadId: string, slots: { label: string; datetime: string }[]): Promise<void>;
  recordSlotSelection(offerId: string, label: string): Promise<void>;
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

  if (resolved.status === "booking_offered") {
    const offer = await deps.getOpenOffer(resolved.leadId);

    if (offer) {
      let slots: unknown;
      try {
        slots = JSON.parse(offer.slotOptions);
      } catch {
        slots = null;
      }

      if (Array.isArray(slots)) {
        const evaluation = evaluateSlotReply({ text: event.text, slots, now });

        if (evaluation.kind === "select") {
          const slot = slots[evaluation.index];
          const confirmMessage = buildConfirmationMessage(slot);

          await deps.sendText({
            igsid: event.igsid,
            leadId: resolved.leadId,
            text: confirmMessage,
            senderType: "system",
          });

          await deps.recordSlotSelection(offer.id, slot.label);
          await deps.setStatus(resolved.leadId, "booked");

          return { status: "slot_confirmed" };
        } else if (evaluation.kind === "stale") {
          const freshSlots = generateSlotOptions();
          const slotMessage = `Those times have already passed. Here are fresh survey times:\n\n${freshSlots
            .map((s, i) => `${i + 1}. ${s.label}`)
            .join("\n")}\n\nReply with the number of your preferred time.`;

          await deps.sendText({
            igsid: event.igsid,
            leadId: resolved.leadId,
            text: slotMessage,
            senderType: "system",
          });

          await deps.createOffer(resolved.leadId, freshSlots);

          return { status: "slot_stale" };
        }
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

  if (turn.data.wantsHuman || turn.data.needsTeamFollowUp) {
    await deps.setEscalated(resolved.leadId);
  }

  const followUpNeeded =
    !turn.data.wantsHuman &&
    (turn.data.needsTeamFollowUp || promisesTeamFollowUp(turn.data.replyMessage));

  if (followUpNeeded) {
    await deps.setEscalated(resolved.leadId);
  }

  await deps.sendText({
    igsid: event.igsid,
    leadId: resolved.leadId,
    text: turn.data.replyMessage,
    senderType: "ai",
  });

  if (turn.data.wantsToBookSurvey) {
    const openOfferForSlots = await deps.getOpenOffer(resolved.leadId);
    const offerSlotsNow = shouldOfferSurveySlots({
      status: resolved.status,
      openOffer: openOfferForSlots ? {
        offered_at: new Date(),
        slot_options: openOfferForSlots.slotOptions
      } : undefined,
      now,
    });

    if (offerSlotsNow) {
      const slots = generateSlotOptions();
      const slotMessage = `Great! Here are available survey times:\n\n${slots
        .map((s, i) => `${i + 1}. ${s.label}`)
        .join("\n")}\n\nReply with the number of your preferred time.`;

      await deps.sendText({
        igsid: event.igsid,
        leadId: resolved.leadId,
        text: slotMessage,
        senderType: "system",
      });

      await deps.createOffer(resolved.leadId, slots);
      await deps.setStatus(resolved.leadId, "booking_offered");
    }
  }

  return { status: "replied" };
}

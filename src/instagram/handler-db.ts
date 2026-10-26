/**
 * Database wiring for Instagram handler
 */

import type { InstagramDeps } from "./handler.js";

const ensureProfileAttempts = new Map<string, number>();
import {
  isMessageProcessed,
  markMessageProcessed,
  mergeLeadFields,
  setLeadStatus,
  setLeadEscalated,
  findOpenBookingOffer,
  createBookingOffer,
  recordSlotSelection,
  createMessage,
  findLeadById,
  recordSurveyCalendar,
  findPreviousConfirmedOffer,
  markOfferCalendarCancelled,
} from "../leads/repository.js";
import { resolveEnquiry } from "../leads/intake.js";
import { intakeDeps } from "../leads/intake-db.js";
import { processConversationTurn } from "../flows/qualification.js";
import { buildKnownInfo } from "../flows/known-info.js";
import { instagramClient } from "./client.js";
import { splitForInstagram } from "./messages.js";
import { setInstagramProfileIfMissing } from "../leads/contacts.js";
import { sql } from "../leads/db.js";
import { outreachDeps } from "../outreach/service-db.js";
import { withRetry } from "../outreach/retry.js";
import { surveyBookingDeps, surveyCancelDeps } from "../flows/survey-booking-db.js";

async function getLastInstagramInboundAt(contactId: string): Promise<string | null> {
  const result = await sql<{ max_at: string | null }[]>`
    SELECT MAX(m.created_at) AS max_at
    FROM messages m
    JOIN leads l ON m.lead_id = l.id
    WHERE l.contact_id = ${contactId}
      AND m.channel = 'instagram'
      AND m.direction = 'inbound'
  `;

  return result[0]?.max_at ?? null;
}

export const instagramDeps: InstagramDeps = {
  async isProcessed(mid: string) {
    return isMessageProcessed(mid);
  },

  async markProcessed(mid: string) {
    await markMessageProcessed(mid, null);
  },

  async resolveEnquiry(input) {
    const resolved = await resolveEnquiry(
      {
        channel: "instagram",
        externalId: input.igsid,
        contactName: input.displayName,
        firstMessageText: input.firstMessageText,
        externalRef: input.mid,
        now: new Date(),
        forceAttachToLatest: input.forceAttachToLatest,
      },
      intakeDeps
    );

    const contactNeedsProfile = !resolved.contact.instagram_username || resolved.contact.instagram_username.trim() === "";

    return {
      leadId: resolved.lead.id,
      contactId: resolved.contact.id,
      contactNeedsProfile,
      status: resolved.lead.status,
      humanTakeover: resolved.lead.human_takeover,
      createdEnquiry: resolved.createdEnquiry,
    };
  },

  async ensureProfile(contactId: string, igsid: string) {
    const profileAttempts = ensureProfileAttempts;
    const lastAttempt = profileAttempts.get(igsid) ?? 0;
    const now = Date.now();
    
    if (now - lastAttempt < 10 * 60 * 1000) {
      return;
    }
    
    profileAttempts.set(igsid, now);
    
    const profile = await instagramClient.getProfile(igsid);

    if (profile && (profile.name || profile.username)) {
      await setInstagramProfileIfMissing(contactId, profile);
    }
  },

  async logMessage(input) {
    await createMessage({
      leadId: input.leadId,
      wamid: input.mid,
      direction: input.direction,
      senderType: input.senderType,
      messageType: "text",
      body: input.body,
      channel: "instagram",
    });
  },

  async recordConsent(params) {
    if (params.status !== "withdrawn") {
      await outreachDeps.recordConsent({
        ...params,
        status: params.status as "granted" | "withdrawn",
      });
      return;
    }

    try {
      await withRetry(
        () => outreachDeps.recordConsent({
          ...params,
          status: "withdrawn",
        }),
        [500, 2000, 8000]
      );
    } catch (error) {
      console.error(
        "[Instagram] CRITICAL: could not record an opt-out after retries:",
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  },

  async sendText(input) {
    const chunks = splitForInstagram(input.text);

    for (const chunk of chunks) {
      const result = await instagramClient.sendText(input.igsid, chunk);

      await createMessage({
        leadId: input.leadId,
        wamid: result.mid,
        direction: "outbound",
        senderType: input.senderType,
        messageType: "text",
        body: chunk,
        channel: "instagram",
      });
    }
  },

  async getOpenOffer(leadId: string) {
    const offer = await findOpenBookingOffer(leadId);
    if (!offer) {
      return undefined;
    }

    return {
      id: offer.id,
      slotOptions: offer.slot_options,
      offeredAt: offer.offered_at,
    };
  },

  async createOffer(leadId: string, slots) {
    await createBookingOffer(leadId, slots);
  },

  async setStatus(leadId: string, status: string) {
    await setLeadStatus(leadId, status as any);
  },

  async getKnownInfo(leadId: string) {
    const lead = await findLeadById(leadId);
    if (!lead) {
      return {};
    }

    return buildKnownInfo(lead);
  },

  async runTurn(text: string, known: Record<string, unknown>) {
    return processConversationTurn(text, known);
  },

  async mergeFields(leadId: string, fields: Record<string, unknown>, provider: string, failover: boolean) {
    await mergeLeadFields(leadId, fields as any, provider, failover);
  },

  async setEscalated(leadId: string) {
    await setLeadEscalated(leadId);
  },

  async notifyAdmin(input) {
    const { adminNotifier } = await import("../notify/notify-db.js");
    await adminNotifier.notifyLead(input);
  },

  surveyBooking: surveyBookingDeps,

  finalizeDeps(ctx) {
    return {
      findPreviousConfirmedOffer: (leadId, excludeOfferId) => findPreviousConfirmedOffer(leadId, excludeOfferId),
      recordSlotSelection: (offerId, label) => recordSlotSelection(offerId, label),
      recordSurveyCalendar: (offerId, info) => recordSurveyCalendar(offerId, info),
      setBooked: (leadId) => setLeadStatus(leadId, "booked"),
      sendConfirmation: (text) => instagramDeps.sendText({ igsid: ctx.igsid, leadId: ctx.leadId, text, senderType: "system" }),
      notifyBooked: (slotLabel) => {
        void (async () => {
          try {
            const { adminNotifier } = await import("../notify/notify-db.js");
            await adminNotifier.notifyLead({ type: "booking_confirmed", leadId: ctx.leadId, lastMessage: null, slotLabel });
          } catch {
            // Silent failure
          }
        })();
      },
      cancelEvent: surveyCancelDeps.cancelEvent,
      markOfferCalendarCancelled,
      warn: (message, detail) => console.error("[Instagram]", message, detail ?? ""),
    };
  },
};

export { getLastInstagramInboundAt as lastInstagramInboundAt };

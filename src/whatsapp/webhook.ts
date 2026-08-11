/**
 * WhatsApp webhook handlers for verification and inbound messages
 */

import { Request, Response } from "express";
import { WhatsAppWebhookPayload } from "./types.js";

/**
 * GET /webhook - Meta verification handshake
 */
export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error("[Webhook] WHATSAPP_WEBHOOK_VERIFY_TOKEN not set");
    res.sendStatus(500);
    return;
  }

  console.log("[Webhook] Verification request:", {
    mode,
    tokenMatch: token === verifyToken,
  });

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[Webhook] Verification successful");
    res.status(200).send(challenge);
  } else {
    console.warn("[Webhook] Verification failed");
    res.sendStatus(403);
  }
}

/**
 * POST /webhook - Inbound message receipt
 */
export function handleWebhook(req: Request, res: Response): void {
  const payload = req.body as WhatsAppWebhookPayload;

  // Log full raw inbound payload
  console.log(
    "[Webhook] Inbound payload:",
    JSON.stringify(payload, null, 2)
  );

  // Quick ack to Meta (required for fast response)
  res.sendStatus(200);

  // Process the webhook asynchronously (don't block the response)
  processWebhook(payload).catch((error) => {
    console.error("[Webhook] Processing failed:", error);
  });
}

/**
 * Process webhook payload (called asynchronously after ack)
 */
async function processWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
  // Lazy imports to avoid circular dependency issues
  const { isMessageProcessed, markMessageProcessed, findActiveLead, createLead, updateLeadQualification, updateLeadStatus, findOpenBookingOffer, createBookingOffer, recordSlotSelection } = await import("../leads/repository.js");
  const { qualifyLead } = await import("../flows/qualification.js");
  const { generateAcknowledgment } = await import("../flows/acknowledgment.js");
  const { generateSlotOptions, generateSlotMessage, parseSlotSelection, generateConfirmationMessage } = await import("../flows/booking.js");
  const { whatsappClient } = await import("./client.js");

  // Validate payload structure
  if (payload.object !== "whatsapp_business_account") {
    console.warn("[Webhook] Unexpected object type:", payload.object);
    return;
  }

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") {
        continue;
      }

      const { messages, contacts } = change.value;

      if (!messages || messages.length === 0) {
        // Status update or other non-message event
        continue;
      }

      for (const message of messages) {
        // Only process text messages
        if (message.type !== "text" || !message.text?.body) {
          console.log("[Webhook] Skipping non-text message:", message.type);
          continue;
        }

        const wamid = message.id;
        const whatsappNumber = message.from;
        const messageText = message.text.body;
        const contact = contacts?.find((c) => c.wa_id === whatsappNumber);
        const contactName = contact?.profile.name || null;

        console.log("[Webhook] Received message:", {
          wamid,
          from: whatsappNumber,
          contactName,
          text: messageText,
          timestamp: message.timestamp,
        });

        // Step 1: Dedupe check
        if (await isMessageProcessed(wamid)) {
          console.log("[Webhook] Message already processed, skipping:", wamid);
          continue;
        }

        // Mark as processed immediately (before any async work)
        await markMessageProcessed(wamid, null); // Lead ID will be updated if needed

        try {
          // Step 2: Load or create lead
          let lead = await findActiveLead(whatsappNumber);
          
          if (!lead) {
            console.log("[Webhook] Creating new lead for:", whatsappNumber);
            lead = await createLead(whatsappNumber, contactName, messageText);
          } else {
            console.log("[Webhook] Found existing lead:", lead.id, "status:", lead.status);
          }

          // Step 3: Check for booking slot selection first
          if (lead.status === "booking_offered") {
            const openOffer = await findOpenBookingOffer(lead.id);
            if (openOffer) {
              const slots = JSON.parse(openOffer.slot_options);
              const selectedSlot = parseSlotSelection(messageText, slots);

              if (selectedSlot) {
                console.log("[Webhook] Slot selected:", selectedSlot.label);
                
                // Record selection
                await recordSlotSelection(openOffer.id, selectedSlot.label);
                await updateLeadStatus(lead.id, "booked");

                // Send confirmation
                const confirmMessage = await generateConfirmationMessage(selectedSlot);
                await whatsappClient.sendMessage(whatsappNumber, confirmMessage);

                console.log("[Webhook] Booking confirmed for lead:", lead.id);
                continue; // Done with this message
              }
            }
          }

          // Step 4: Qualify the lead (new or additional info)
          console.log("[Webhook] Qualifying lead:", lead.id);
          const qualificationResult = await qualifyLead(messageText);

          console.log("[Webhook] Qualification result:", {
            data: qualificationResult.data,
            provider: qualificationResult.providerUsed,
            failover: qualificationResult.wasFailover,
          });

          // Update lead with qualification data
          await updateLeadQualification(
            lead.id,
            qualificationResult.data,
            qualificationResult.providerUsed,
            qualificationResult.wasFailover
          );

          // Step 5: Send instant acknowledgment
          console.log("[Webhook] Generating acknowledgment for lead:", lead.id);
          const ackMessage = await generateAcknowledgment(qualificationResult.data);
          await whatsappClient.sendMessage(whatsappNumber, ackMessage);
          await updateLeadStatus(lead.id, "ack_sent");
          console.log("[Webhook] Acknowledgment sent");

          // Step 6: Generate and send booking slots
          console.log("[Webhook] Generating booking slots for lead:", lead.id);
          const slots = generateSlotOptions();
          const slotMessage = await generateSlotMessage(slots);
          await whatsappClient.sendMessage(whatsappNumber, slotMessage);

          // Create booking offer record
          await createBookingOffer(lead.id, slots);
          await updateLeadStatus(lead.id, "booking_offered");
          console.log("[Webhook] Booking slots offered");

        } catch (error) {
          console.error("[Webhook] Processing failed for message:", wamid, error);
          // Don't rethrow - already sent 200 to Meta
        }
      }
    }
  }
}

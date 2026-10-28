/**
 * WhatsApp webhook handlers for verification and inbound messages
 */

import { Request, Response } from "express";
import { WhatsAppWebhookPayload } from "./types.js";
import { verifyMetaSignature } from "./signature.js";
import { createKeyedQueue } from "../instagram/keyed-queue.js";
import { senderKeyFromPayload } from "./sender-key.js";
import { mediaFailureMessage } from "./media-error.js";

const enqueueBySender = createKeyedQueue();

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
  const secret = process.env.WHATSAPP_APP_SECRET;
  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  const signature = req.header("X-Hub-Signature-256");

  if (!secret || !rawBody || !verifyMetaSignature(rawBody, signature, secret)) {
    console.warn("[Webhook] Rejected POST: missing or invalid signature", {
      hasSignatureHeader: !!signature,
      hasRawBody: !!rawBody,
    });
    res.sendStatus(401);
    return;
  }

  const payload = req.body as WhatsAppWebhookPayload;

  // Log full raw inbound payload
  console.log(
    "[Webhook] Inbound payload:",
    JSON.stringify(payload, null, 2)
  );

  // Quick ack to Meta (required for fast response)
  res.sendStatus(200);

  // Process the webhook asynchronously (don't block the response)
  enqueueBySender(senderKeyFromPayload(payload), () => processWebhook(payload)).catch((error) => {
    console.error("[Webhook] Processing failed:", error);
  });
}

/**
 * Process webhook payload (called asynchronously after ack)
 */
async function processWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
  // Lazy imports to avoid circular dependency issues
  const { isMessageProcessed, markMessageProcessed, unmarkMessageProcessed, mergeLeadFields, setLeadStatus, setLeadEscalated, findOpenBookingOffer, createBookingOffer, recordSlotSelection, createMessage, recordSurveyCalendar, findPreviousConfirmedOffer, markOfferCalendarCancelled } = await import("../leads/repository.js");
  const { processConversationTurn } = await import("../flows/qualification.js");
  const { promisesTeamFollowUp } = await import("../flows/followup.js");
  const { looksLikeHumanRequest } = await import("../notify/human-request.js");
  const { adminNotifier } = await import("../notify/notify-db.js");
  const { offerSurveySlots, resolveSlotChoice } = await import("../flows/survey-booking.js");
  const { surveyBookingDeps, surveyCancelDeps } = await import("../flows/survey-booking-db.js");
  const { evaluateSlotReply } = await import("../flows/slot-reply.js");
  const { shouldHandleSlotReply, statusWhenOfferingSlots } = await import("../flows/rebooking.js");
  const { shouldOfferSurveySlots } = await import("../flows/slot-offer-policy.js");
  const { getBallparkRange } = await import("../company/profile.js");
  const { finalizeConfirmedBooking } = await import("../flows/booking-finalize.js");
  const { whatsappClient } = await import("./client.js");
  const { buttonTapAsText, toIntentInput } = await import("../outreach/webhook-input.js");
  const { classifyInboundIntent } = await import("../outreach/messages.js");
  const { handleInboundOutreach } = await import("../outreach/inbound.js");
  const { inboundDeps } = await import("../outreach/inbound-db.js");

  const sendSystemText = async (leadId: string, to: string, text: string): Promise<void> => {
    await whatsappClient.sendMessage(to, text);
    await createMessage({ leadId, wamid: null, direction: "outbound", senderType: "system", messageType: "text", body: text });
  };

  const escalateNoSlots = async (leadId: string): Promise<void> => {
    await setLeadEscalated(leadId);
    void adminNotifier.notifyLead({ type: "needs_followup", leadId, lastMessage: "No survey times were available to offer", slotLabel: null }).catch(() => {});
  };

  const offerSlotsTo = async (leadId: string, to: string, currentStatus: string): Promise<boolean> => {
    const offer = await offerSurveySlots(surveyBookingDeps, new Date());
    await sendSystemText(leadId, to, offer.message);
    if (offer.kind === "none") {
      await escalateNoSlots(leadId);
      return false;
    }
    await createBookingOffer(leadId, offer.slots);
    await setLeadStatus(leadId, statusWhenOfferingSlots(currentStatus));
    return true;
  };

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

      for (const incomingMessage of messages) {
        const message = buttonTapAsText(incomingMessage);

        const wamid = message.id;
        const whatsappNumber = message.from;
        const contact = contacts?.find((c) => c.wa_id === whatsappNumber);
        const contactName = contact?.profile.name || null;

        console.log("[Webhook] Received message:", {
          wamid,
          from: whatsappNumber,
          contactName,
          type: message.type,
          timestamp: message.timestamp,
        });

        // Step 1: Dedupe check
        if (await isMessageProcessed(wamid)) {
          console.log("[Webhook] Message already processed, skipping:", wamid);
          continue;
        }

        // Mark as processed immediately (before any async work)
        await markMessageProcessed(wamid, null);

        try {
          // Step 2: Load or create lead
          const { resolveEnquiry } = await import("../leads/intake.js");
          const { intakeDeps } = await import("../leads/intake-db.js");
          const intentInput = toIntentInput(incomingMessage);
          const intent = classifyInboundIntent(intentInput.input);
          const resolved = await resolveEnquiry(
            {
              channel: "whatsapp",
              externalId: whatsappNumber,
              contactName,
              firstMessageText: message.text?.body || "[interactive]",
              externalRef: wamid,
              now: new Date(),
              forceAttachToLatest: intent.kind === "opt_out" || intent.kind === "followup_not_now",
            },
            intakeDeps
          );
          const lead = resolved.lead;
          console.log("[Webhook] Enquiry resolved:", {
            leadId: lead.id,
            contactId: resolved.contact.id,
            createdEnquiry: resolved.createdEnquiry,
            reason: resolved.reason,
            status: lead.status,
          });

          // Log inbound text messages up front (single place)
          if (message.type === "text" && message.text?.body) {
            await createMessage({
              leadId: lead.id,
              wamid,
              direction: "inbound",
              senderType: "customer",
              messageType: "text",
              body: message.text.body,
            });
          }

          // Step 2a: customer replies to the follow-up (template buttons, STOP)
          if (intent.kind !== "none") {
            let outreach: Awaited<ReturnType<typeof handleInboundOutreach>>;
            try {
              outreach = await handleInboundOutreach(
                {
                  intent,
                  leadId: lead.id,
                  contactId: resolved.contact.id,
                  to: whatsappNumber,
                  wamid,
                  rawText: intentInput.rawText,
                  now: new Date(),
                },
                inboundDeps
              );
            } catch (error) {
              console.error("[Outreach] FAILED to process a customer opt-out or decline:", error instanceof Error ? error.message : String(error));
              await unmarkMessageProcessed(wamid);
              throw error;
            }
            console.log("[Webhook] Outreach intent handled:", { leadId: lead.id, kind: intent.kind, action: outreach.action, ackSent: outreach.ackSent });
            if (!outreach.continueWithAi) {
              continue;
            }
          }

          // Step 3: Handle interactive button taps (deterministic routing)
          if (message.type === "interactive") {
            const interactionId = message.interactive?.list_reply?.id || message.interactive?.button_reply?.id;
            
            console.log("[Webhook] Interactive button tapped:", interactionId);

            // Log inbound interactive message
            await createMessage({
              leadId: lead.id,
              wamid,
              direction: "inbound",
              senderType: "customer",
              messageType: "interactive",
              body: interactionId || null,
            });

            if (interactionId === "talk_human") {
              await setLeadEscalated(lead.id);
              
              void adminNotifier.notifyLead({
                type: "human_requested",
                leadId: lead.id,
                lastMessage: "Tapped Talk to a Human",
                slotLabel: null,
              }).catch(() => {});
              
              const ackMessage = "Thank you! A team member from Suryodaya will reach out to you shortly.";
              await whatsappClient.sendMessage(whatsappNumber, ackMessage);
              
              // Log outbound escalation ack
              await createMessage({
                leadId: lead.id,
                wamid: null,
                direction: "outbound",
                senderType: "system",
                messageType: "text",
                body: ackMessage,
              });
              
              console.log("[Webhook] Escalated lead:", lead.id);
              continue;
            }

            if (interactionId === "book_survey") {
              await offerSlotsTo(lead.id, whatsappNumber, lead.status);
              console.log("[Webhook] Survey slot offer handled (button tap)");
              continue;
            }

            if (interactionId === "get_estimate") {
              // Ballpark only needs volume + move type (matches qualification.ts free-text path)
              if (lead.move_type && lead.estimated_volume) {
                const ballpark = getBallparkRange(lead.estimated_volume, lead.move_type);
                
                // Build message with optional location context if known
                let message = `Based on your ${lead.estimated_volume} ${lead.move_type} move`;
                if (lead.origin && lead.destination) {
                  message += ` from ${lead.origin} to ${lead.destination}`;
                } else if (lead.origin) {
                  message += ` from ${lead.origin}`;
                }
                message += `, the ballpark range is ${ballpark}.\n\nThis is approximate - an on-site survey gives us the real quote. Tap "Book a Survey" when ready!`;
                
                await whatsappClient.sendMessage(whatsappNumber, message);
                
                // Log outbound ballpark estimate
                await createMessage({
                  leadId: lead.id,
                  wamid: null,
                  direction: "outbound",
                  senderType: "system",
                  messageType: "text",
                  body: message,
                });
              } else {
                // Not enough info - only ask for what's actually needed
                const missing: string[] = [];
                if (!lead.move_type) missing.push("move type (local/intercity)");
                if (!lead.estimated_volume) missing.push("home/office size (1bhk/2bhk/etc)");

                const message = `To give you an estimate, I need: ${missing.join(", ")}. Can you share those details?`;
                await whatsappClient.sendMessage(whatsappNumber, message);
                
                // Log outbound prompt
                await createMessage({
                  leadId: lead.id,
                  wamid: null,
                  direction: "outbound",
                  senderType: "system",
                  messageType: "text",
                  body: message,
                });
              }
              continue;
            }

            if (interactionId === "update_details") {
              const message = "Sure - what would you like to update?";
              await whatsappClient.sendMessage(whatsappNumber, message);
              
              // Log outbound update prompt
              await createMessage({
                leadId: lead.id,
                wamid: null,
                direction: "outbound",
                senderType: "system",
                messageType: "text",
                body: message,
              });
              
              continue;
            }

            if (interactionId === "get_move_total") {
              const { generateMoveQuote } = await import("../flows/quote.js");
              const quote = await generateMoveQuote(lead.id);
              
              await whatsappClient.sendMessage(whatsappNumber, quote.message);
              
              // Log outbound quote message
              await createMessage({
                leadId: lead.id,
                wamid: null,
                direction: "outbound",
                senderType: "system",
                messageType: "text",
                body: quote.message,
              });
              
              console.log("[Webhook] Move total sent:", {
                leadId: lead.id,
                hasCaptures: quote.hasCaptures,
                roomCount: quote.roomCount,
                captureCount: quote.captureCount,
                totalCubicFeet: quote.totalEstimatedCubicFeet,
                totalWeightKg: quote.totalEstimatedWeightKg,
              });
              continue;
            }
          }

          // Step 4: Check if they're responding to a booking offer with a slot selection
          if ((lead.status === "booking_offered" || lead.status === "booked") && !lead.human_takeover && message.type === "text" && message.text?.body) {
            const openOffer = await findOpenBookingOffer(lead.id);
            if (openOffer && shouldHandleSlotReply({ status: lead.status, openOffer, now: new Date() })) {
              let slots;
              try {
                slots = JSON.parse(openOffer.slot_options);
              } catch {
                slots = null;
              }

              if (slots) {
                const evaluation = evaluateSlotReply({ text: message.text.body, slots, now: new Date() });
                const resolution = await resolveSlotChoice(surveyBookingDeps, { leadId: lead.id, slots, evaluation, now: new Date() });

                if (resolution.kind === "confirmed") {
                  const claim = resolution.claim;
                  console.log("[Webhook] Slot selected:", resolution.slot.label, { calendarStatus: claim.status });
                  const outcome = await finalizeConfirmedBooking(
                    {
                      findPreviousConfirmedOffer: (leadId, excludeOfferId) => findPreviousConfirmedOffer(leadId, excludeOfferId),
                      recordSlotSelection: (offerId, label) => recordSlotSelection(offerId, label),
                      recordSurveyCalendar: (offerId, info) => recordSurveyCalendar(offerId, info),
                      setBooked: (leadId) => setLeadStatus(leadId, "booked"),
                      sendConfirmation: (text) => sendSystemText(lead.id, whatsappNumber, text),
                      notifyBooked: (slotLabel) => {
                        void adminNotifier.notifyLead({ type: "booking_confirmed", leadId: lead.id, lastMessage: null, slotLabel }).catch(() => {});
                      },
                      cancelEvent: surveyCancelDeps.cancelEvent,
                      markOfferCalendarCancelled,
                      warn: (message, detail) => console.error("[Webhook]", message, detail ?? ""),
                    },
                    {
                      leadId: lead.id,
                      offerId: openOffer.id,
                      slot: resolution.slot,
                      message: resolution.message,
                      claim,
                    }
                  );
                  console.log("[Webhook] Previous survey event cancel:", { leadId: lead.id, result: outcome.cancel });
                  console.log("[Webhook] Booking confirmed for lead:", lead.id);
                  continue;
                }

                if (resolution.kind === "refreshed") {
                  await sendSystemText(lead.id, whatsappNumber, resolution.message);
                  await createBookingOffer(lead.id, resolution.slots);
                  console.log("[Webhook] Slot choice refreshed:", { leadId: lead.id, reason: resolution.reason });
                  continue;
                }

                if (resolution.kind === "none_left") {
                  await sendSystemText(lead.id, whatsappNumber, resolution.message);
                  await escalateNoSlots(lead.id);
                  console.log("[Webhook] No survey times left to offer:", lead.id);
                  continue;
                }
                // resolution.kind === "not_a_choice": fall through to the normal handling below
              }
            }
          }

          // Step 5: Handle media (image/video) messages
          if (message.type === "image" || message.type === "video") {
            try {
              const mediaInfo = message.image || message.video;
              if (!mediaInfo) {
                console.warn("[Webhook] Media message but no media info found");
                continue;
              }

              const mediaType = message.type as "image" | "video";
              const mediaId = mediaInfo.id;
              const mimeType = mediaInfo.mime_type;
              const caption = mediaInfo.caption || null;

              console.log(`[Webhook] Processing ${mediaType} message:`, { mediaId, mimeType });

              // Log inbound media message
              await createMessage({
                leadId: lead.id,
                wamid,
                direction: "inbound",
                senderType: "customer",
                messageType: mediaType,
                body: caption,
              });

              // Download media from WhatsApp
              const { downloadWhatsAppMedia } = await import("./media.js");
              const { buffer, mimeType: downloadedMimeType } = await downloadWhatsAppMedia(mediaId);

              // Upload to Supabase Storage (non-blocking - can fail gracefully)
              const { uploadToStorage } = await import("../storage/supabaseStorage.js");
              const fileExtension = downloadedMimeType.split("/")[1] || (mediaType === "image" ? "jpg" : "mp4");
              const objectPath = `${lead.id}/${wamid}.${fileExtension}`;
              const uploadResult = await uploadToStorage(objectPath, buffer, downloadedMimeType);

              // Analyze media with AI
              const { analyzeMediaCapture } = await import("../flows/volumetric.js");
              const { getMediaCapturesForDedupe } = await import("../leads/repository.js");
              const { buildInventoryGroups } = await import("../flows/rooms.js");
              
              // Get existing inventory for de-duplication
              const rows = await getMediaCapturesForDedupe(lead.id);
              const groups = buildInventoryGroups(rows);
              
              const base64Data = buffer.toString("base64");
              
              let analysisResult;
              if (mediaType === "image") {
                // Image needs specific MIME type validation
                const validImageMimes = ["image/jpeg", "image/png", "image/webp"] as const;
                
                if (!validImageMimes.includes(downloadedMimeType as any)) {
                  console.warn(
                    `[Webhook] Unexpected image mime type "${downloadedMimeType}" - defaulting to image/jpeg for AI analysis. This may produce incorrect results if the actual format differs.`
                  );
                }
                
                const imageMimeType = validImageMimes.includes(downloadedMimeType as any) 
                  ? (downloadedMimeType as "image/jpeg" | "image/png" | "image/webp")
                  : "image/jpeg"; // Default fallback
                
                analysisResult = await analyzeMediaCapture({
                  type: "image",
                  mimeType: imageMimeType,
                  base64Data,
                }, groups);
              } else {
                // Video doesn't need mimeType parameter
                analysisResult = await analyzeMediaCapture({
                  type: "video",
                  base64Data,
                }, groups);
              }

              console.log("[Webhook] Media analysis complete:", {
                assetType: analysisResult.data.assetType,
                roomKey: analysisResult.room.roomKey,
                roomLabel: analysisResult.room.label,
                newItems: analysisResult.totals.newItemCount,
                duplicateItems: analysisResult.totals.duplicateItemCount,
                addedCubicFeet: analysisResult.totals.cubicFeet,
                matchedExisting: analysisResult.room.matchedExisting,
                provider: analysisResult.providerUsed,
                failover: analysisResult.wasFailover,
              });

              // Save to database and get the capture ID
              const { createMediaCapture } = await import("../leads/repository.js");
              const mediaCaptureId = await createMediaCapture({
                leadId: lead.id,
                wamid,
                mediaType,
                storagePath: uploadResult?.path || null,
                assetType: analysisResult.data.assetType,
                roomKey: analysisResult.room.roomKey,
                roomQualifier: analysisResult.room.qualifier,
                suggestedRoomLabel: analysisResult.room.label,
                items: analysisResult.data.items,
                totalEstimatedCubicFeet: analysisResult.totals.cubicFeet,
                totalEstimatedWeightKg: analysisResult.totals.weightKg,
                packingComplexity: analysisResult.data.packingComplexity,
                specialHandlingNotes: analysisResult.data.specialHandlingNotes,
                confidence: analysisResult.data.confidence,
                aiProviderUsed: analysisResult.providerUsed,
                aiWasFailover: analysisResult.wasFailover,
              });

              // Build reply message
              const { buildCaptureReply } = await import("../flows/volumetric.js");
              const replyMessage = buildCaptureReply({
                roomLabel: analysisResult.room.label,
                items: analysisResult.data.items,
                addedCubicFeet: analysisResult.totals.cubicFeet,
                addedWeightKg: analysisResult.totals.weightKg,
              });

              await whatsappClient.sendMessage(whatsappNumber, replyMessage);

              // Log outbound media-capture reply with linkage
              await createMessage({
                leadId: lead.id,
                wamid: null,
                direction: "outbound",
                senderType: "system",
                messageType: "text",
                body: replyMessage,
                mediaCaptureId,
              });

              // Update lead status if needed
              if (lead.status === "new") {
                await setLeadStatus(lead.id, "gathering");
              }

              // Send quick-reply options (media capture always counts as substantive)
              await whatsappClient.sendListMessage(
                whatsappNumber,
                "How can I help you next?",
                "Quick Options",
                [
                  { id: "get_estimate", title: "Get Quick Estimate", description: "Ballpark pricing" },
                  { id: "book_survey", title: "Book a Survey", description: "Schedule site visit" },
                  { id: "talk_human", title: "Talk to a Human", description: "Speak with team" },
                  { id: "update_details", title: "Update My Details", description: "Change information" },
                  { id: "get_move_total", title: "Get My Move Total", description: "Full estimate from all rooms" },
                ]
              );

              // Log outbound Quick Options list
              await createMessage({
                leadId: lead.id,
                wamid: null,
                direction: "outbound",
                senderType: "system",
                messageType: "list",
                body: "Quick Options menu",
              });

              console.log("[Webhook] Media processing complete for:", wamid);

            } catch (error) {
              console.error("[Webhook] Media processing failed:", error);
              const errorMessage = mediaFailureMessage(error);
              await whatsappClient.sendMessage(whatsappNumber, errorMessage);
              
              // Log outbound error message
              await createMessage({
                leadId: lead.id,
                wamid: null,
                direction: "outbound",
                senderType: "system",
                messageType: "text",
                body: errorMessage,
              });
            }
            continue;
          }

          // Step 6: Free text - process conversation turn with unified AI call
          if (message.type === "text" && message.text?.body) {
            const messageText = message.text.body;

            console.log("[Webhook] Processing conversation turn for lead:", lead.id);

            // Check for human takeover flag - skip AI if enabled
            if (lead.human_takeover) {
              console.log("[Webhook] Human takeover active for lead, skipping AI response:", lead.id);
              continue;
            }

            // Check for room correction (deterministic parser)
            const { parseRoomCorrection, planRoomCorrection, buildRoomCorrectionReply } = await import("../flows/room-correction.js");
            if (parseRoomCorrection(messageText) !== null) {
              const { getLatestMediaCaptureForLead, updateMediaCaptureRoom } = await import("../leads/repository.js");
              const latestCapture = await getLatestMediaCaptureForLead(lead.id);
              const correction = planRoomCorrection({ text: messageText, latest: latestCapture, now: new Date() });
              const correctionReply = buildRoomCorrectionReply(correction);
              if (correction.kind !== "none" && correctionReply !== null) {
                if (correction.kind === "relabel") {
                  await updateMediaCaptureRoom({ captureId: correction.captureId, roomKey: correction.roomKey, roomQualifier: correction.qualifier, label: correction.label, itemsJson: correction.itemsJson, cubicFeet: correction.cubicFeet, weightKg: correction.weightKg });
                }
                await whatsappClient.sendMessage(whatsappNumber, correctionReply);
                await createMessage({ leadId: lead.id, wamid: null, direction: "outbound", senderType: "system", messageType: "text", body: correctionReply });
                console.log("[Webhook] Room correction handled:", { leadId: lead.id, kind: correction.kind });
                continue;
              }
            }

            // Build known context from lead
            const { buildKnownInfo } = await import("../flows/known-info.js");
            const knownInfo = buildKnownInfo(lead);

            // Single AI call for the turn
            let turnResult;
            try {
              turnResult = await processConversationTurn(messageText, knownInfo);
            } catch (error) {
              console.error("[Webhook] AI turn failed, sending fallback:", error);
              const fallbackMessage = "Sorry, I hit a temporary technical issue and couldn't process that. Please send it again in a minute.";
              await whatsappClient.sendMessage(whatsappNumber, fallbackMessage);
              await createMessage({
                leadId: lead.id,
                wamid: null,
                direction: "outbound",
                senderType: "system",
                messageType: "text",
                body: fallbackMessage,
              });
              continue;
            }

            console.log("[Webhook] Turn result:", {
              extractedFields: turnResult.data.extractedFields,
              provider: turnResult.providerUsed,
              failover: turnResult.wasFailover,
              wantsToBookSurvey: turnResult.data.wantsToBookSurvey,
              wantsHuman: turnResult.data.wantsHuman,
              needsTeamFollowUp: turnResult.data.needsTeamFollowUp,
            });

            // Merge any extracted fields
            const fieldsToMerge: any = {};
            const extracted = turnResult.data.extractedFields;
            if (extracted.moveType) fieldsToMerge.moveType = extracted.moveType;
            if (extracted.origin) fieldsToMerge.origin = extracted.origin;
            if (extracted.destination) fieldsToMerge.destination = extracted.destination;
            if (extracted.urgency) fieldsToMerge.urgency = extracted.urgency;
            if (extracted.hasSpecialItems !== undefined) fieldsToMerge.hasSpecialItems = extracted.hasSpecialItems;
            if (extracted.specialItems) fieldsToMerge.specialItems = extracted.specialItems;
            if (extracted.estimatedVolume) fieldsToMerge.estimatedVolume = extracted.estimatedVolume;
            if (extracted.requiresPacking !== undefined) fieldsToMerge.requiresPacking = extracted.requiresPacking;

            const hasNewFields = Object.keys(fieldsToMerge).length > 0;

            if (hasNewFields || turnResult.providerUsed) {
              await mergeLeadFields(
                lead.id,
                fieldsToMerge,
                turnResult.providerUsed,
                turnResult.wasFailover
              );
              console.log("[Webhook] Merged fields:", Object.keys(fieldsToMerge));
            }

            // Update status to gathering if we extracted new info from a new lead
            if (lead.status === "new" && hasNewFields) {
              await setLeadStatus(lead.id, "gathering");
            }

            // Send reply message
            await whatsappClient.sendMessage(whatsappNumber, turnResult.data.replyMessage);

            // Log outbound AI reply
            await createMessage({
              leadId: lead.id,
              wamid: null,
              direction: "outbound",
              senderType: "ai",
              messageType: "text",
              body: turnResult.data.replyMessage,
            });

            // Handle wants-to-book trigger
            const openOfferForSlots = turnResult.data.wantsToBookSurvey ? await findOpenBookingOffer(lead.id) : undefined;
            const offerSlotsNow = turnResult.data.wantsToBookSurvey && shouldOfferSurveySlots({ status: lead.status, openOffer: openOfferForSlots, now: new Date() });
            if (turnResult.data.wantsToBookSurvey && !offerSlotsNow) {
              console.log("[Webhook] Survey slots not re-sent: a fresh offer is already open", { leadId: lead.id });
            }
            if (offerSlotsNow) {
              await offerSlotsTo(lead.id, whatsappNumber, lead.status);
              console.log("[Webhook] Survey slot offer handled (AI detected intent)");
            }

            // Handle escalation request
            const humanRequested = turnResult.data.wantsHuman || looksLikeHumanRequest(messageText);
            if (humanRequested) {
              await setLeadEscalated(lead.id);
              const escalationMessage = "A team member from Suryodaya will reach out to you shortly.";
              await whatsappClient.sendMessage(whatsappNumber, escalationMessage);
              
              void adminNotifier.notifyLead({
                type: "human_requested",
                leadId: lead.id,
                lastMessage: messageText,
                slotLabel: null,
              }).catch(() => {});
              
              // Log outbound escalation ack
              await createMessage({
                leadId: lead.id,
                wamid: null,
                direction: "outbound",
                senderType: "system",
                messageType: "text",
                body: escalationMessage,
              });
              
              console.log("[Webhook] Escalated via free text");
            }

            const followUpNeeded =
              !humanRequested &&
              (turnResult.data.needsTeamFollowUp || promisesTeamFollowUp(turnResult.data.replyMessage));
            if (followUpNeeded) {
              const { shouldAlertTeamFollowUp } = await import("../flows/team-followup.js");
              const decision = shouldAlertTeamFollowUp({
                humanRequested,
                needsTeamFollowUp: turnResult.data.needsTeamFollowUp,
                replyPromisesTeam: promisesTeamFollowUp(turnResult.data.replyMessage),
                escalated: lead.escalated,
                escalatedAt: lead.escalated_at,
                now: new Date(),
              });

              if (decision.markEscalated) {
                await setLeadEscalated(lead.id);
              }

              if (decision.alert) {
                console.log("[Webhook] Flagged for team follow-up (reply promised a team confirmation):", { leadId: lead.id, byModel: turnResult.data.needsTeamFollowUp });
                void adminNotifier.notifyLead({
                  type: "needs_followup",
                  leadId: lead.id,
                  lastMessage: messageText,
                  slotLabel: null,
                }).catch(() => {});
              }
            }

            // Send quick-reply options (if this is a substantive turn)
            if (hasNewFields || lead.status === "gathering") {
              await whatsappClient.sendListMessage(
                whatsappNumber,
                "How can I help you next?",
                "Quick Options",
                [
                  { id: "get_estimate", title: "Get Quick Estimate", description: "Ballpark pricing" },
                  { id: "book_survey", title: "Book a Survey", description: "Schedule site visit" },
                  { id: "talk_human", title: "Talk to a Human", description: "Speak with team" },
                  { id: "update_details", title: "Update My Details", description: "Change information" },
                  { id: "get_move_total", title: "Get My Move Total", description: "Full estimate from all rooms" },
                ]
              );
              
              // Log outbound Quick Options list
              await createMessage({
                leadId: lead.id,
                wamid: null,
                direction: "outbound",
                senderType: "system",
                messageType: "list",
                body: "Quick Options menu",
              });
            }
          }

        } catch (error) {
          console.error("[Webhook] Processing failed for message:", wamid, error);
          // Don't rethrow - already sent 200 to Meta
        }
      }
    }
  }
}

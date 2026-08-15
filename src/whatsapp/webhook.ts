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
  const { isMessageProcessed, markMessageProcessed, findActiveLead, createLead, mergeLeadFields, setLeadStatus, setLeadEscalated, findOpenBookingOffer, createBookingOffer, recordSlotSelection } = await import("../leads/repository.js");
  const { processConversationTurn } = await import("../flows/qualification.js");
  const { generateSlotOptions, parseSlotSelection, generateConfirmationMessage } = await import("../flows/booking.js");
  const { getBallparkRange } = await import("../company/profile.js");
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
          let lead = await findActiveLead(whatsappNumber);
          
          if (!lead) {
            console.log("[Webhook] Creating new lead for:", whatsappNumber);
            lead = await createLead(whatsappNumber, contactName, message.text?.body || "[interactive]");
          } else {
            console.log("[Webhook] Found existing lead:", lead.id, "status:", lead.status);
          }

          // Step 3: Handle interactive button taps (deterministic routing)
          if (message.type === "interactive") {
            const interactionId = message.interactive?.list_reply?.id || message.interactive?.button_reply?.id;
            
            console.log("[Webhook] Interactive button tapped:", interactionId);

            if (interactionId === "talk_human") {
              await setLeadEscalated(lead.id);
              await whatsappClient.sendMessage(
                whatsappNumber,
                "Thank you! A team member from Suryodaya will reach out to you shortly."
              );
              console.log("[Webhook] Escalated lead:", lead.id);
              continue;
            }

            if (interactionId === "book_survey") {
              const slots = generateSlotOptions();
              const slotMessage = `Great! Here are available survey times:\n\n${slots.map((s, i) => `${i + 1}. ${s.label}`).join("\n")}\n\nReply with the number of your preferred time.`;
              
              await whatsappClient.sendMessage(whatsappNumber, slotMessage);
              await createBookingOffer(lead.id, slots);
              await setLeadStatus(lead.id, "booking_offered");
              console.log("[Webhook] Booking slots offered");
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
              } else {
                // Not enough info - only ask for what's actually needed
                const missing: string[] = [];
                if (!lead.move_type) missing.push("move type (local/intercity)");
                if (!lead.estimated_volume) missing.push("home/office size (1bhk/2bhk/etc)");

                await whatsappClient.sendMessage(
                  whatsappNumber,
                  `To give you an estimate, I need: ${missing.join(", ")}. Can you share those details?`
                );
              }
              continue;
            }

            if (interactionId === "update_details") {
              await whatsappClient.sendMessage(
                whatsappNumber,
                "Sure — what would you like to update?"
              );
              continue;
            }
          }

          // Step 4: Check if they're responding to a booking offer with a slot selection
          if (lead.status === "booking_offered" && message.type === "text" && message.text?.body) {
            const openOffer = await findOpenBookingOffer(lead.id);
            if (openOffer) {
              const slots = JSON.parse(openOffer.slot_options);
              const selectedSlot = parseSlotSelection(message.text.body, slots);

              if (selectedSlot) {
                console.log("[Webhook] Slot selected:", selectedSlot.label);
                
                await recordSlotSelection(openOffer.id, selectedSlot.label);
                await setLeadStatus(lead.id, "booked");

                const confirmMessage = await generateConfirmationMessage(selectedSlot);
                await whatsappClient.sendMessage(whatsappNumber, confirmMessage);

                console.log("[Webhook] Booking confirmed for lead:", lead.id);
                continue;
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

              console.log(`[Webhook] Processing ${mediaType} message:`, { mediaId, mimeType });

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
                });
              } else {
                // Video doesn't need mimeType parameter
                analysisResult = await analyzeMediaCapture({
                  type: "video",
                  base64Data,
                });
              }

              console.log("[Webhook] Media analysis complete:", {
                assetType: analysisResult.data.assetType,
                suggestedRoomLabel: analysisResult.data.suggestedRoomLabel,
                itemCount: analysisResult.data.items.length,
                totalCubicFeet: analysisResult.data.totalEstimatedCubicFeet,
                provider: analysisResult.providerUsed,
                failover: analysisResult.wasFailover,
              });

              // Save to database
              const { createMediaCapture } = await import("../leads/repository.js");
              await createMediaCapture({
                leadId: lead.id,
                wamid,
                mediaType,
                storagePath: uploadResult?.path || null,
                assetType: analysisResult.data.assetType,
                suggestedRoomLabel: analysisResult.data.suggestedRoomLabel,
                items: analysisResult.data.items,
                totalEstimatedCubicFeet: analysisResult.data.totalEstimatedCubicFeet,
                totalEstimatedWeightKg: analysisResult.data.totalEstimatedWeightKg,
                packingComplexity: analysisResult.data.packingComplexity,
                specialHandlingNotes: analysisResult.data.specialHandlingNotes,
                confidence: analysisResult.data.confidence,
                aiProviderUsed: analysisResult.providerUsed,
                aiWasFailover: analysisResult.wasFailover,
              });

              // Build reply message
              const roomLabel = analysisResult.data.suggestedRoomLabel || "this room";
              const itemList = analysisResult.data.items
                .slice(0, 5)
                .map((item) => `• ${item.name} (${item.quantity})`)
                .join("\n");
              const moreItems = analysisResult.data.items.length > 5 
                ? `\n...and ${analysisResult.data.items.length - 5} more items` 
                : "";

              const replyMessage = `Got it! For your ${roomLabel}, I can see:\n\n${itemList}${moreItems}\n\nEstimated ~${analysisResult.data.totalEstimatedCubicFeet.toFixed(1)} cu ft, ~${analysisResult.data.totalEstimatedWeightKg.toFixed(1)} kg.\n\nSend another room's photo or video anytime, or let me know when you're done and we'll add this to your move total.`;

              await whatsappClient.sendMessage(whatsappNumber, replyMessage);

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
                ]
              );

              console.log("[Webhook] Media processing complete for:", wamid);

            } catch (error) {
              console.error("[Webhook] Media processing failed:", error);
              await whatsappClient.sendMessage(
                whatsappNumber,
                "Sorry, I had trouble processing that - could you try sending it again?"
              );
            }
            continue;
          }

          // Step 6: Free text - process conversation turn with unified AI call
          if (message.type === "text" && message.text?.body) {
            const messageText = message.text.body;

            console.log("[Webhook] Processing conversation turn for lead:", lead.id);

            // Build known context from lead
            const knownInfo: any = {};
            if (lead.move_type) knownInfo.moveType = lead.move_type;
            if (lead.origin) knownInfo.origin = lead.origin;
            if (lead.destination) knownInfo.destination = lead.destination;
            if (lead.urgency) knownInfo.urgency = lead.urgency;
            if (lead.has_special_items !== null) knownInfo.hasSpecialItems = lead.has_special_items;
            if (lead.special_items) knownInfo.specialItems = JSON.parse(lead.special_items);
            if (lead.estimated_volume) knownInfo.estimatedVolume = lead.estimated_volume;
            if (lead.requires_packing !== null) knownInfo.requiresPacking = lead.requires_packing;

            // Single AI call for the turn
            const turnResult = await processConversationTurn(messageText, knownInfo);

            console.log("[Webhook] Turn result:", {
              extractedFields: turnResult.data.extractedFields,
              provider: turnResult.providerUsed,
              failover: turnResult.wasFailover,
              wantsToBookSurvey: turnResult.data.wantsToBookSurvey,
              wantsHuman: turnResult.data.wantsHuman,
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

            // Handle wants-to-book trigger
            if (turnResult.data.wantsToBookSurvey && lead.status !== "booking_offered" && lead.status !== "booked") {
              const slots = generateSlotOptions();
              const slotMessage = `Great! Here are available survey times:\n\n${slots.map((s, i) => `${i + 1}. ${s.label}`).join("\n")}\n\nReply with the number of your preferred time.`;
              
              await whatsappClient.sendMessage(whatsappNumber, slotMessage);
              await createBookingOffer(lead.id, slots);
              await setLeadStatus(lead.id, "booking_offered");
              console.log("[Webhook] Booking slots offered (AI detected intent)");
            }

            // Handle escalation request
            if (turnResult.data.wantsHuman) {
              await setLeadEscalated(lead.id);
              await whatsappClient.sendMessage(
                whatsappNumber,
                "A team member from Suryodaya will reach out to you shortly."
              );
              console.log("[Webhook] Escalated via free text");
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
                ]
              );
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

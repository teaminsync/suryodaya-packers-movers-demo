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
        const contact = contacts?.find((c) => c.wa_id === message.from);
        const contactName = contact?.profile.name || "Unknown";

        console.log("[Webhook] Received message:", {
          from: message.from,
          contactName,
          messageId: message.id,
          type: message.type,
          text: message.text?.body,
          timestamp: message.timestamp,
        });

        // Business logic will go here in future specs
        // For now, just log receipt
      }
    }
  }
}

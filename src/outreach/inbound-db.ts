/**
 * Database wiring for inbound outreach handler
 */

import { sql } from "../leads/db.js";
import { createMessage } from "../leads/repository.js";
import { whatsappClient } from "../whatsapp/client.js";
import { outreachDeps } from "./service-db.js";
import type { InboundOutreachDeps } from "./inbound.js";

export const inboundDeps: InboundOutreachDeps = {
  async recordConsent(params) {
    if (params.status !== "withdrawn") {
      return outreachDeps.recordConsent(params);
    }

    const { withRetry } = await import("./retry.js");
    try {
      await withRetry(() => outreachDeps.recordConsent(params), [500, 2000, 8000]);
    } catch (error) {
      console.error(
        "[Outreach] CRITICAL: could not record an opt-out after retries:",
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  },

  async closeLead(params) {
    await sql`
      UPDATE leads
      SET closed_at = ${params.nowIso},
          closed_reason = ${params.reason},
          updated_at = ${params.nowIso}
      WHERE id = ${params.leadId}
        AND closed_at IS NULL
    `;
  },

  async sendText(params) {
    const response = await whatsappClient.sendMessage(params.to, params.body);
    const wamid = response.messages?.[0]?.id ?? null;

    await createMessage({
      leadId: params.leadId,
      wamid,
      direction: "outbound",
      senderType: "ai",
      messageType: "text",
      body: params.body,
    });
  },
};

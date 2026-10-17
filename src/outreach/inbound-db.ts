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
    return outreachDeps.recordConsent(params);
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

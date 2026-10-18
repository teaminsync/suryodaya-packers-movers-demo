/**
 * Database wiring for outreach service
 */

import { sql } from "../leads/db.js";
import { randomUUID } from "crypto";
import { createMessage } from "../leads/repository.js";
import { whatsappClient } from "../whatsapp/client.js";
import type { OutreachDeps } from "./service.js";
import type { OutreachApiDeps } from "./api.js";

export const outreachDeps: OutreachDeps = {
  async getLead(leadId: string) {
    const result = await sql<any[]>`
      SELECT id, contact_id, contact_name, origin, destination, closed_at
      FROM leads
      WHERE id = ${leadId}
    `;
    return result[0];
  },

  async getContact(id: string) {
    const result = await sql<any[]>`
      SELECT id, phone_e164, display_name
      FROM contacts
      WHERE id = ${id}
    `;
    return result[0];
  },

  async getConsentRows(contactId: string) {
    const result = await sql<any[]>`
      SELECT channel, scope, status, captured_at
      FROM consents
      WHERE contact_id = ${contactId}
    `;
    return result;
  },

  async getLastInboundAt(contactId: string) {
    const result = await sql<any[]>`
      SELECT max(m.created_at) AS last
      FROM messages m
      JOIN leads l ON l.id = m.lead_id
      WHERE l.contact_id = ${contactId}
        AND m.direction = 'inbound'
        AND m.channel = 'whatsapp'
    `;
    return result[0]?.last ?? null;
  },

  async recordConsent(params) {
    const id = randomUUID();
    const createdAt = new Date().toISOString();

    await sql`
      INSERT INTO consents (
        id, contact_id, channel, scope, status, source, wording, evidence_ref, captured_at, created_at
      ) VALUES (
        ${id}, ${params.contactId}, ${params.channel}, ${params.scope}, ${params.status},
        ${params.source}, ${params.wording}, ${params.evidenceRef}, ${params.capturedAt}, ${createdAt}
      )
    `;
  },

  async sendTemplate(params) {
    return whatsappClient.sendTemplate(params);
  },

  async recordOutboundMessage(params) {
    await createMessage({
      leadId: params.leadId,
      wamid: params.wamid,
      direction: "outbound",
      senderType: "human",
      messageType: "text",
      body: params.body,
    });
  },

  businessNumber: process.env.WHATSAPP_BUSINESS_NUMBER,
};

async function listConsentHistory(contactId: string) {
  return sql<any[]>`
    SELECT status, source, wording, captured_at
    FROM consents
    WHERE contact_id = ${contactId}
      AND channel = 'whatsapp'
      AND scope = 'follow_up'
    ORDER BY captured_at DESC
    LIMIT 10
  `;
}

export const outreachApiDeps: OutreachApiDeps = {
  ...outreachDeps,
  getConsentHistory: listConsentHistory,
};

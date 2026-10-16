/**
 * Database wiring for inquiry ingestion
 */

import { randomUUID } from "crypto";
import { sql } from "./db.js";
import { createMessage } from "./repository.js";
import { intakeDeps } from "./intake-db.js";
import { ingestInquiry, type IngestDeps } from "./ingest.js";
import type { InquiryEvent } from "../intake/types.js";
import type { IndiaMartIngestSummary } from "../intake/indiamart-handler.js";

async function touchpointExists(source: string, externalRef: string): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM touchpoints
    WHERE source = ${source} AND external_ref = ${externalRef}
    LIMIT 1
  `;
  return result.length > 0;
}

async function recordInboundMessage(params: {
  leadId: string;
  channel: string;
  body: string;
}): Promise<void> {
  await createMessage({
    leadId: params.leadId,
    wamid: null,
    direction: "inbound",
    senderType: "customer",
    messageType: "text",
    body: params.body,
    channel: params.channel,
  });
}

export const ingestDeps: IngestDeps = {
  ...intakeDeps,
  touchpointExists,
  recordInboundMessage,
};

export async function recordIntakeReject(params: {
  source: string;
  reason: string;
  rawPayload: string;
}): Promise<void> {
  const id = randomUUID();
  const now = new Date().toISOString();

  await sql`
    INSERT INTO intake_rejects (id, source, reason, raw_payload, created_at)
    VALUES (${id}, ${params.source}, ${params.reason}, ${params.rawPayload}, ${now})
  `;
}

export async function ingestIndiaMartEvent(
  event: InquiryEvent,
  now: Date
): Promise<IndiaMartIngestSummary> {
  const result = await ingestInquiry(event, now, ingestDeps);

  return {
    duplicate: result.duplicate,
    createdEnquiry: result.createdEnquiry,
    reason: result.reason,
    leadId: result.lead?.id,
  };
}

/**
 * Database wiring for automation scheduler
 */

import { randomUUID } from "crypto";
import { sql } from "../leads/db.js";
import { parseAutomationConfig } from "./config.js";
import type { FollowupSnapshot } from "./rules.js";
import { currentConsent, CONSENT_CHANNEL_WHATSAPP, CONSENT_SCOPE_FOLLOWUP } from "../outreach/consent.js";
import { createMessage } from "../leads/repository.js";
import { whatsappClient } from "../whatsapp/client.js";
import { toIstParts } from "../calendar/ist.js";
import { createAutomationApi } from "./api.js";
import { runFollowupTick } from "./scheduler.js";
import type { HistoryRow } from "./api.js";

const { config, warnings } = parseAutomationConfig(process.env);

for (const w of warnings) {
  console.warn("[Followups]", w);
}

export const automationConfig = config;

export async function loadFollowupSnapshot(leadId: string): Promise<FollowupSnapshot | null> {
  const leadRows = await sql<any[]>`
    SELECT l.id, l.status, l.human_takeover, l.closed_at, l.origin, l.destination, l.move_type, l.urgency, l.estimated_volume, l.contact_id,
           c.id AS contact_id_check, c.phone_e164, c.display_name
    FROM leads l
    LEFT JOIN contacts c ON c.id = l.contact_id
    WHERE l.id = ${leadId}
  `;

  if (leadRows.length === 0) {
    return null;
  }

  const row = leadRows[0];

  if (!row.contact_id) {
    return null;
  }

  // Last inbound WhatsApp message for this contact
  const lastInboundRows = await sql<any[]>`
    SELECT max(m.created_at) AS last
    FROM messages m
    JOIN leads l ON l.id = m.lead_id
    WHERE l.contact_id = ${row.contact_id}
      AND m.direction = 'inbound'
      AND m.channel = 'whatsapp'
  `;

  const lastInboundAt = lastInboundRows[0]?.last ?? null;

  // Consent
  const consentRows = await sql<any[]>`
    SELECT channel, scope, status, captured_at
    FROM consents
    WHERE contact_id = ${row.contact_id}
  `;

  const consent = currentConsent(consentRows, CONSENT_CHANNEL_WHATSAPP, CONSENT_SCOPE_FOLLOWUP);

  // Most recent booking with selected slot and future survey start
  const bookingRows = await sql<any[]>`
    SELECT id, selected_slot, survey_starts_at, responded_at, calendar_status
    FROM booking_offers
    WHERE lead_id = ${leadId}
      AND selected_slot IS NOT NULL
      AND survey_starts_at IS NOT NULL
      AND calendar_status IS DISTINCT FROM 'cancelled'
    ORDER BY survey_starts_at DESC
    LIMIT 1
  `;

  let booking: { offerId: string; startsAt: Date | string; confirmedAt: Date | string | null } | null = null;

  if (bookingRows.length > 0) {
    const b = bookingRows[0];
    booking = {
      offerId: b.id,
      startsAt: b.survey_starts_at,
      confirmedAt: b.responded_at,
    };
  }

  // Existing scheduled actions
  const existingRows = await sql<any[]>`
    SELECT kind, ref, status
    FROM scheduled_actions
    WHERE lead_id = ${leadId}
  `;

  const existing = existingRows.map(e => ({ kind: e.kind, ref: e.ref, status: e.status }));

  return {
    lead: {
      id: row.id,
      status: row.status,
      humanTakeover: row.human_takeover,
      closedAt: row.closed_at,
      origin: row.origin,
      destination: row.destination,
      moveType: row.move_type,
      urgency: row.urgency,
      estimatedVolume: row.estimated_volume,
    },
    contact: {
      id: row.contact_id,
      phoneE164: row.phone_e164,
      displayName: row.display_name,
    },
    lastInboundAt,
    consent,
    booking,
    existing,
  };
}

export async function listCandidateLeadIds(): Promise<string[]> {
  const rows = await sql<any[]>`
    SELECT DISTINCT l.id
    FROM leads l
    JOIN contacts c ON c.id = l.contact_id
    WHERE l.closed_at IS NULL
      AND l.human_takeover = false
      AND c.phone_e164 IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM messages m
          JOIN leads l2 ON l2.id = m.lead_id
          WHERE l2.contact_id = l.contact_id
            AND m.direction = 'inbound'
            AND m.channel = 'whatsapp'
            AND m.created_at >= now() - interval '8 days'
        )
        OR EXISTS (
          SELECT 1 FROM booking_offers bo
          WHERE bo.lead_id = l.id
            AND bo.selected_slot IS NOT NULL
            AND bo.survey_starts_at IS NOT NULL
            AND bo.survey_starts_at > now()
            AND bo.calendar_status IS DISTINCT FROM 'cancelled'
        )
      )
  `;

  return rows.map(r => r.id);
}

export async function countSentToday(now: Date): Promise<number> {
  const parts = toIstParts(now);
  const dayStart = new Date(`${parts.dateKey}T00:00:00+05:30`);

  const rows = await sql<any[]>`
    SELECT count(*) AS cnt
    FROM scheduled_actions
    WHERE status = 'sent'
      AND processed_at >= ${dayStart.toISOString()}
  `;

  return parseInt(rows[0]?.cnt ?? "0", 10);
}

export async function claim(a: { leadId: string; kind: string; ref: string; dueAt: Date }): Promise<boolean> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const rows = await sql<any[]>`
    INSERT INTO scheduled_actions (id, lead_id, kind, ref, due_at, status, created_at)
    VALUES (${id}, ${a.leadId}, ${a.kind}, ${a.ref}, ${a.dueAt.toISOString()}, 'claimed', ${now})
    ON CONFLICT (lead_id, kind, ref) DO NOTHING
    RETURNING id
  `;

  return rows.length > 0;
}

export async function recordSkipped(a: { leadId: string; kind: string; ref: string; dueAt: Date; reason: string }): Promise<void> {
  const id = randomUUID();
  const now = new Date().toISOString();

  await sql`
    INSERT INTO scheduled_actions (id, lead_id, kind, ref, due_at, status, reason, created_at, processed_at)
    VALUES (${id}, ${a.leadId}, ${a.kind}, ${a.ref}, ${a.dueAt.toISOString()}, 'skipped', ${a.reason}, ${now}, ${now})
    ON CONFLICT (lead_id, kind, ref) DO NOTHING
  `;
}

export async function markSent(a: { leadId: string; kind: string; ref: string; channel: "freeform" | "template"; templateName: string | null; wamid: string | null }): Promise<void> {
  const now = new Date().toISOString();

  await sql`
    UPDATE scheduled_actions
    SET status = 'sent', channel = ${a.channel}, template_name = ${a.templateName}, wamid = ${a.wamid}, processed_at = ${now}
    WHERE lead_id = ${a.leadId} AND kind = ${a.kind} AND ref = ${a.ref}
  `;
}

export async function markFailed(a: { leadId: string; kind: string; ref: string; error: string }): Promise<void> {
  const now = new Date().toISOString();

  await sql`
    UPDATE scheduled_actions
    SET status = 'failed', reason = ${a.error}, processed_at = ${now}
    WHERE lead_id = ${a.leadId} AND kind = ${a.kind} AND ref = ${a.ref}
  `;
}

export async function sendFreeform(a: { leadId: string; to: string; text: string }): Promise<{ wamid: string | null }> {
  const result = await whatsappClient.sendMessage(a.to, a.text);

  await createMessage({
    leadId: a.leadId,
    wamid: result.messages?.[0]?.id ?? null,
    direction: "outbound",
    senderType: "system",
    messageType: "text",
    body: a.text,
  });

  return { wamid: result.messages?.[0]?.id ?? null };
}

export async function sendTemplate(a: { leadId: string; to: string; templateName: string; languageCode: string; bodyParams: string[]; buttonPayloads: string[]; renderedText: string }): Promise<{ wamid: string | null }> {
  const result = await whatsappClient.sendTemplate({
    to: a.to,
    templateName: a.templateName,
    languageCode: a.languageCode,
    bodyParams: a.bodyParams,
    buttonPayloads: a.buttonPayloads,
  });

  await createMessage({
    leadId: a.leadId,
    wamid: result.wamid,
    direction: "outbound",
    senderType: "system",
    messageType: "text",
    body: a.renderedText,
  });

  return { wamid: result.wamid };
}

export async function listHistory(leadId: string): Promise<HistoryRow[]> {
  const rows = await sql<any[]>`
    SELECT id, kind, status, reason, channel, template_name, due_at, processed_at
    FROM scheduled_actions
    WHERE lead_id = ${leadId}
    ORDER BY created_at DESC
    LIMIT 20
  `;

  return rows.map(r => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    reason: r.reason,
    channel: r.channel,
    templateName: r.template_name,
    dueAt: r.due_at,
    processedAt: r.processed_at,
  }));
}

export async function insertCancelled(a: { leadId: string; kind: string; ref: string; dueAt: Date; reason: string }): Promise<"inserted" | "exists"> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const rows = await sql<any[]>`
    INSERT INTO scheduled_actions (id, lead_id, kind, ref, due_at, status, reason, created_at, processed_at)
    VALUES (${id}, ${a.leadId}, ${a.kind}, ${a.ref}, ${a.dueAt.toISOString()}, 'cancelled', ${a.reason}, ${now}, ${now})
    ON CONFLICT (lead_id, kind, ref) DO NOTHING
    RETURNING id
  `;

  return rows.length > 0 ? "inserted" : "exists";
}

export async function hasRecentNudge(leadId: string, now: Date): Promise<boolean> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const rows = await sql<any[]>`
    SELECT 1
    FROM scheduled_actions
    WHERE lead_id = ${leadId}
      AND (kind = 'nudge_inwindow' OR kind = 'nudge_template')
      AND status = 'sent'
      AND processed_at >= ${cutoff}
    LIMIT 1
  `;

  return rows.length > 0;
}

export const automationApi = createAutomationApi({
  getConfig: () => automationConfig,
  loadSnapshot: loadFollowupSnapshot,
  listHistory,
  insertCancelled,
  now: () => new Date(),
});

let tickRunning = false;

export function startAutomationScheduler(): void {
  if (!automationConfig.enabled) {
    console.log("[Followups] scheduler off (set FOLLOWUPS_ENABLED=true to enable)");
    return;
  }

  console.log("[Followups] scheduler on", { dryRun: automationConfig.dryRun, tickMinutes: automationConfig.tickMinutes });

  const tick = async () => {
    if (tickRunning) {
      return;
    }

    tickRunning = true;

    try {
      const result = await runFollowupTick({
        now: () => new Date(),
        config: automationConfig,
        listCandidateLeadIds,
        loadSnapshot: loadFollowupSnapshot,
        countSentToday,
        claim,
        recordSkipped,
        markSent,
        markFailed,
        sendFreeform,
        sendTemplate,
        log: (message: string, detail?: unknown) => {
          if (detail !== undefined) {
            console.log(message, detail);
          } else {
            console.log(message);
          }
        },
      });

      const total = result.sent + result.failed + result.skipped + result.dryRun;
      if (total > 0) {
        console.log("[Followups] tick complete", result);
      }
    } catch (error) {
      console.error("[Followups] tick error:", error instanceof Error ? error.message : String(error));
    } finally {
      tickRunning = false;
    }
  };

  setTimeout(tick, 30000);
  setInterval(tick, automationConfig.tickMinutes * 60 * 1000);
}

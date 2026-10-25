/**
 * Database wiring for admin notifications
 */

import { randomUUID } from "crypto";
import { sql } from "../leads/db.js";
import { findLeadById } from "../leads/repository.js";
import { findContactById } from "../leads/contacts.js";
import { whatsappClient } from "../whatsapp/client.js";
import { createNotifier } from "./notifier.js";
import { isRecentlySent } from "./dedupe.js";
import type { AdminEvent, AdminEventType } from "./types.js";

async function loadContact(contactId: string | null) {
  if (!contactId) {
    return null;
  }

  const contact = await findContactById(contactId);
  return contact ?? null;
}

const emailConfig =
  process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL
    ? {
        apiKey: process.env.RESEND_API_KEY,
        to: process.env.ADMIN_EMAIL,
        from: process.env.ADMIN_EMAIL_FROM || "Suryodaya Alerts <onboarding@resend.dev>",
      }
    : null;

const whatsappConfig =
  process.env.ADMIN_WHATSAPP_NUMBER && process.env.ADMIN_WHATSAPP_TEMPLATE
    ? {
        to: process.env.ADMIN_WHATSAPP_NUMBER.replace(/\D/g, ""),
        template: process.env.ADMIN_WHATSAPP_TEMPLATE,
      }
    : null;

const dashboardBaseUrl = process.env.DASHBOARD_BASE_URL || null;
const dryRun = process.env.NOTIFY_DRY_RUN === "true";

const notifier = createNotifier({
  emailConfig,
  whatsappConfig,
  dashboardBaseUrl,
  dryRun,
  now: () => new Date(),

  async sendEmail(input) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`Resend HTTP ${response.status}: ${bodyText.substring(0, 200)}`);
    }
  },

  async sendWhatsappTemplate(input) {
    await whatsappClient.sendTemplate({
      to: input.to,
      templateName: input.templateName,
      languageCode: input.languageCode,
      bodyParams: input.bodyParams,
    });
  },

  async recentlySent(leadId, type, since, dedupeKey) {
    const rows = await sql<Array<{ status: string; created_at: string }>>`
      SELECT status, created_at
      FROM admin_notifications
      WHERE lead_id = ${leadId}
        AND event_type = ${type}
        AND created_at >= ${since.toISOString()}
        AND dedupe_key IS NOT DISTINCT FROM ${dedupeKey}::text
    `;

    return isRecentlySent(rows, new Date());
  },

  async record(row) {
    const id = randomUUID();
    const now = new Date().toISOString();

    await sql`
      INSERT INTO admin_notifications (id, lead_id, event_type, channel, status, detail, created_at, dedupe_key)
      VALUES (${id}, ${row.leadId}, ${row.eventType}, ${row.channel}, ${row.status}, ${row.detail}, ${now}, ${row.dedupeKey})
    `;
  },
});

/**
 * Load lead and contact data for admin event base
 */
export async function loadAdminEventBase(
  leadId: string
): Promise<Omit<AdminEvent, "type" | "lastMessage" | "slotLabel"> | null> {
  const lead = await findLeadById(leadId);

  if (!lead) {
    return null;
  }

  const contact = await loadContact(lead.contact_id);

  let customerName: string | null = null;
  if (lead.source === "instagram") {
    if (contact?.display_name) {
      customerName = contact.display_name;
    } else if (contact?.instagram_username) {
      customerName = `@${contact.instagram_username}`;
    } else {
      customerName = "Instagram user";
    }
  } else {
    customerName = contact?.display_name || lead.contact_name || null;
  }

  const phone = contact?.phone_e164 || null;

  let specialItems: string[] = [];
  if (lead.special_items) {
    try {
      const parsed = JSON.parse(lead.special_items);
      if (Array.isArray(parsed)) {
        specialItems = parsed.filter((item) => typeof item === "string");
      }
    } catch {}
  }

  return {
    leadId: lead.id,
    source: lead.source,
    customerName,
    phone,
    moveType: lead.move_type,
    origin: lead.origin,
    destination: lead.destination,
    estimatedVolume: lead.estimated_volume,
    urgency: lead.urgency,
    specialItems,
  };
}

async function notifyLead(input: {
  type: AdminEventType;
  leadId: string;
  lastMessage?: string | null;
  slotLabel?: string | null;
}): Promise<void> {
  const base = await loadAdminEventBase(input.leadId);

  if (!base) {
    console.log(`[Notify] Lead ${input.leadId} not found`);
    return;
  }

  const lastMessage = input.lastMessage?.trim() || null;

  const event: AdminEvent = {
    ...base,
    type: input.type,
    lastMessage,
    slotLabel: input.slotLabel || null,
  };

  await notifier.notify(event);
}

export const adminNotifier = {
  notify: notifier.notify,
  notifyLead,
};

export function describeNotifyChannels(): string {
  const parts: string[] = [];
  parts.push(`email=${emailConfig ? "on" : "off"}`);
  parts.push(`whatsapp=${whatsappConfig ? "on" : "off"}`);
  parts.push(`dryRun=${dryRun}`);
  return parts.join(" ");
}

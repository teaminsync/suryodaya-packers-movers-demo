/**
 * Contact management operations
 */

import { randomUUID } from "crypto";
import { sql } from "./db.js";
import type { Contact } from "./types.js";

export async function upsertContactByPhone(
  phoneE164: string,
  displayName: string | null
): Promise<Contact> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const result = await sql<Contact[]>`
    INSERT INTO contacts (id, phone_e164, display_name, created_at, updated_at)
    VALUES (${id}, ${phoneE164}, ${displayName}, ${now}, ${now})
    ON CONFLICT (phone_e164) DO UPDATE SET
      display_name = COALESCE(contacts.display_name, EXCLUDED.display_name),
      updated_at = EXCLUDED.updated_at
    RETURNING *
  `;

  return result[0];
}

export async function ensureIdentity(
  contactId: string,
  channel: string,
  externalId: string
): Promise<void> {
  const id = randomUUID();
  const now = new Date().toISOString();

  await sql`
    INSERT INTO contact_identities (id, contact_id, channel, external_id, created_at)
    VALUES (${id}, ${contactId}, ${channel}, ${externalId}, ${now})
    ON CONFLICT (channel, external_id) DO NOTHING
  `;
}

export async function findContactByIdentity(
  channel: string,
  externalId: string
): Promise<Contact | undefined> {
  const result = await sql<Contact[]>`
    SELECT c.* FROM contacts c
    JOIN contact_identities ci ON c.id = ci.contact_id
    WHERE ci.channel = ${channel} AND ci.external_id = ${externalId}
  `;

  return result[0];
}

export async function linkLeadToContact(
  leadId: string,
  contactId: string,
  source: string
): Promise<void> {
  const now = new Date().toISOString();

  await sql`
    UPDATE leads
    SET contact_id = ${contactId},
        source = COALESCE(source, ${source}),
        updated_at = ${now}
    WHERE id = ${leadId}
  `;
}

export async function recordTouchpoint(params: {
  leadId: string;
  contactId: string;
  source: string;
  externalRef: string | null;
  rawPayload: string | null;
  receivedAt: string;
}): Promise<boolean> {
  const id = randomUUID();
  const now = new Date().toISOString();

  if (params.externalRef != null) {
    const result = await sql`
      INSERT INTO touchpoints (id, lead_id, contact_id, source, external_ref, raw_payload, received_at, created_at)
      VALUES (${id}, ${params.leadId}, ${params.contactId}, ${params.source}, ${params.externalRef}, ${params.rawPayload}, ${params.receivedAt}, ${now})
      ON CONFLICT (source, external_ref) WHERE external_ref IS NOT NULL DO NOTHING
    `;
    return result.count > 0;
  } else {
    await sql`
      INSERT INTO touchpoints (id, lead_id, contact_id, source, external_ref, raw_payload, received_at, created_at)
      VALUES (${id}, ${params.leadId}, ${params.contactId}, ${params.source}, ${params.externalRef}, ${params.rawPayload}, ${params.receivedAt}, ${now})
    `;
    return true;
  }
}

export async function createContactWithoutPhone(
  displayName: string | null
): Promise<Contact> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const result = await sql<Contact[]>`
    INSERT INTO contacts (id, phone_e164, display_name, created_at, updated_at)
    VALUES (${id}, NULL, ${displayName}, ${now}, ${now})
    RETURNING *
  `;

  return result[0];
}

export async function findIdentityExternalId(
  contactId: string,
  channel: string
): Promise<string | undefined> {
  const result = await sql<{ external_id: string }[]>`
    SELECT external_id FROM contact_identities
    WHERE contact_id = ${contactId} AND channel = ${channel}
  `;

  return result[0]?.external_id;
}

export async function setDisplayNameIfMissing(
  contactId: string,
  displayName: string
): Promise<void> {
  const now = new Date().toISOString();

  await sql`
    UPDATE contacts
    SET display_name = COALESCE(display_name, ${displayName}),
        updated_at = ${now}
    WHERE id = ${contactId}
  `;
}

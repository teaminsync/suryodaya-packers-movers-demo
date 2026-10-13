/**
 * Backfill contacts from existing leads
 */

import { randomUUID } from "crypto";
import { sql } from "./db.js";
import { normalizePhoneE164 } from "./phone.js";
import { planContactBackfill } from "./backfill-plan.js";
import type { Lead, Contact } from "./types.js";

export async function backfillContactsFromLeads(options: { dryRun: boolean }): Promise<{
  leadsScanned: number;
  leadsLinked: number;
  contactsCreated: number;
  identitiesCreated: number;
  touchpointsCreated: number;
  skipped: Array<{ leadId: string; reason: string; numberTail: string }>;
}> {
  const leads = await sql<Lead[]>`
    SELECT * FROM leads
    WHERE contact_id IS NULL
    ORDER BY created_at ASC
  `;

  const leadsScanned = leads.length;
  const skipped: Array<{ leadId: string; reason: string; numberTail: string }> = [];

  if (options.dryRun) {
    const candidatePhones = new Set<string>();
    const candidateRawNumbers = new Set<string>();

    for (const lead of leads) {
      const phoneE164 = normalizePhoneE164(lead.whatsapp_number);
      if (phoneE164 !== null) {
        candidatePhones.add(phoneE164);
        candidateRawNumbers.add(lead.whatsapp_number);
      }
    }

    let existingPhones: Set<string>;
    if (candidatePhones.size > 0) {
      const existingPhonesResult = await sql<{ phone_e164: string }[]>`
        SELECT phone_e164 FROM contacts WHERE phone_e164 = ANY(${sql.array([...candidatePhones])})
      `;
      existingPhones = new Set(existingPhonesResult.map((r) => r.phone_e164));
    } else {
      existingPhones = new Set();
    }

    let existingWhatsappIdentities: Set<string>;
    if (candidateRawNumbers.size > 0) {
      const existingIdentitiesResult = await sql<{ external_id: string }[]>`
        SELECT external_id FROM contact_identities WHERE channel = 'whatsapp' AND external_id = ANY(${sql.array([...candidateRawNumbers])})
      `;
      existingWhatsappIdentities = new Set(existingIdentitiesResult.map((r) => r.external_id));
    } else {
      existingWhatsappIdentities = new Set();
    }

    return {
      leadsScanned,
      ...planContactBackfill(leads, existingPhones, existingWhatsappIdentities),
    };
  }

  let leadsLinked = 0;
  let contactsCreated = 0;
  let identitiesCreated = 0;
  let touchpointsCreated = 0;

  await sql.begin(async (tx) => {
    for (const lead of leads) {
      const phoneE164 = normalizePhoneE164(lead.whatsapp_number);
      if (phoneE164 === null) {
        const tail = lead.whatsapp_number.slice(-4);
        skipped.push({ leadId: lead.id, reason: "unparseable phone", numberTail: tail });
        continue;
      }

      const existingContact = await tx<Contact[]>`
        SELECT * FROM contacts WHERE phone_e164 = ${phoneE164}
      `;

      const wasNew = existingContact.length === 0;

      const contactId = randomUUID();
      const now = new Date().toISOString();

      const contact = await tx<Contact[]>`
        INSERT INTO contacts (id, phone_e164, display_name, created_at, updated_at)
        VALUES (${contactId}, ${phoneE164}, ${lead.contact_name}, ${now}, ${now})
        ON CONFLICT (phone_e164) DO UPDATE SET
          display_name = COALESCE(contacts.display_name, EXCLUDED.display_name),
          updated_at = EXCLUDED.updated_at
        RETURNING *
      `;

      if (wasNew) {
        contactsCreated++;
      }

      const identityId = randomUUID();
      const identityResult = await tx`
        INSERT INTO contact_identities (id, contact_id, channel, external_id, created_at)
        VALUES (${identityId}, ${contact[0].id}, 'whatsapp', ${lead.whatsapp_number}, ${now})
        ON CONFLICT (channel, external_id) DO NOTHING
      `;

      if (identityResult.count > 0) {
        identitiesCreated++;
      }

      await tx`
        UPDATE leads
        SET contact_id = ${contact[0].id},
            source = COALESCE(source, 'whatsapp'),
            updated_at = ${now}
        WHERE id = ${lead.id}
      `;

      const touchpointId = randomUUID();
      const touchpointResult = await tx`
        INSERT INTO touchpoints (id, lead_id, contact_id, source, external_ref, raw_payload, received_at, created_at)
        VALUES (${touchpointId}, ${lead.id}, ${contact[0].id}, 'whatsapp', ${"backfill:" + lead.id}, NULL, ${lead.created_at}, ${now})
        ON CONFLICT (source, external_ref) WHERE external_ref IS NOT NULL DO NOTHING
      `;

      if (touchpointResult.count > 0) {
        touchpointsCreated++;
      }

      leadsLinked++;
    }
  });

  return {
    leadsScanned,
    leadsLinked,
    contactsCreated,
    identitiesCreated,
    touchpointsCreated,
    skipped,
  };
}

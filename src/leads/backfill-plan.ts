/**
 * Backfill planning logic (pure computation, no database access)
 */

import { normalizePhoneE164 } from "./phone.js";

export function planContactBackfill(
  leads: Array<{ id: string; whatsapp_number: string }>,
  existingPhones: Set<string>,
  existingWhatsappIdentities: Set<string>
): {
  leadsLinked: number;
  contactsCreated: number;
  identitiesCreated: number;
  touchpointsCreated: number;
  skipped: Array<{ leadId: string; reason: string; numberTail: string }>;
} {
  let leadsLinked = 0;
  const skipped: Array<{ leadId: string; reason: string; numberTail: string }> = [];
  const seenPhones = new Set<string>();
  const seenRawNumbers = new Set<string>();

  for (const lead of leads) {
    const phoneE164 = normalizePhoneE164(lead.whatsapp_number);
    
    if (phoneE164 === null) {
      const tail = lead.whatsapp_number.slice(-4);
      skipped.push({ leadId: lead.id, reason: "unparseable phone", numberTail: tail });
      continue;
    }

    leadsLinked++;
    seenPhones.add(phoneE164);
    seenRawNumbers.add(lead.whatsapp_number);
  }

  const contactsCreated = [...seenPhones].filter((p) => !existingPhones.has(p)).length;
  const identitiesCreated = [...seenRawNumbers].filter((n) => !existingWhatsappIdentities.has(n)).length;
  const touchpointsCreated = leadsLinked;

  return {
    leadsLinked,
    contactsCreated,
    identitiesCreated,
    touchpointsCreated,
    skipped,
  };
}

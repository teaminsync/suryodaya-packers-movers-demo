/**
 * Tests for backfill planning logic
 */

import { planContactBackfill } from "../backfill-plan.js";

describe("Backfill planning", () => {
  it("mixed input", () => {
    const leads = [
      { id: "a", whatsapp_number: "919082210545" },
      { id: "b", whatsapp_number: "9082210545" },
      { id: "c", whatsapp_number: "919082210545" },
      { id: "d", whatsapp_number: "abc" },
      { id: "e", whatsapp_number: "14155550123" },
    ];
    const existingPhones = new Set<string>();
    const existingWhatsappIdentities = new Set<string>();

    const result = planContactBackfill(leads, existingPhones, existingWhatsappIdentities);

    expect(result.leadsLinked).toBe(4);
    expect(result.contactsCreated).toBe(2);
    expect(result.identitiesCreated).toBe(3);
    expect(result.touchpointsCreated).toBe(4);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].leadId).toBe("d");
  });

  it("existing data", () => {
    const leads = [
      { id: "a", whatsapp_number: "919082210545" },
      { id: "b", whatsapp_number: "9082210545" },
    ];
    const existingPhones = new Set(["+919082210545"]);
    const existingWhatsappIdentities = new Set(["919082210545"]);

    const result = planContactBackfill(leads, existingPhones, existingWhatsappIdentities);

    expect(result.leadsLinked).toBe(2);
    expect(result.contactsCreated).toBe(0);
    expect(result.identitiesCreated).toBe(1);
    expect(result.touchpointsCreated).toBe(2);
    expect(result.skipped).toHaveLength(0);
  });

  it("empty input", () => {
    const leads: Array<{ id: string; whatsapp_number: string }> = [];
    const existingPhones = new Set<string>();
    const existingWhatsappIdentities = new Set<string>();

    const result = planContactBackfill(leads, existingPhones, existingWhatsappIdentities);

    expect(result.leadsLinked).toBe(0);
    expect(result.contactsCreated).toBe(0);
    expect(result.identitiesCreated).toBe(0);
    expect(result.touchpointsCreated).toBe(0);
    expect(result.skipped).toHaveLength(0);
  });
});

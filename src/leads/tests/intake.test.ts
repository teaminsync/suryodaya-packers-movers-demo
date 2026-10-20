/**
 * Tests for contact and enquiry resolution
 */

import { resolveEnquiry } from "../intake.js";
import type { IntakeDeps } from "../intake.js";
import type { Contact, Lead } from "../types.js";

interface CallRecord {
  fn: string;
  args: any[];
}

function makeDeps(overrides: Partial<IntakeDeps> = {}): IntakeDeps & { calls: CallRecord[] } {
  const calls: CallRecord[] = [];

  const defaults: IntakeDeps = {
    async findContactByIdentity(channel: string, externalId: string): Promise<Contact | undefined> {
      calls.push({ fn: "findContactByIdentity", args: [channel, externalId] });
      return undefined;
    },
    async upsertContactByPhone(phoneE164: string, displayName: string | null): Promise<Contact> {
      calls.push({ fn: "upsertContactByPhone", args: [phoneE164, displayName] });
      return { id: "c1", phone_e164: phoneE164, display_name: displayName, created_at: "", updated_at: "" } as unknown as Contact;
    },
    async createContactWithoutPhone(displayName: string | null): Promise<Contact> {
      calls.push({ fn: "createContactWithoutPhone", args: [displayName] });
      return { id: "c2", phone_e164: null, display_name: displayName, created_at: "", updated_at: "" } as unknown as Contact;
    },
    async setDisplayNameIfMissing(contactId: string, displayName: string): Promise<void> {
      calls.push({ fn: "setDisplayNameIfMissing", args: [contactId, displayName] });
    },
    async ensureIdentity(contactId: string, channel: string, externalId: string): Promise<void> {
      calls.push({ fn: "ensureIdentity", args: [contactId, channel, externalId] });
    },
    async findLatestLeadForContact(contactId: string): Promise<Lead | undefined> {
      calls.push({ fn: "findLatestLeadForContact", args: [contactId] });
      return undefined;
    },
    async touchLead(leadId: string, nowIso: string): Promise<void> {
      calls.push({ fn: "touchLead", args: [leadId, nowIso] });
    },
    async createLeadForContact(params: any): Promise<Lead> {
      calls.push({ fn: "createLeadForContact", args: [params] });
      return { id: "l-new", whatsapp_number: params.whatsappNumber, contact_id: params.contactId, status: "new" } as unknown as Lead;
    },
    async recordTouchpoint(params: any): Promise<boolean> {
      calls.push({ fn: "recordTouchpoint", args: [params] });
      return true;
    },
  };

  return {
    ...defaults,
    ...overrides,
    calls,
  } as IntakeDeps & { calls: CallRecord[] };
}

describe("Intake resolution", () => {
  const now = new Date("2026-10-13T00:00:00.000Z");

  it("new customer", async () => {
    const deps = makeDeps();
    const result = await resolveEnquiry(
      {
        channel: "whatsapp",
        externalId: "919082210545",
        contactName: "Devansh",
        firstMessageText: "Hi",
        externalRef: "wamid.X",
        now,
      },
      deps
    );

    expect(deps.calls).toContainEqual({ fn: "upsertContactByPhone", args: ["+919082210545", "Devansh"] });
    expect(deps.calls).toContainEqual({ fn: "ensureIdentity", args: ["c1", "whatsapp", "919082210545"] });
    expect(deps.calls.find((c) => c.fn === "createLeadForContact")).toBeTruthy();
    const createLeadCall = deps.calls.find((c) => c.fn === "createLeadForContact");
    expect(createLeadCall?.args[0]).toMatchObject({
      contactId: "c1",
      source: "whatsapp",
      rawEnquiryText: "Hi",
      whatsappNumber: "919082210545",
    });
    expect(deps.calls.find((c) => c.fn === "recordTouchpoint")).toBeTruthy();
    const touchpointCall = deps.calls.find((c) => c.fn === "recordTouchpoint");
    expect(touchpointCall?.args[0]).toMatchObject({
      leadId: "l-new",
      source: "whatsapp",
      externalRef: "wamid.X",
      receivedAt: now.toISOString(),
    });
    expect(deps.calls.find((c) => c.fn === "touchLead")).toBeFalsy();
    expect(result.createdEnquiry).toBe(true);
    expect(result.reason).toBe("no_enquiry");
  });

  it("known contact with a recent enquiry", async () => {
    const twoDaysAgo = new Date(now.getTime() - 2 * 86400000).toISOString();
    const contact = { id: "c3", phone_e164: "+919082210545", display_name: "Dev", created_at: "", updated_at: "" } as unknown as Contact;
    const existingLead = { id: "l-existing", closed_at: null, updated_at: twoDaysAgo } as unknown as Lead;

    const deps = makeDeps({
      async findContactByIdentity() {
        deps.calls.push({ fn: "findContactByIdentity", args: ["whatsapp", "919082210545"] });
        return contact;
      },
      async findLatestLeadForContact(contactId: string) {
        deps.calls.push({ fn: "findLatestLeadForContact", args: [contactId] });
        return existingLead;
      },
    });

    const result = await resolveEnquiry(
      {
        channel: "whatsapp",
        externalId: "919082210545",
        contactName: "Dev",
        firstMessageText: "Hello again",
        externalRef: "wamid.Y",
        now,
      },
      deps
    );

    expect(deps.calls.find((c) => c.fn === "createLeadForContact")).toBeFalsy();
    expect(deps.calls.find((c) => c.fn === "recordTouchpoint")).toBeFalsy();
    expect(deps.calls).toContainEqual({ fn: "touchLead", args: ["l-existing", now.toISOString()] });
    expect(result.lead.id).toBe("l-existing");
    expect(result.createdEnquiry).toBe(false);
    expect(result.reason).toBe("attached");
  });

  it("known contact whose enquiry is 31 days idle", async () => {
    const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 86400000).toISOString();
    const contact = { id: "c4", phone_e164: "+919082210545", display_name: "Idle", created_at: "", updated_at: "" } as unknown as Contact;
    const oldLead = { id: "l-old", closed_at: null, updated_at: thirtyOneDaysAgo } as unknown as Lead;

    const deps = makeDeps({
      async findContactByIdentity() {
        deps.calls.push({ fn: "findContactByIdentity", args: ["whatsapp", "919082210545"] });
        return contact;
      },
      async findLatestLeadForContact(contactId: string) {
        deps.calls.push({ fn: "findLatestLeadForContact", args: [contactId] });
        return oldLead;
      },
    });

    const result = await resolveEnquiry(
      {
        channel: "whatsapp",
        externalId: "919082210545",
        contactName: "Idle",
        firstMessageText: "Back again",
        externalRef: "wamid.Z",
        now,
      },
      deps
    );

    expect(deps.calls.find((c) => c.fn === "createLeadForContact")).toBeTruthy();
    expect(deps.calls.find((c) => c.fn === "recordTouchpoint")).toBeTruthy();
    expect(deps.calls.find((c) => c.fn === "touchLead")).toBeFalsy();
    expect(result.reason).toBe("idle");
    expect(result.createdEnquiry).toBe(true);
  });

  it("known contact whose latest enquiry has closed_at set", async () => {
    const oneDayAgo = new Date(now.getTime() - 1 * 86400000).toISOString();
    const contact = { id: "c5", phone_e164: "+919082210545", display_name: "Closed", created_at: "", updated_at: "" } as unknown as Contact;
    const closedLead = { id: "l-closed", closed_at: "2026-10-12T00:00:00.000Z", updated_at: oneDayAgo } as unknown as Lead;

    const deps = makeDeps({
      async findContactByIdentity() {
        deps.calls.push({ fn: "findContactByIdentity", args: ["whatsapp", "919082210545"] });
        return contact;
      },
      async findLatestLeadForContact(contactId: string) {
        deps.calls.push({ fn: "findLatestLeadForContact", args: [contactId] });
        return closedLead;
      },
    });

    const result = await resolveEnquiry(
      {
        channel: "whatsapp",
        externalId: "919082210545",
        contactName: "Closed",
        firstMessageText: "New enquiry",
        externalRef: "wamid.A",
        now,
      },
      deps
    );

    expect(result.reason).toBe("closed");
    expect(result.createdEnquiry).toBe(true);
  });

  it("unparseable externalId", async () => {
    const deps = makeDeps();
    await resolveEnquiry(
      {
        channel: "whatsapp",
        externalId: "abc",
        contactName: "Invalid",
        firstMessageText: "Test",
        externalRef: "wamid.B",
        now,
      },
      deps
    );

    expect(deps.calls).toContainEqual({ fn: "createContactWithoutPhone", args: ["Invalid"] });
    expect(deps.calls.find((c) => c.fn === "upsertContactByPhone")).toBeFalsy();
    expect(deps.calls).toContainEqual({ fn: "ensureIdentity", args: ["c2", "whatsapp", "abc"] });
  });

  it("identity missing but the phone already belongs to a contact", async () => {
    const existingContact = { id: "c9", phone_e164: "+919082210545", display_name: "Existing", created_at: "", updated_at: "" } as unknown as Contact;

    const deps = makeDeps({
      async upsertContactByPhone(phoneE164: string, displayName: string | null) {
        deps.calls.push({ fn: "upsertContactByPhone", args: [phoneE164, displayName] });
        return existingContact;
      },
    });

    await resolveEnquiry(
      {
        channel: "whatsapp",
        externalId: "919082210545",
        contactName: "New Name",
        firstMessageText: "Test",
        externalRef: "wamid.C",
        now,
      },
      deps
    );

    expect(deps.calls.find((c) => c.fn === "createContactWithoutPhone")).toBeFalsy();
    expect(deps.calls).toContainEqual({ fn: "ensureIdentity", args: ["c9", "whatsapp", "919082210545"] });
  });

  it("display name", async () => {
    const contactWithoutName = { id: "c7", phone_e164: "+919082210545", display_name: null, created_at: "", updated_at: "" } as unknown as Contact;
    const contactWithName = { id: "c8", phone_e164: "+919082210545", display_name: "Dev", created_at: "", updated_at: "" } as unknown as Contact;

    const deps1 = makeDeps({
      async findContactByIdentity() {
        deps1.calls.push({ fn: "findContactByIdentity", args: ["whatsapp", "919082210545"] });
        return contactWithoutName;
      },
    });

    await resolveEnquiry(
      {
        channel: "whatsapp",
        externalId: "919082210545",
        contactName: "Asha",
        firstMessageText: "Test",
        externalRef: "wamid.D",
        now,
      },
      deps1
    );

    expect(deps1.calls).toContainEqual({ fn: "setDisplayNameIfMissing", args: ["c7", "Asha"] });

    const deps2 = makeDeps({
      async findContactByIdentity() {
        deps2.calls.push({ fn: "findContactByIdentity", args: ["whatsapp", "919082210545"] });
        return contactWithName;
      },
    });

    await resolveEnquiry(
      {
        channel: "whatsapp",
        externalId: "919082210545",
        contactName: "Asha",
        firstMessageText: "Test",
        externalRef: "wamid.E",
        now,
      },
      deps2
    );

    expect(deps2.calls.find((c) => c.fn === "setDisplayNameIfMissing")).toBeFalsy();
  });

  it("forceAttachToLatest with closed enquiry", async () => {
    const oneDayAgo = new Date(now.getTime() - 1 * 86400000).toISOString();
    const contact = { id: "c10", phone_e164: "+919082210545", display_name: "Test", created_at: "", updated_at: "" } as unknown as Contact;
    const closedLead = { id: "l-closed", closed_at: "2026-10-12T00:00:00.000Z", updated_at: oneDayAgo } as unknown as Lead;

    const deps = makeDeps({
      async findContactByIdentity() {
        deps.calls.push({ fn: "findContactByIdentity", args: ["whatsapp", "919082210545"] });
        return contact;
      },
      async findLatestLeadForContact(contactId: string) {
        deps.calls.push({ fn: "findLatestLeadForContact", args: [contactId] });
        return closedLead;
      },
    });

    const result = await resolveEnquiry(
      {
        channel: "whatsapp",
        externalId: "919082210545",
        contactName: "Test",
        firstMessageText: "Not now",
        externalRef: "wamid.F",
        now,
        forceAttachToLatest: true,
      },
      deps
    );

    expect(deps.calls).toContainEqual({ fn: "touchLead", args: ["l-closed", now.toISOString()] });
    expect(deps.calls.find((c) => c.fn === "createLeadForContact")).toBeFalsy();
    expect(result.createdEnquiry).toBe(false);
    expect(result.reason).toBe("attached");
  });

  it("forceAttachToLatest with idle enquiry", async () => {
    const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 86400000).toISOString();
    const contact = { id: "c11", phone_e164: "+919082210545", display_name: "Test2", created_at: "", updated_at: "" } as unknown as Contact;
    const oldLead = { id: "l-old", closed_at: null, updated_at: thirtyOneDaysAgo } as unknown as Lead;

    const deps = makeDeps({
      async findContactByIdentity() {
        deps.calls.push({ fn: "findContactByIdentity", args: ["whatsapp", "919082210545"] });
        return contact;
      },
      async findLatestLeadForContact(contactId: string) {
        deps.calls.push({ fn: "findLatestLeadForContact", args: [contactId] });
        return oldLead;
      },
    });

    const result = await resolveEnquiry(
      {
        channel: "whatsapp",
        externalId: "919082210545",
        contactName: "Test2",
        firstMessageText: "Not now",
        externalRef: "wamid.G",
        now,
        forceAttachToLatest: true,
      },
      deps
    );

    expect(deps.calls).toContainEqual({ fn: "touchLead", args: ["l-old", now.toISOString()] });
    expect(deps.calls.find((c) => c.fn === "createLeadForContact")).toBeFalsy();
    expect(result.createdEnquiry).toBe(false);
    expect(result.reason).toBe("attached");
  });

  it("forceAttachToLatest with no existing enquiry", async () => {
    const contact = { id: "c12", phone_e164: "+919082210545", display_name: "Test3", created_at: "", updated_at: "" } as unknown as Contact;

    const deps = makeDeps({
      async findContactByIdentity() {
        deps.calls.push({ fn: "findContactByIdentity", args: ["whatsapp", "919082210545"] });
        return contact;
      },
      async findLatestLeadForContact(contactId: string) {
        deps.calls.push({ fn: "findLatestLeadForContact", args: [contactId] });
        return undefined;
      },
    });

    const result = await resolveEnquiry(
      {
        channel: "whatsapp",
        externalId: "919082210545",
        contactName: "Test3",
        firstMessageText: "Not now",
        externalRef: "wamid.H",
        now,
        forceAttachToLatest: true,
      },
      deps
    );

    expect(deps.calls.find((c) => c.fn === "touchLead")).toBeFalsy();
    expect(deps.calls.find((c) => c.fn === "createLeadForContact")).toBeTruthy();
    expect(result.createdEnquiry).toBe(true);
    expect(result.reason).toBe("no_enquiry");
  });

  it("Instagram identity without phone creates phoneless contact and enquiry", async () => {
    const deps = makeDeps();
    const result = await resolveEnquiry(
      {
        channel: "instagram",
        externalId: "17841400000000001",
        contactName: "InstagramUser",
        firstMessageText: "Hi from Instagram",
        externalRef: "m_ig_12345",
        now,
      },
      deps
    );

    expect(deps.calls).toContainEqual({ fn: "createContactWithoutPhone", args: ["InstagramUser"] });
    expect(deps.calls).toContainEqual({ fn: "ensureIdentity", args: ["c2", "instagram", "17841400000000001"] });
    expect(deps.calls.find((c) => c.fn === "upsertContactByPhone")).toBeFalsy();
    const createLeadCall = deps.calls.find((c) => c.fn === "createLeadForContact");
    expect(createLeadCall?.args[0]).toMatchObject({
      contactId: "c2",
      source: "instagram",
      rawEnquiryText: "Hi from Instagram",
      whatsappNumber: "17841400000000001",
    });
    expect(result.createdEnquiry).toBe(true);
  });

  it("known Instagram identity attaches to open enquiry", async () => {
    const contact = { id: "c5", phone_e164: null, display_name: "IGUser", created_at: "", updated_at: "" } as unknown as Contact;
    const existingLead = { id: "l-ig", closed_at: null, updated_at: new Date(now.getTime() - 86400000).toISOString() } as unknown as Lead;

    const deps = makeDeps({
      async findContactByIdentity(channel: string, externalId: string) {
        deps.calls.push({ fn: "findContactByIdentity", args: [channel, externalId] });
        return contact;
      },
      async findLatestLeadForContact(contactId: string) {
        deps.calls.push({ fn: "findLatestLeadForContact", args: [contactId] });
        return existingLead;
      },
    });

    const result = await resolveEnquiry(
      {
        channel: "instagram",
        externalId: "17841400000000001",
        contactName: null,
        firstMessageText: "Another message",
        externalRef: "m_ig_67890",
        now,
      },
      deps
    );

    expect(deps.calls.find((c) => c.fn === "createContactWithoutPhone")).toBeFalsy();
    expect(deps.calls.find((c) => c.fn === "createLeadForContact")).toBeFalsy();
    expect(deps.calls).toContainEqual({ fn: "touchLead", args: ["l-ig", now.toISOString()] });
    expect(result.lead.id).toBe("l-ig");
    expect(result.createdEnquiry).toBe(false);
  });
});

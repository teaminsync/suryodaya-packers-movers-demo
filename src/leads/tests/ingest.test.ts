/**
 * Tests for inquiry ingestion
 */

import { describe, it, expect } from "@jest/globals";
import { ingestInquiry, type IngestDeps } from "../ingest.js";
import type { Contact, Lead } from "../types.js";
import type { InquiryEvent } from "../../intake/types.js";

interface CallRecord {
  fn: string;
  args: any[];
}

function makeDeps(overrides: Partial<IngestDeps> = {}): IngestDeps & { calls: CallRecord[] } {
  const calls: CallRecord[] = [];

  const defaults: IngestDeps = {
    async touchpointExists(source: string, externalRef: string): Promise<boolean> {
      calls.push({ fn: "touchpointExists", args: [source, externalRef] });
      return false;
    },
    async findContactByIdentity(channel: string, externalId: string): Promise<Contact | undefined> {
      calls.push({ fn: "findContactByIdentity", args: [channel, externalId] });
      return undefined;
    },
    async upsertContactByPhone(phoneE164: string, displayName: string | null): Promise<Contact> {
      calls.push({ fn: "upsertContactByPhone", args: [phoneE164, displayName] });
      return { id: "c1", phone_e164: phoneE164, display_name: displayName, created_at: "", updated_at: "" } as Contact;
    },
    async createContactWithoutPhone(displayName: string | null): Promise<Contact> {
      calls.push({ fn: "createContactWithoutPhone", args: [displayName] });
      return { id: "c2", phone_e164: null, display_name: displayName, created_at: "", updated_at: "" } as Contact;
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
      return { id: "l-new", whatsapp_number: params.whatsappNumber, contact_id: params.contactId, status: "new" } as Lead;
    },
    async recordTouchpoint(params: any): Promise<boolean> {
      calls.push({ fn: "recordTouchpoint", args: [params] });
      return true;
    },
    async recordInboundMessage(params: any): Promise<void> {
      calls.push({ fn: "recordInboundMessage", args: [params] });
    },
  };

  return { ...defaults, ...overrides, calls };
}

function makeEvent(overrides: Partial<InquiryEvent> = {}): InquiryEvent {
  return {
    source: "indiamart",
    externalRef: "621654886",
    receivedAt: new Date("2026-10-14T11:00:00.000Z"),
    contactName: "Prabhat",
    phoneRaw: "+91-9999999999",
    email: null,
    text: "Need a 2BHK moved",
    rawPayload: "{}",
    queryType: "B",
    ...overrides,
  };
}

const now = new Date("2026-10-14T12:00:00.000Z");

describe("ingestInquiry", () => {
  it("creates new lead for new phone contact", async () => {
    const deps = makeDeps();
    const event = makeEvent();

    const result = await ingestInquiry(event, now, deps);

    expect(result.duplicate).toBe(false);
    expect(result.createdEnquiry).toBe(true);
    expect(result.reason).toBe("no_enquiry");

    const upsertCall = deps.calls.find((c) => c.fn === "upsertContactByPhone");
    expect(upsertCall).toBeDefined();
    expect(upsertCall!.args).toEqual(["+919999999999", "Prabhat"]);

    const createLeadCall = deps.calls.find((c) => c.fn === "createLeadForContact");
    expect(createLeadCall).toBeDefined();
    expect(createLeadCall!.args[0]).toMatchObject({
      whatsappNumber: "919999999999",
      source: "indiamart",
      rawEnquiryText: "Need a 2BHK moved",
      contactId: "c1",
    });

    const touchpointCall = deps.calls.find((c) => c.fn === "recordTouchpoint");
    expect(touchpointCall).toBeDefined();
    expect(touchpointCall!.args[0]).toMatchObject({
      externalRef: "621654886",
      source: "indiamart",
      rawPayload: "{}",
      receivedAt: event.receivedAt.toISOString(),
    });

    const messageCall = deps.calls.find((c) => c.fn === "recordInboundMessage");
    expect(messageCall).toBeDefined();
    expect(messageCall!.args[0]).toMatchObject({
      channel: "indiamart",
      body: "Need a 2BHK moved",
    });

    const touchLeadCall = deps.calls.find((c) => c.fn === "touchLead");
    expect(touchLeadCall).toBeUndefined();
  });

  it("attaches to existing recent enquiry", async () => {
    const existingLead = {
      id: "l-existing",
      whatsapp_number: "919999999999",
      contact_id: "c1",
      status: "gathering" as const,
      updated_at: new Date(now.getTime() - 2 * 86400000).toISOString(),
      closed_at: null,
    } as Lead;

    const deps = makeDeps({
      async findLatestLeadForContact() {
        deps.calls.push({ fn: "findLatestLeadForContact", args: ["c1"] });
        return existingLead;
      },
    });

    const event = makeEvent();
    const result = await ingestInquiry(event, now, deps);

    expect(result.duplicate).toBe(false);
    expect(result.createdEnquiry).toBe(false);
    expect(result.reason).toBe("attached");

    const touchLeadCall = deps.calls.find((c) => c.fn === "touchLead");
    expect(touchLeadCall).toBeDefined();
    expect(touchLeadCall!.args).toEqual([existingLead.id, now.toISOString()]);

    const createLeadCall = deps.calls.find((c) => c.fn === "createLeadForContact");
    expect(createLeadCall).toBeUndefined();

    const touchpointCall = deps.calls.find((c) => c.fn === "recordTouchpoint");
    expect(touchpointCall).toBeDefined();
    expect(touchpointCall!.args[0].leadId).toBe(existingLead.id);

    const messageCall = deps.calls.find((c) => c.fn === "recordInboundMessage");
    expect(messageCall).toBeDefined();
  });

  it("creates new enquiry for idle enquiry", async () => {
    const existingLead = {
      id: "l-old",
      whatsapp_number: "919999999999",
      contact_id: "c1",
      status: "gathering" as const,
      updated_at: new Date(now.getTime() - 31 * 86400000).toISOString(),
      closed_at: null,
    } as Lead;

    const deps = makeDeps({
      async findLatestLeadForContact() {
        deps.calls.push({ fn: "findLatestLeadForContact", args: ["c1"] });
        return existingLead;
      },
    });

    const event = makeEvent();
    const result = await ingestInquiry(event, now, deps);

    expect(result.duplicate).toBe(false);
    expect(result.createdEnquiry).toBe(true);
    expect(result.reason).toBe("idle");

    const createLeadCall = deps.calls.find((c) => c.fn === "createLeadForContact");
    expect(createLeadCall).toBeDefined();
  });

  it("returns duplicate immediately if touchpoint exists", async () => {
    const deps = makeDeps({
      async touchpointExists() {
        deps.calls.push({ fn: "touchpointExists", args: ["indiamart", "621654886"] });
        return true;
      },
    });

    const event = makeEvent();
    const result = await ingestInquiry(event, now, deps);

    expect(result.duplicate).toBe(true);
    expect(result.reason).toBe("duplicate");
    expect(deps.calls.length).toBe(1);
    expect(deps.calls[0].fn).toBe("touchpointExists");
  });

  it("handles email-only contact", async () => {
    const deps = makeDeps();
    const event = makeEvent({
      phoneRaw: null,
      email: "a@b.com",
    });

    const result = await ingestInquiry(event, now, deps);

    expect(result.duplicate).toBe(false);

    const identityCall = deps.calls.find((c) => c.fn === "findContactByIdentity");
    expect(identityCall).toBeDefined();
    expect(identityCall!.args).toEqual(["email", "a@b.com"]);

    const createContactCall = deps.calls.find((c) => c.fn === "createContactWithoutPhone");
    expect(createContactCall).toBeDefined();
    expect(createContactCall!.args).toEqual(["Prabhat"]);

    const ensureCall = deps.calls.find((c) => c.fn === "ensureIdentity");
    expect(ensureCall).toBeDefined();
    expect(ensureCall!.args).toEqual(["c2", "email", "a@b.com"]);

    const upsertCall = deps.calls.find((c) => c.fn === "upsertContactByPhone");
    expect(upsertCall).toBeUndefined();

    const createLeadCall = deps.calls.find((c) => c.fn === "createLeadForContact");
    expect(createLeadCall).toBeDefined();
    expect(createLeadCall!.args[0].whatsappNumber).toBe("");
  });

  it("handles phone and email together", async () => {
    const deps = makeDeps();
    const event = makeEvent({
      email: "test@example.com",
    });

    const result = await ingestInquiry(event, now, deps);

    expect(result.duplicate).toBe(false);

    const upsertCall = deps.calls.find((c) => c.fn === "upsertContactByPhone");
    expect(upsertCall).toBeDefined();

    const ensureCall = deps.calls.find((c) => c.fn === "ensureIdentity");
    expect(ensureCall).toBeDefined();
    expect(ensureCall!.args[0]).toBe("c1");
    expect(ensureCall!.args[1]).toBe("email");
    expect(ensureCall!.args[2]).toBe("test@example.com");

    const createContactCall = deps.calls.find((c) => c.fn === "createContactWithoutPhone");
    expect(createContactCall).toBeUndefined();
  });

  it("returns duplicate when recordTouchpoint returns false", async () => {
    const deps = makeDeps({
      async recordTouchpoint(params: any) {
        deps.calls.push({ fn: "recordTouchpoint", args: [params] });
        return false;
      },
    });

    const event = makeEvent();
    const result = await ingestInquiry(event, now, deps);

    expect(result.duplicate).toBe(true);
    expect(result.reason).toBe("duplicate");

    const messageCall = deps.calls.find((c) => c.fn === "recordInboundMessage");
    expect(messageCall).toBeUndefined();
  });

  it("handles invalid phone with no email", async () => {
    const deps = makeDeps();
    const event = makeEvent({
      phoneRaw: "abc",
      email: null,
    });

    const result = await ingestInquiry(event, now, deps);

    expect(result.duplicate).toBe(false);

    const createContactCall = deps.calls.find((c) => c.fn === "createContactWithoutPhone");
    expect(createContactCall).toBeDefined();

    const ensureCall = deps.calls.find((c) => c.fn === "ensureIdentity");
    expect(ensureCall).toBeUndefined();

    const createLeadCall = deps.calls.find((c) => c.fn === "createLeadForContact");
    expect(createLeadCall).toBeDefined();
    expect(createLeadCall!.args[0].whatsappNumber).toBe("");
  });
});

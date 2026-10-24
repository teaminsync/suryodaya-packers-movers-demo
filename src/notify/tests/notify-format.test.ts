/**
 * Tests for admin notification formatting
 */

import { eventLabel, sourceLabel, buildEmail, buildTemplateParams } from "../format.js";
import type { AdminEvent } from "../types.js";

describe("notify format", () => {
  it("eventLabel returns correct labels", () => {
    expect(eventLabel("booking_confirmed")).toBe("Survey booked");
    expect(eventLabel("human_requested")).toBe("Customer wants a human");
    expect(eventLabel("needs_followup")).toBe("Needs team follow-up");
  });

  it("sourceLabel handles all cases", () => {
    expect(sourceLabel("whatsapp")).toBe("WhatsApp");
    expect(sourceLabel("instagram")).toBe("Instagram");
    expect(sourceLabel("indiamart")).toBe("IndiaMART");
    expect(sourceLabel(null)).toBe("Unknown");
    expect(sourceLabel("")).toBe("Unknown");
    expect(sourceLabel("facebook")).toBe("Facebook");
  });

  it("buildEmail creates correct subject and text for booking event", () => {
    const event: AdminEvent = {
      type: "booking_confirmed",
      leadId: "L1",
      source: "whatsapp",
      customerName: "Rahul Verma",
      phone: "+919876543210",
      moveType: "residential",
      origin: "Pune",
      destination: "Mumbai",
      estimatedVolume: "3bhk",
      urgency: "high",
      specialItems: ["piano"],
      lastMessage: "Yes book it",
      slotLabel: "Tue, 20 Oct at 10:00 AM",
    };

    const { subject, text } = buildEmail(event, "http://localhost:3001/");

    expect(subject).toBe("[Suryodaya] Survey booked - Rahul Verma (WhatsApp)");
    expect(text).toContain("Survey booked");
    expect(text).toContain("Customer: Rahul Verma (WhatsApp)");
    expect(text).toContain("Phone: +919876543210");
    expect(text).toContain("Move: residential, Pune to Mumbai");
    expect(text).toContain("Size: 3bhk | Urgency: high");
    expect(text).toContain("Special items: piano");
    expect(text).toContain("Survey slot: Tue, 20 Oct at 10:00 AM");
    expect(text).toContain('Last message: "Yes book it"');
    expect(text).toContain("Open in dashboard: http://localhost:3001/leads/L1");
  });

  it("buildEmail omits optional lines when not present", () => {
    const event: AdminEvent = {
      type: "human_requested",
      leadId: "L2",
      source: "instagram",
      customerName: "Jane Doe",
      phone: null,
      moveType: null,
      origin: null,
      destination: null,
      estimatedVolume: null,
      urgency: null,
      specialItems: [],
      lastMessage: null,
      slotLabel: null,
    };

    const { text } = buildEmail(event, null);

    expect(text).not.toContain("Phone:");
    expect(text).not.toContain("Survey slot:");
    expect(text).not.toContain("Last message:");
    expect(text).not.toContain("Open in dashboard:");
    expect(text).toContain("Move: -, ? to ?");
    expect(text).toContain("Special items: none noted");
  });

  it("buildTemplateParams creates correct params", () => {
    const event: AdminEvent = {
      type: "needs_followup",
      leadId: "L3",
      source: "whatsapp",
      customerName: "Test User",
      phone: "+911234567890",
      moveType: "residential",
      origin: "Delhi",
      destination: "Bangalore",
      estimatedVolume: "2bhk",
      urgency: "medium",
      specialItems: [],
      lastMessage: "I need to check with my family first before deciding on the date",
      slotLabel: null,
    };

    const params = buildTemplateParams(event);

    expect(params).toHaveLength(3);
    expect(params[0]).toBe("Needs team follow-up");
    expect(params[1]).toBe("Test User (WhatsApp)");
    expect(params[2]).toContain("Delhi to Bangalore");
    expect(params[2]).toContain("2bhk");
    expect(params[2]).toContain('"I need to check with my family first before deciding');
  });

  it("buildTemplateParams enforces 150 character limit", () => {
    const longMessage = "a".repeat(200);
    const event: AdminEvent = {
      type: "human_requested",
      leadId: "L4",
      source: "instagram",
      customerName: "b".repeat(180),
      phone: null,
      moveType: null,
      origin: null,
      destination: null,
      estimatedVolume: null,
      urgency: null,
      specialItems: [],
      lastMessage: longMessage,
      slotLabel: null,
    };

    const params = buildTemplateParams(event);

    expect(params[0].length).toBeLessThanOrEqual(150);
    expect(params[1].length).toBeLessThanOrEqual(150);
    expect(params[2].length).toBeLessThanOrEqual(150);
  });

  it("buildTemplateParams uses see dashboard when no details", () => {
    const event: AdminEvent = {
      type: "human_requested",
      leadId: "L5",
      source: "whatsapp",
      customerName: "User",
      phone: null,
      moveType: null,
      origin: null,
      destination: null,
      estimatedVolume: null,
      urgency: null,
      specialItems: [],
      lastMessage: null,
      slotLabel: null,
    };

    const params = buildTemplateParams(event);

    expect(params[2]).toBe("see dashboard");
  });
});

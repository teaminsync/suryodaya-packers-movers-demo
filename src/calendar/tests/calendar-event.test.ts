import { describe, it, expect } from "@jest/globals";
import { buildSurveyEventContent } from "../event-content.js";

describe("Calendar event content", () => {
  it("builds full content with all fields", () => {
    const base = {
      customerName: "Rahul Verma",
      source: "whatsapp",
      phone: "+919876543210",
      moveType: "residential",
      origin: "Pune",
      destination: "Mumbai",
      estimatedVolume: "3bhk",
      urgency: "high",
      specialItems: ["piano"],
      leadId: "L1",
    };

    const result = buildSurveyEventContent(base, "http://localhost:3001/");

    expect(result.summary).toBe("Survey: Rahul Verma (WhatsApp)");
    expect(result.description).toBe(
      "Booked by the AI assistant\n" +
      "Phone: +919876543210\n" +
      "Move: residential, Pune to Mumbai\n" +
      "Size: 3bhk | Urgency: high\n" +
      "Special items: piano\n" +
      "Dashboard: http://localhost:3001/leads/L1"
    );
    expect(result.location).toBe("Pune");
  });

  it("builds minimal content with missing fields", () => {
    const base = {
      customerName: null,
      source: null,
      phone: null,
      moveType: null,
      origin: null,
      destination: null,
      estimatedVolume: null,
      urgency: null,
      specialItems: [],
      leadId: "L2",
    };

    const result = buildSurveyEventContent(base, null);

    expect(result.summary).toBe("Survey: Customer (Unknown)");
    expect(result.description).toBe(
      "Booked by the AI assistant\n" +
      "Move: -, ? to ?\n" +
      "Size: - | Urgency: -\n" +
      "Special items: none noted"
    );
    expect(result.location).toBeNull();
  });
});

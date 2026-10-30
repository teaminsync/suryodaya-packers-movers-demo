/**
 * Tests for automation message builders
 */

import { describe, it, expect } from "@jest/globals";
import {
  buildNudgeText,
  buildMissingDetailsText,
  buildReminderText,
  buildMorningText,
  buildReminderTemplate,
  buildNudgeTemplate,
  buildMissingDetailsTemplate,
  joinList,
  isAffirmativeReply,
  TEMPLATE_SURVEY_REMINDER,
  TEMPLATE_ENQUIRY_NUDGE,
  TEMPLATE_MISSING_DETAILS,
  PAYLOAD_NUDGE_SHOW_TIMES,
  PAYLOAD_NUDGE_NOT_NOW,
  PAYLOAD_NUDGE_STOP,
  PAYLOAD_REMINDER_CONFIRM,
  PAYLOAD_REMINDER_CHANGE,
  PAYLOAD_MISSING_TALK_HUMAN,
} from "../messages.js";

describe("buildNudgeText", () => {
  it("builds text with route", () => {
    const text = buildNudgeText({ contactName: "Devansh", origin: "Pune", destination: "Mumbai" });
    expect(text).toContain("Devansh");
    expect(text).toContain("Pune to Mumbai move enquiry");
    expect(text).toContain("Suryodaya Packers & Movers");
  });

  it("builds text without route", () => {
    const text = buildNudgeText({ contactName: "Devansh", origin: null, destination: "Mumbai" });
    expect(text).toContain("Devansh");
    expect(text).toContain("moving enquiry");
  });

  it("uses 'there' when no name", () => {
    const text = buildNudgeText({ contactName: null, origin: "Pune", destination: "Mumbai" });
    expect(text).toContain("Hi there");
  });
});

describe("buildMissingDetailsText", () => {
  it("builds text with single label", () => {
    const text = buildMissingDetailsText({ contactName: "Asha", labels: ["pickup city"] });
    expect(text).toContain("Asha");
    expect(text).toContain("pickup city");
  });

  it("builds text with multiple labels", () => {
    const text = buildMissingDetailsText({ contactName: "Asha", labels: ["pickup city", "home size", "move timing"] });
    expect(text).toContain("pickup city, home size and move timing");
  });
});

describe("joinList", () => {
  it("joins single item", () => {
    expect(joinList(["a"])).toBe("a");
  });

  it("joins two items", () => {
    expect(joinList(["a", "b"])).toBe("a and b");
  });

  it("joins three items", () => {
    expect(joinList(["a", "b", "c"])).toBe("a, b and c");
  });
});

describe("buildReminderText", () => {
  it("builds reminder with formatted slot", () => {
    const startsAt = new Date("2024-01-21T10:00:00+05:30");
    const text = buildReminderText({ contactName: "Devansh", startsAt });
    expect(text).toContain("Devansh");
    expect(text).toContain("free on-site survey");
    expect(text).toContain("itemised quote");
  });
});

describe("buildMorningText", () => {
  it("builds morning text with time", () => {
    const startsAt = new Date("2024-01-21T10:00:00+05:30");
    const text = buildMorningText({ contactName: "Devansh", startsAt });
    expect(text).toContain("Good morning Devansh");
    expect(text).toContain("10:00 AM");
  });
});

describe("buildReminderTemplate", () => {
  it("builds template with correct structure", () => {
    const startsAt = new Date("2024-01-21T10:00:00+05:30");
    const tmpl = buildReminderTemplate({ contactName: "Devansh", startsAt });
    expect(tmpl.templateName).toBe(TEMPLATE_SURVEY_REMINDER);
    expect(tmpl.languageCode).toBe("en");
    expect(tmpl.bodyParams.length).toBe(2);
    expect(tmpl.buttonPayloads).toEqual([PAYLOAD_REMINDER_CONFIRM, PAYLOAD_REMINDER_CHANGE]);
    expect(tmpl.renderedText).toContain("Devansh");
  });
});

describe("buildNudgeTemplate", () => {
  it("builds template with route", () => {
    const tmpl = buildNudgeTemplate({ contactName: "Devansh", origin: "Pune", destination: "Mumbai" });
    expect(tmpl.templateName).toBe(TEMPLATE_ENQUIRY_NUDGE);
    expect(tmpl.bodyParams.length).toBe(2);
    expect(tmpl.bodyParams[1]).toContain("Pune to Mumbai");
    expect(tmpl.buttonPayloads).toEqual([PAYLOAD_NUDGE_SHOW_TIMES, PAYLOAD_NUDGE_NOT_NOW, PAYLOAD_NUDGE_STOP]);
  });

  it("uses 'recent' when no route", () => {
    const tmpl = buildNudgeTemplate({ contactName: "Devansh", origin: null, destination: null });
    expect(tmpl.bodyParams[1]).toBe("recent");
  });
});

describe("buildMissingDetailsTemplate", () => {
  it("builds template with labels", () => {
    const tmpl = buildMissingDetailsTemplate({ contactName: "Asha", labels: ["pickup city", "home size"] });
    expect(tmpl.templateName).toBe(TEMPLATE_MISSING_DETAILS);
    expect(tmpl.bodyParams.length).toBe(2);
    expect(tmpl.bodyParams[1]).toContain("pickup city and home size");
    expect(tmpl.buttonPayloads).toEqual([PAYLOAD_MISSING_TALK_HUMAN]);
  });
});

describe("no prices in output", () => {
  it("nudge text contains no currency or price", () => {
    const text = buildNudgeText({ contactName: "Test", origin: "Pune", destination: "Mumbai" });
    expect(text).not.toMatch(/₹|Rs|rupees|rupee|INR|\d{2,}/);
  });

  it("reminder text contains no currency or price", () => {
    const text = buildReminderText({ contactName: "Test", startsAt: new Date("2024-01-21T10:00:00+05:30") });
    expect(text).not.toMatch(/₹|Rs|rupees|rupee|INR/);
  });

  it("reminder template contains no currency or price", () => {
    const tmpl = buildReminderTemplate({ contactName: "Test", startsAt: new Date("2024-01-21T10:00:00+05:30") });
    expect(tmpl.renderedText).not.toMatch(/₹|Rs|rupees|rupee|INR/);
  });
});

describe("isAffirmativeReply", () => {
  it("matches yes", () => {
    expect(isAffirmativeReply("yes")).toBe(true);
    expect(isAffirmativeReply("YES")).toBe(true);
    expect(isAffirmativeReply(" yes ")).toBe(true);
  });

  it("matches yes please", () => {
    expect(isAffirmativeReply("Yes please!")).toBe(true);
    expect(isAffirmativeReply("yes pls")).toBe(true);
  });

  it("matches ok variants", () => {
    expect(isAffirmativeReply("ok")).toBe(true);
    expect(isAffirmativeReply("okay")).toBe(true);
    expect(isAffirmativeReply("OK please")).toBe(true);
  });

  it("matches show times", () => {
    expect(isAffirmativeReply("send times")).toBe(true);
    expect(isAffirmativeReply("show times")).toBe(true);
    expect(isAffirmativeReply("SHOW ME TIMES")).toBe(true);
    expect(isAffirmativeReply("times")).toBe(true);
    expect(isAffirmativeReply("send them")).toBe(true);
  });

  it("matches sure", () => {
    expect(isAffirmativeReply("sure")).toBe(true);
    expect(isAffirmativeReply("sure please")).toBe(true);
  });

  it("rejects 'yes i need packing'", () => {
    expect(isAffirmativeReply("yes i need packing")).toBe(false);
  });

  it("rejects 'no'", () => {
    expect(isAffirmativeReply("no")).toBe(false);
  });

  it("rejects 'yes but later'", () => {
    expect(isAffirmativeReply("yes but later")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isAffirmativeReply("")).toBe(false);
  });

  it("rejects long strings", () => {
    expect(isAffirmativeReply("a".repeat(40))).toBe(false);
  });

  it("rejects 'stop'", () => {
    expect(isAffirmativeReply("stop")).toBe(false);
  });
});

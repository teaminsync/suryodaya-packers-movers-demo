/**
 * Tests for message templates and intent detection
 */

import {
  classifyInboundIntent,
  firstName,
  sanitizeTemplateValue,
  buildFollowupTemplateParams,
  buildClickToChatLink,
} from "../messages.js";

describe("classifyInboundIntent", () => {
  it("detects button payloads", () => {
    expect(
      classifyInboundIntent({
        type: "button",
        buttonPayload: "enquiry_yes",
      }).kind
    ).toBe("followup_yes");

    expect(
      classifyInboundIntent({
        type: "button",
        buttonPayload: "enquiry_not_now",
      }).kind
    ).toBe("followup_not_now");
  });

  it("detects button text when no payload", () => {
    expect(
      classifyInboundIntent({
        type: "button",
        buttonText: "Yes, continue",
      }).kind
    ).toBe("followup_yes");

    expect(
      classifyInboundIntent({
        type: "button",
        buttonText: " NOT NOW ",
      }).kind
    ).toBe("followup_not_now");
  });

  it("returns none for unrecognized buttons", () => {
    expect(
      classifyInboundIntent({
        type: "button",
        buttonPayload: "something_else",
      }).kind
    ).toBe("none");

    expect(
      classifyInboundIntent({
        type: "button",
        buttonText: "Maybe",
      }).kind
    ).toBe("none");
  });

  it("detects opt-out phrases", () => {
    expect(classifyInboundIntent({ type: "text", text: "STOP" }).kind).toBe("opt_out");
    expect(classifyInboundIntent({ type: "text", text: " stop " }).kind).toBe("opt_out");
    expect(classifyInboundIntent({ type: "text", text: "Stop." }).kind).toBe("opt_out");
    expect(classifyInboundIntent({ type: "text", text: "unsubscribe" }).kind).toBe("opt_out");
    expect(classifyInboundIntent({ type: "text", text: "Opt out" }).kind).toBe("opt_out");
    expect(classifyInboundIntent({ type: "text", text: "stop all" }).kind).toBe("opt_out");
  });

  it("returns none for text that is not opt-out", () => {
    expect(classifyInboundIntent({ type: "text", text: "stop by tomorrow" }).kind).toBe("none");
    expect(classifyInboundIntent({ type: "text", text: "please dont stop" }).kind).toBe("none");
    expect(classifyInboundIntent({ type: "text", text: "" }).kind).toBe("none");
    expect(classifyInboundIntent({ type: "text", text: null }).kind).toBe("none");
    expect(classifyInboundIntent({ type: "image", text: "stop" }).kind).toBe("none");
  });

  it("extracts first name", () => {
    expect(firstName("Devansh Sawant")).toBe("Devansh");
    expect(firstName("  asha  ")).toBe("asha");
    expect(firstName(null)).toBe(null);
    expect(firstName("")).toBe(null);
    expect(firstName("   ")).toBe(null);
  });

  it("sanitizes template values", () => {
    expect(sanitizeTemplateValue("Pune\nto   Mumbai\t")).toBe("Pune to Mumbai");

    const long = "a".repeat(100);
    const result = sanitizeTemplateValue(long);
    expect(result.length).toBeLessThanOrEqual(60);

    expect(sanitizeTemplateValue("abc", 2)).toBe("ab");
  });

  it("builds followup template parameters", () => {
    const result1 = buildFollowupTemplateParams({
      contactName: "Devansh Sawant",
      origin: "Pune",
      destination: "Mumbai",
    });
    expect(result1).toEqual(["Devansh", "Pune to Mumbai"]);

    const result2 = buildFollowupTemplateParams({
      contactName: "Devansh Sawant",
      origin: "Pune",
      destination: null,
    });
    expect(result2).toEqual(["Devansh", "details to confirm"]);

    const result3 = buildFollowupTemplateParams({
      contactName: null,
      origin: "Pune",
      destination: "Mumbai",
    });
    expect(result3).toEqual(["there", "Pune to Mumbai"]);
  });

  it("builds click to chat link", () => {
    const result = buildClickToChatLink({
      businessNumber: "+1 (555) 204-8854",
      leadId: "0f0033a4-7a10-44f5-be4a-4946a049e18c",
    });

    const expected =
      "https://wa.me/15552048854?text=" +
      encodeURIComponent("Hi, I enquired about my move (ref 0f0033a4)");

    expect(result).toBe(expected);
  });

  // New automation payload mappings
  it("maps nudge_show_times payload to show_times", () => {
    expect(
      classifyInboundIntent({
        type: "button",
        buttonPayload: "nudge_show_times",
      }).kind
    ).toBe("show_times");
  });

  it("maps nudge_not_now payload to followup_not_now", () => {
    expect(
      classifyInboundIntent({
        type: "button",
        buttonPayload: "nudge_not_now",
      }).kind
    ).toBe("followup_not_now");
  });

  it("maps nudge_stop payload to opt_out", () => {
    expect(
      classifyInboundIntent({
        type: "button",
        buttonPayload: "nudge_stop",
      }).kind
    ).toBe("opt_out");
  });

  it("maps reminder_confirm payload", () => {
    expect(
      classifyInboundIntent({
        type: "button",
        buttonPayload: "reminder_confirm",
      }).kind
    ).toBe("reminder_confirm");
  });

  it("maps reminder_change payload", () => {
    expect(
      classifyInboundIntent({
        type: "button",
        buttonPayload: "reminder_change",
      }).kind
    ).toBe("reminder_change");
  });

  it("maps missing_talk_human payload", () => {
    expect(
      classifyInboundIntent({
        type: "button",
        buttonPayload: "missing_talk_human",
      }).kind
    ).toBe("talk_human");
  });

  it("maps show me times button text", () => {
    expect(
      classifyInboundIntent({
        type: "button",
        buttonText: "Show me times",
      }).kind
    ).toBe("show_times");
  });

  it("maps stop messages button text", () => {
    expect(
      classifyInboundIntent({
        type: "button",
        buttonText: "Stop messages",
      }).kind
    ).toBe("opt_out");
  });

  it("maps confirm time button text", () => {
    expect(
      classifyInboundIntent({
        type: "button",
        buttonText: "Confirm time",
      }).kind
    ).toBe("reminder_confirm");
  });

  it("maps change time button text", () => {
    expect(
      classifyInboundIntent({
        type: "button",
        buttonText: "Change time",
      }).kind
    ).toBe("reminder_change");
  });

  it("maps talk to a human button text", () => {
    expect(
      classifyInboundIntent({
        type: "button",
        buttonText: "Talk to a human",
      }).kind
    ).toBe("talk_human");
  });
});

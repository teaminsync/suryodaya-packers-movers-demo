/**
 * Tests for conformance checks
 */

import { evaluateScenario, findCurrencyAmounts, normalizeDashes } from "../checks.js";
import { NOT_OFFER, SCENARIOS } from "../scenarios.js";
import { turnResponseSchema } from "../../flows/qualification.js";
import type { TurnResponse } from "../../flows/qualification.js";

describe("Conformance checks", () => {
  it("only_allowed_price passes for reply with hyphen matching en-dash allowed price", () => {
    const scenario = SCENARIOS.find((s) => s.id === "S03")!;
    const reply = "Roughly \u20B918,000-35,000 for your 2BHK intercity move";

    const turnResponse: TurnResponse = {
      extractedFields: {},
      replyMessage: reply,
      wantsToBookSurvey: false,
      wantsHuman: false,
    };

    const results = evaluateScenario(scenario, turnResponse);
    const onlyAllowedCheck = results.find((r) => r.name === "only_allowed_price");
    expect(onlyAllowedCheck?.pass).toBe(true);

    // Test failure case
    const turnResponse2: TurnResponse = {
      extractedFields: {},
      replyMessage: "about \u20B920,000",
      wantsToBookSurvey: false,
      wantsHuman: false,
    };

    const results2 = evaluateScenario(scenario, turnResponse2);
    const onlyAllowedCheck2 = results2.find((r) => r.name === "only_allowed_price");
    expect(onlyAllowedCheck2?.pass).toBe(false);
  });

  it("no_price fails for currency amounts and passes without them", () => {
    const scenario = SCENARIOS.find((s) => s.id === "S01")!;

    const turnResponse1: TurnResponse = {
      extractedFields: {},
      replyMessage: "that is Rs. 5000",
      wantsToBookSurvey: false,
      wantsHuman: false,
    };

    const results1 = evaluateScenario(scenario, turnResponse1);
    const noPriceCheck1 = results1.find((r) => r.name === "no_price");
    expect(noPriceCheck1?.pass).toBe(false);

    const turnResponse2: TurnResponse = {
      extractedFields: {},
      replyMessage: "I need more details first",
      wantsToBookSurvey: false,
      wantsHuman: false,
    };

    const results2 = evaluateScenario(scenario, turnResponse2);
    const noPriceCheck2 = results2.find((r) => r.name === "no_price");
    expect(noPriceCheck2?.pass).toBe(true);
  });

  it("NOT_OFFER matches negations and not affirmations", () => {
    expect(NOT_OFFER.test("We do not offer storage")).toBe(true);
    expect(NOT_OFFER.test("Yes, we offer storage")).toBe(false);
  });

  it("scenario S04 with warehouse affirmation yields failing checks", () => {
    const scenario = SCENARIOS.find((s) => s.id === "S04")!;
    const turnResponse: TurnResponse = {
      extractedFields: {},
      replyMessage: "Yes, we offer short-term storage at our warehouses in Pune",
      wantsToBookSurvey: false,
      wantsHuman: false,
    };

    const results = evaluateScenario(scenario, turnResponse);
    const forbiddenCheck = results.find((r) => r.name === "forbidden");
    const requiredCheck = results.find((r) => r.name === "required_any");

    expect(forbiddenCheck?.pass).toBe(false);
    expect(requiredCheck?.pass).toBe(false);
  });

  it("scenario S12 with moveType present yields failing fields_absent", () => {
    const scenario = SCENARIOS.find((s) => s.id === "S12")!;
    const turnResponse: TurnResponse = {
      extractedFields: {
        moveType: "intercity",
        estimatedVolume: "3bhk",
        requiresPacking: true,
      },
      replyMessage: "Got it, updating to 3BHK with packing",
      wantsToBookSurvey: false,
      wantsHuman: false,
    };

    const results = evaluateScenario(scenario, turnResponse);
    const fieldsAbsentCheck = results.find((r) => r.name === "fields_absent");
    const fieldsCheck = results.find((r) => r.name === "fields");

    expect(fieldsAbsentCheck?.pass).toBe(false);
    expect(fieldsAbsentCheck?.detail).toContain("moveType");
    expect(fieldsCheck?.pass).toBe(true);
  });

  it("turnResponseSchema rejects null for optional fields", () => {
    const data = {
      extractedFields: { origin: null },
      replyMessage: "x",
      wantsToBookSurvey: false,
      wantsHuman: false,
    };

    const result = turnResponseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("scenario S05 with curly quotes in reply passes required_any and forbidden", () => {
    const scenario = SCENARIOS.find((s) => s.id === "S05")!;
    const turnResponse: TurnResponse = {
      extractedFields: {},
      replyMessage: "We\u2019ll check on the insurance coverage for your move and get back to you. For a quick answer, you can tap \u201CTalk to a Human\u201D in the menu or let us know if you\u2019d like to speak with our team.",
      wantsToBookSurvey: false,
      wantsHuman: false,
    };

    const results = evaluateScenario(scenario, turnResponse);
    const requiredCheck = results.find((r) => r.name === "required_any");
    const forbiddenCheck = results.find((r) => r.name === "forbidden");

    expect(requiredCheck?.pass).toBe(true);
    expect(forbiddenCheck?.pass).toBe(true);
  });

  it("scenario S04 with curly apostrophe and non-breaking hyphen passes checks", () => {
    const scenario = SCENARIOS.find((s) => s.id === "S04")!;
    const turnResponse: TurnResponse = {
      extractedFields: {},
      replyMessage: "We don\u2019t offer storage or short\u2011term warehousing.",
      wantsToBookSurvey: false,
      wantsHuman: false,
    };

    const results = evaluateScenario(scenario, turnResponse);
    const requiredCheck = results.find((r) => r.name === "required_any");
    const forbiddenCheck = results.find((r) => r.name === "forbidden");

    expect(requiredCheck?.pass).toBe(true);
    expect(forbiddenCheck?.pass).toBe(true);
  });

  it("scenario S04 with plain ASCII negation passes checks", () => {
    const scenario = SCENARIOS.find((s) => s.id === "S04")!;
    const turnResponse: TurnResponse = {
      extractedFields: {},
      replyMessage: "We do not offer storage facilities. Our team can suggest alternatives.",
      wantsToBookSurvey: false,
      wantsHuman: false,
    };

    const results = evaluateScenario(scenario, turnResponse);
    const requiredCheck = results.find((r) => r.name === "required_any");
    const forbiddenCheck = results.find((r) => r.name === "forbidden");

    expect(requiredCheck?.pass).toBe(true);
    expect(forbiddenCheck?.pass).toBe(true);
  });
});

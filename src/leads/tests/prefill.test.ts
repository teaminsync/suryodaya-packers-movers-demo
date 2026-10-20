/**
 * Tests for prefill logic
 */

import {
  planPrefill,
  isPlaceholderText,
  prefillEnquiry,
  normalizeExtractedKeys,
  planSpecialItems,
  PREFILL_MAX_VALUE_LENGTH,
  type PrefillDeps,
} from "../prefill.js";

interface CallRecord {
  fn: string;
  args: any[];
}

function makeDeps(overrides: Partial<PrefillDeps> = {}): PrefillDeps & { calls: CallRecord[] } {
  const calls: CallRecord[] = [];

  const defaults: PrefillDeps = {
    async getLeadFields(leadId: string) {
      calls.push({ fn: "getLeadFields", args: [leadId] });
      return { origin: null, destination: null, move_type: null, urgency: null };
    },
    async extractFields(text: string) {
      calls.push({ fn: "extractFields", args: [text] });
      return null;
    },
    async applyFields(leadId: string, fields: Record<string, string>) {
      calls.push({ fn: "applyFields", args: [leadId, fields] });
    },
  };

  return {
    ...defaults,
    ...overrides,
    calls,
  } as PrefillDeps & { calls: CallRecord[] };
}

const ALLOWED = ["origin", "destination", "move_type", "urgency"];
const TEXT = "Need to shift a 3BHK household from Pune to Mumbai next week. Piano included.";

describe("planPrefill", () => {
  it("fills empty allowed fields, trims values, cuts a 300-character value to 200 characters, and ignores a key that is not in allowed", () => {
    const extracted = {
      origin: "  Pune  ",
      destination: "Mumbai",
      move_type: "intercity",
      extra: "ignored",
      urgency: "x".repeat(300),
    };
    const current = { origin: null, destination: null, move_type: null, urgency: null };

    const result = planPrefill({ current, extracted, allowed: ALLOWED });

    expect(result.fields).toEqual({
      origin: "Pune",
      destination: "Mumbai",
      move_type: "intercity",
      urgency: "x".repeat(PREFILL_MAX_VALUE_LENGTH),
    });
    expect(result.skipped).toEqual([]);
    expect(result.fields.urgency.length).toBe(200);
    expect(result.fields).not.toHaveProperty("extra");
  });

  it("never overwrites", () => {
    const extracted1 = { origin: "Delhi", destination: "Mumbai" };
    const current1 = { origin: "Pune", destination: null, move_type: null, urgency: null };

    const result1 = planPrefill({ current: current1, extracted: extracted1, allowed: ALLOWED });

    expect(result1.fields).toEqual({ destination: "Mumbai" });
    expect(result1.skipped).toEqual(["origin"]);

    const extracted2 = { urgency: "next week" };
    const current2 = { origin: null, destination: null, move_type: null, urgency: false };

    const result2 = planPrefill({ current: current2, extracted: extracted2, allowed: ALLOWED });

    expect(result2.fields).toEqual({});
    expect(result2.skipped).toEqual(["urgency"]);

    const current3 = { origin: "  ", destination: null, move_type: null, urgency: null };
    const extracted3 = { origin: "Pune" };

    const result3 = planPrefill({ current: current3, extracted: extracted3, allowed: ALLOWED });

    expect(result3.fields).toEqual({ origin: "Pune" });
    expect(result3.skipped).toEqual([]);
  });

  it("with extracted null, undefined, a number value, a blank string and a null value", () => {
    const result1 = planPrefill({
      current: { origin: null },
      extracted: null,
      allowed: ["origin"],
    });
    expect(result1.fields).toEqual({});
    expect(result1.skipped).toEqual([]);

    const result2 = planPrefill({
      current: { origin: null },
      extracted: undefined,
      allowed: ["origin"],
    });
    expect(result2.fields).toEqual({});
    expect(result2.skipped).toEqual([]);

    const result3 = planPrefill({
      current: { origin: null },
      extracted: { origin: 5 },
      allowed: ["origin"],
    });
    expect(result3.fields).toEqual({});
    expect(result3.skipped).toEqual([]);

    const result4 = planPrefill({
      current: { origin: null },
      extracted: { origin: "   " },
      allowed: ["origin"],
    });
    expect(result4.fields).toEqual({});
    expect(result4.skipped).toEqual([]);

    const result5 = planPrefill({
      current: { origin: null },
      extracted: { origin: null },
      allowed: ["origin"],
    });
    expect(result5.fields).toEqual({});
    expect(result5.skipped).toEqual([]);
  });
});

describe("isPlaceholderText", () => {
  it("returns true for placeholder patterns", () => {
    expect(isPlaceholderText("[IndiaMART enquiry, type P]")).toBe(true);
    expect(isPlaceholderText("  [x]  ")).toBe(true);
    expect(isPlaceholderText("Need a move [urgent]")).toBe(false);
    expect(isPlaceholderText("")).toBe(false);
    expect(isPlaceholderText("[")).toBe(false);
  });
});

describe("prefillEnquiry", () => {
  it("happy path", async () => {
    const deps = makeDeps({
      async extractFields(text: string) {
        deps.calls.push({ fn: "extractFields", args: [text] });
        return {
          origin: "Pune",
          destination: "Mumbai",
          move_type: "intercity",
          urgency: "next week",
          extra: "x",
        };
      },
    });

    const result = await prefillEnquiry({ leadId: "l1", text: TEXT, allowed: ALLOWED }, deps);

    expect(result.status).toBe("filled");
    expect(result.filled).toEqual(["origin", "destination", "move_type", "urgency"]);

    const applyCall = deps.calls.find((c) => c.fn === "applyFields");
    expect(applyCall).toBeTruthy();
    expect(applyCall?.args[1]).toEqual({
      origin: "Pune",
      destination: "Mumbai",
      move_type: "intercity",
      urgency: "next week",
    });
    expect(applyCall?.args[1]).not.toHaveProperty("extra");

    const extractCall = deps.calls.find((c) => c.fn === "extractFields");
    expect(extractCall).toBeTruthy();
    expect(extractCall?.args[0]).toBe(TEXT);
  });

  it("partial", async () => {
    const deps = makeDeps({
      async getLeadFields(leadId: string) {
        deps.calls.push({ fn: "getLeadFields", args: [leadId] });
        return { origin: "Delhi", destination: null, move_type: null, urgency: null };
      },
      async extractFields(text: string) {
        deps.calls.push({ fn: "extractFields", args: [text] });
        return {
          origin: "Pune",
          destination: "Mumbai",
          move_type: "intercity",
          urgency: "next week",
        };
      },
    });

    const result = await prefillEnquiry({ leadId: "l1", text: TEXT, allowed: ALLOWED }, deps);

    expect(result.status).toBe("filled");
    expect(result.filled).toEqual(["destination", "move_type", "urgency"]);

    const applyCall = deps.calls.find((c) => c.fn === "applyFields");
    expect(applyCall).toBeTruthy();
    expect(applyCall?.args[1]).toEqual({
      destination: "Mumbai",
      move_type: "intercity",
      urgency: "next week",
    });
  });

  it("text too short and placeholder text", async () => {
    const deps1 = makeDeps();
    const result1 = await prefillEnquiry({ leadId: "l1", text: "hi there", allowed: ALLOWED }, deps1);

    expect(result1.status).toBe("skipped_no_text");
    expect(deps1.calls.length).toBe(0);

    const deps2 = makeDeps();
    const result2 = await prefillEnquiry(
      { leadId: "l1", text: "[IndiaMART enquiry, type P]", allowed: ALLOWED },
      deps2
    );

    expect(result2.status).toBe("skipped_no_text");
    expect(deps2.calls.length).toBe(0);
  });

  it("getLeadFields returns undefined", async () => {
    const deps = makeDeps({
      async getLeadFields(leadId: string) {
        deps.calls.push({ fn: "getLeadFields", args: [leadId] });
        return undefined;
      },
    });

    const result = await prefillEnquiry({ leadId: "l1", text: TEXT, allowed: ALLOWED }, deps);

    expect(result.status).toBe("lead_not_found");
    expect(deps.calls.find((c) => c.fn === "extractFields")).toBeFalsy();
  });

  it("every allowed field already has a value", async () => {
    const deps = makeDeps({
      async getLeadFields(leadId: string) {
        deps.calls.push({ fn: "getLeadFields", args: [leadId] });
        return {
          origin: "Delhi",
          destination: "Mumbai",
          move_type: "intercity",
          urgency: "next week",
        };
      },
    });

    const result = await prefillEnquiry({ leadId: "l1", text: TEXT, allowed: ALLOWED }, deps);

    expect(result.status).toBe("nothing_to_fill");
    expect(deps.calls.find((c) => c.fn === "extractFields")).toBeFalsy();
  });

  it("extractFields returns null and throws", async () => {
    const deps1 = makeDeps({
      async extractFields(text: string) {
        deps1.calls.push({ fn: "extractFields", args: [text] });
        return null;
      },
    });

    const result1 = await prefillEnquiry({ leadId: "l1", text: TEXT, allowed: ALLOWED }, deps1);

    expect(result1.status).toBe("extract_failed");
    expect(deps1.calls.find((c) => c.fn === "applyFields")).toBeFalsy();

    const deps2 = makeDeps({
      async extractFields(text: string) {
        deps2.calls.push({ fn: "extractFields", args: [text] });
        throw new Error("boom");
      },
    });

    const result2 = await prefillEnquiry({ leadId: "l1", text: TEXT, allowed: ALLOWED }, deps2);

    expect(result2.status).toBe("extract_failed");
  });

  it("extractFields returns only unusable values", async () => {
    const deps = makeDeps({
      async extractFields(text: string) {
        deps.calls.push({ fn: "extractFields", args: [text] });
        return { origin: 5, destination: "  ", move_type: null };
      },
    });

    const result = await prefillEnquiry({ leadId: "l1", text: TEXT, allowed: ALLOWED }, deps);

    expect(result.status).toBe("nothing_to_fill");
    expect(deps.calls.find((c) => c.fn === "applyFields")).toBeFalsy();
  });

  it("applyFields throws", async () => {
    const deps = makeDeps({
      async extractFields(text: string) {
        deps.calls.push({ fn: "extractFields", args: [text] });
        return { origin: "Pune", destination: "Mumbai" };
      },
      async applyFields(leadId: string, fields: Record<string, string>) {
        deps.calls.push({ fn: "applyFields", args: [leadId, fields] });
        throw new Error("db down");
      },
    });

    const result = await prefillEnquiry({ leadId: "l1", text: TEXT, allowed: ALLOWED }, deps);

    expect(result.status).toBe("apply_failed");
    expect(result.filled).toEqual([]);
  });

  it("a 3000-character text", async () => {
    const longText = "x".repeat(3000);
    const deps = makeDeps({
      async extractFields(text: string) {
        deps.calls.push({ fn: "extractFields", args: [text] });
        return { origin: "Pune" };
      },
    });

    await prefillEnquiry({ leadId: "l1", text: longText, allowed: ALLOWED }, deps);

    const extractCall = deps.calls.find((c) => c.fn === "extractFields");
    expect(extractCall).toBeTruthy();
    expect(extractCall?.args[0].length).toBe(2000);
  });
});

describe("normalizeExtractedKeys", () => {
  it("converts camelCase to snake_case", () => {
    const result = normalizeExtractedKeys({
      moveType: "intercity",
      estimatedVolume: "medium",
      origin: "Pune",
      hasSpecialItems: true,
    });

    expect(result).toEqual({
      move_type: "intercity",
      estimated_volume: "medium",
      origin: "Pune",
      hasSpecialItems: true,
    });
  });

  it("snake_case key wins when both present, and input is not mutated", () => {
    const input = { move_type: "local", moveType: "intercity" };
    const result = normalizeExtractedKeys(input);

    expect(result).toEqual({ move_type: "local" });
    expect(input).toEqual({ move_type: "local", moveType: "intercity" });
  });

  it("regression with planPrefill", () => {
    const result = planPrefill({
      current: { origin: null, destination: null, move_type: null, urgency: null },
      extracted: normalizeExtractedKeys({ moveType: "intercity", origin: "Pune" }),
      allowed: ["origin", "destination", "move_type", "urgency"],
    });

    expect(result.fields).toEqual({ origin: "Pune", move_type: "intercity" });
    expect(result.skipped).toEqual([]);
  });
});

describe("special items", () => {
  it("planSpecialItems with hasSpecialItems true and items present", () => {
    const result = planSpecialItems({
      current: { has_special_items: false, special_items: null },
      extracted: { hasSpecialItems: true, specialItems: ["piano"] },
    });

    expect(result).toEqual(["piano"]);
  });

  it("planSpecialItems returns null when conditions fail", () => {
    expect(planSpecialItems({
      current: {},
      extracted: { hasSpecialItems: false, specialItems: ["piano"] },
    })).toBeNull();

    expect(planSpecialItems({
      current: {},
      extracted: { specialItems: ["piano"] },
    })).toBeNull();

    expect(planSpecialItems({
      current: {},
      extracted: { hasSpecialItems: "true", specialItems: ["piano"] },
    })).toBeNull();

    expect(planSpecialItems({
      current: {},
      extracted: null,
    })).toBeNull();

    expect(planSpecialItems({
      current: {},
      extracted: undefined,
    })).toBeNull();

    expect(planSpecialItems({
      current: {},
      extracted: { hasSpecialItems: true, specialItems: [] },
    })).toBeNull();
  });

  it("planSpecialItems returns null when already known", () => {
    expect(planSpecialItems({
      current: { has_special_items: true },
      extracted: { hasSpecialItems: true, specialItems: ["piano"] },
    })).toBeNull();

    expect(planSpecialItems({
      current: { special_items: '["safe"]' },
      extracted: { hasSpecialItems: true, specialItems: ["piano"] },
    })).toBeNull();

    expect(planSpecialItems({
      current: { special_items: ["safe"] },
      extracted: { hasSpecialItems: true, specialItems: ["piano"] },
    })).toBeNull();

    expect(planSpecialItems({
      current: { special_items: "[]", has_special_items: false },
      extracted: { hasSpecialItems: true, specialItems: ["piano"] },
    })).not.toBeNull();

    expect(planSpecialItems({
      current: { special_items: "", has_special_items: false },
      extracted: { hasSpecialItems: true, specialItems: ["piano"] },
    })).not.toBeNull();

    expect(planSpecialItems({
      current: { special_items: null, has_special_items: false },
      extracted: { hasSpecialItems: true, specialItems: ["piano"] },
    })).not.toBeNull();
  });

  it("planSpecialItems cleans items", () => {
    const result = planSpecialItems({
      current: {},
      extracted: {
        hasSpecialItems: true,
        specialItems: [
          " piano ",
          "",
          5,
          null,
          "x".repeat(60),
          "a1",
          "a2",
          "a3",
          "a4",
          "a5",
          "a6",
          "a7",
          "a8",
          "a9",
          "a10",
          "a11",
        ],
      },
    });

    expect(result).not.toBeNull();
    expect(result!.length).toBe(10);
    expect(result![0]).toBe("piano");
    expect(result!.every((item) => typeof item === "string" && item.length <= 50)).toBe(true);
  });

  it("prefillEnquiry with applySpecialItems fills special items only", async () => {
    const deps = makeDeps({
      async getLeadFields(leadId: string) {
        deps.calls.push({ fn: "getLeadFields", args: [leadId] });
        return {
          origin: "Pune",
          destination: "Mumbai",
          move_type: "intercity",
          urgency: "next week",
          has_special_items: false,
          special_items: null,
        };
      },
      async extractFields(text: string) {
        deps.calls.push({ fn: "extractFields", args: [text] });
        return {
          hasSpecialItems: true,
          specialItems: ["piano"],
        };
      },
      async applySpecialItems(leadId: string, items: string[]) {
        deps.calls.push({ fn: "applySpecialItems", args: [leadId, items] });
      },
    });

    const result = await prefillEnquiry({ leadId: "l1", text: TEXT, allowed: ALLOWED }, deps);

    expect(result.status).toBe("filled");
    expect(result.filled).toEqual(["special_items"]);

    const applyFieldsCall = deps.calls.find((c) => c.fn === "applyFields");
    expect(applyFieldsCall).toBeFalsy();

    const applySpecialCall = deps.calls.find((c) => c.fn === "applySpecialItems");
    expect(applySpecialCall).toBeTruthy();
    expect(applySpecialCall?.args).toEqual(["l1", ["piano"]]);

    const extractCall = deps.calls.find((c) => c.fn === "extractFields");
    expect(extractCall).toBeTruthy();
  });

  it("prefillEnquiry with both text fields and special items", async () => {
    const deps = makeDeps({
      async getLeadFields(leadId: string) {
        deps.calls.push({ fn: "getLeadFields", args: [leadId] });
        return {
          origin: null,
          destination: null,
          move_type: null,
          urgency: null,
          has_special_items: false,
          special_items: null,
        };
      },
      async extractFields(text: string) {
        deps.calls.push({ fn: "extractFields", args: [text] });
        return {
          origin: "Pune",
          destination: "Mumbai",
          hasSpecialItems: true,
          specialItems: ["piano"],
        };
      },
      async applySpecialItems(leadId: string, items: string[]) {
        deps.calls.push({ fn: "applySpecialItems", args: [leadId, items] });
      },
    });

    const result = await prefillEnquiry({ leadId: "l1", text: TEXT, allowed: ALLOWED }, deps);

    expect(result.status).toBe("filled");

    const applyFieldsCall = deps.calls.find((c) => c.fn === "applyFields");
    const applySpecialCall = deps.calls.find((c) => c.fn === "applySpecialItems");

    expect(applyFieldsCall).toBeTruthy();
    expect(applySpecialCall).toBeTruthy();
    expect(deps.calls.findIndex((c) => c.fn === "applyFields")).toBeLessThan(
      deps.calls.findIndex((c) => c.fn === "applySpecialItems")
    );

    expect(result.filled[result.filled.length - 1]).toBe("special_items");
    expect(result.filled.slice(0, -1)).toEqual(["origin", "destination"]);
  });

  it("prefillEnquiry nothing_to_fill when text fields filled and special items known", async () => {
    const deps1 = makeDeps({
      async getLeadFields(leadId: string) {
        deps1.calls.push({ fn: "getLeadFields", args: [leadId] });
        return {
          origin: "Pune",
          destination: "Mumbai",
          move_type: "intercity",
          urgency: "next week",
          has_special_items: true,
        };
      },
      async applySpecialItems(leadId: string, items: string[]) {
        deps1.calls.push({ fn: "applySpecialItems", args: [leadId, items] });
      },
    });

    const result1 = await prefillEnquiry({ leadId: "l1", text: TEXT, allowed: ALLOWED }, deps1);

    expect(result1.status).toBe("nothing_to_fill");
    expect(deps1.calls.find((c) => c.fn === "extractFields")).toBeFalsy();

    const deps2 = makeDeps({
      async getLeadFields(leadId: string) {
        deps2.calls.push({ fn: "getLeadFields", args: [leadId] });
        return {
          origin: "Pune",
          destination: "Mumbai",
          move_type: "intercity",
          urgency: "next week",
          has_special_items: false,
          special_items: null,
        };
      },
    });

    const result2 = await prefillEnquiry({ leadId: "l1", text: TEXT, allowed: ALLOWED }, deps2);

    expect(result2.status).toBe("nothing_to_fill");
    expect(deps2.calls.find((c) => c.fn === "extractFields")).toBeFalsy();
  });
});

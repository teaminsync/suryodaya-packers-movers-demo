/**
 * Tests for prefill logic
 */

import {
  planPrefill,
  isPlaceholderText,
  prefillEnquiry,
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

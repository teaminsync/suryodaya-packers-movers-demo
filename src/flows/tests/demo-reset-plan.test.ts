/**
 * Tests for demo reset planning logic
 */

import { describe, it, expect } from "@jest/globals";
import { planDemoReset } from "../../demo-reset-plan.js";

describe("planDemoReset", () => {
  it("keeps contact by phone with +91 and spaces", () => {
    const rows = [
      { contactId: "c1", phone: "+91 90822 10545", instagramUsername: null, leadId: "l1" },
      { contactId: "c2", phone: "+91 98765 43210", instagramUsername: null, leadId: "l2" },
    ];

    const plan = planDemoReset(rows, { phones: ["919082210545"], instagramUsernames: [] });

    expect(plan.keepContactIds.has("c1")).toBe(true);
    expect(plan.keepContactIds.has("c2")).toBe(false);
    expect(plan.deleteLeadIds).toEqual(["l2"]);
  });

  it("keeps contact by Instagram username with and without @", () => {
    const rows = [
      { contactId: "c1", phone: null, instagramUsername: "@d3vanshhhh", leadId: "l1" },
      { contactId: "c2", phone: null, instagramUsername: "another_user", leadId: "l2" },
    ];

    const plan = planDemoReset(rows, { phones: [], instagramUsernames: ["d3vanshhhh"] });

    expect(plan.keepContactIds.has("c1")).toBe(true);
    expect(plan.keepContactIds.has("c2")).toBe(false);
    expect(plan.deleteLeadIds).toEqual(["l2"]);
  });

  it("keeps nothing when no matches", () => {
    const rows = [
      { contactId: "c1", phone: "+91 98765 43210", instagramUsername: "user1", leadId: "l1" },
      { contactId: "c2", phone: "+91 99999 99999", instagramUsername: "user2", leadId: "l2" },
    ];

    const plan = planDemoReset(rows, { phones: ["911111111111"], instagramUsernames: ["otheruser"] });

    expect(plan.keepContactIds.size).toBe(0);
    expect(plan.deleteLeadIds).toEqual(["l1", "l2"]);
  });

  it("keeps contact that matches both phone and Instagram", () => {
    const rows = [
      { contactId: "c1", phone: "+91 90822 10545", instagramUsername: "@d3vanshhhh", leadId: "l1" },
    ];

    const plan = planDemoReset(rows, { phones: ["919082210545"], instagramUsernames: ["d3vanshhhh"] });

    expect(plan.keepContactIds.has("c1")).toBe(true);
    expect(plan.deleteLeadIds).toEqual([]);
  });

  it("handles empty input", () => {
    const plan = planDemoReset([], { phones: ["919082210545"], instagramUsernames: ["d3vanshhhh"] });

    expect(plan.keepContactIds.size).toBe(0);
    expect(plan.deleteLeadIds).toEqual([]);
  });

  it("is case-insensitive for Instagram usernames", () => {
    const rows = [
      { contactId: "c1", phone: null, instagramUsername: "D3VANSHHHH", leadId: "l1" },
    ];

    const plan = planDemoReset(rows, { phones: [], instagramUsernames: ["d3vanshhhh"] });

    expect(plan.keepContactIds.has("c1")).toBe(true);
    expect(plan.deleteLeadIds).toEqual([]);
  });
});

/**
 * Tests for enquiry lifecycle policy
 */

import { decideEnquiry } from "../enquiry-policy.js";

describe("Enquiry policy", () => {
  const now = new Date("2026-10-13T00:00:00.000Z");

  it("no enquiry", () => {
    const result = decideEnquiry(undefined, now);
    expect(result).toEqual({ action: "create", reason: "no_enquiry" });
  });

  it("recent open enquiry", () => {
    const twoDaysAgo = new Date(now.getTime() - 2 * 86400000).toISOString();
    const latest = { id: "l1", closed_at: null, updated_at: twoDaysAgo };
    const result = decideEnquiry(latest, now);
    expect(result).toEqual({ action: "attach", leadId: "l1" });
  });

  it("closed enquiry", () => {
    const oneDayAgo = new Date(now.getTime() - 1 * 86400000).toISOString();
    const latest = { id: "l2", closed_at: "2026-10-12T00:00:00.000Z", updated_at: oneDayAgo };
    const result = decideEnquiry(latest, now);
    expect(result).toEqual({ action: "create", reason: "closed" });
  });

  it("idle 31 days", () => {
    const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 86400000).toISOString();
    const latest = { id: "l3", closed_at: null, updated_at: thirtyOneDaysAgo };
    const result = decideEnquiry(latest, now);
    expect(result).toEqual({ action: "create", reason: "idle" });
  });

  it("exactly 30 days old", () => {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
    const latest = { id: "l4", closed_at: null, updated_at: thirtyDaysAgo };
    const result = decideEnquiry(latest, now);
    expect(result).toEqual({ action: "attach", leadId: "l4" });
  });

  it("custom idleDays 7", () => {
    const eightDaysAgo = new Date(now.getTime() - 8 * 86400000).toISOString();
    const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString();

    const latest1 = { id: "l5", closed_at: null, updated_at: eightDaysAgo };
    const result1 = decideEnquiry(latest1, now, 7);
    expect(result1).toEqual({ action: "create", reason: "idle" });

    const latest2 = { id: "l6", closed_at: null, updated_at: threeDaysAgo };
    const result2 = decideEnquiry(latest2, now, 7);
    expect(result2).toEqual({ action: "attach", leadId: "l6" });
  });
});

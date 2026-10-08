/**
 * Tests for team follow-up detection
 */

import { promisesTeamFollowUp } from "../followup.js";
import { turnResponseSchema } from "../qualification.js";

describe("promisesTeamFollowUp", () => {
  it("should detect team follow-up promise with unicode quotes", () => {
    const text = "We\u2019ll check on the insurance coverage for your move and get back to you. For a quick answer, you can tap \u201CTalk to a Human\u201D in the menu.";
    expect(promisesTeamFollowUp(text)).toBe(true);
  });

  it("should detect 'confirm with team'", () => {
    const text = "I'll confirm the details of our cancellation policy with the team for you.";
    expect(promisesTeamFollowUp(text)).toBe(true);
  });

  it("should NOT match when team is mentioned without promise", () => {
    const text = "We do not offer storage or warehousing services. I can connect you with our team.";
    expect(promisesTeamFollowUp(text)).toBe(false);
  });

  it("should NOT match ballpark pricing message", () => {
    const text = "The ballpark for your move is \u20B918,000\u201335,000. Would you like to book the free on-site survey?";
    expect(promisesTeamFollowUp(text)).toBe(false);
  });

  it("should reject turnResponse without needsTeamFollowUp field", () => {
    const result = turnResponseSchema.safeParse({
      extractedFields: {},
      replyMessage: "x",
      wantsToBookSurvey: false,
      wantsHuman: false,
    });
    expect(result.success).toBe(false);
  });

  it("should accept turnResponse with needsTeamFollowUp field", () => {
    const result = turnResponseSchema.safeParse({
      extractedFields: {},
      replyMessage: "x",
      wantsToBookSurvey: false,
      wantsHuman: false,
      needsTeamFollowUp: true,
    });
    expect(result.success).toBe(true);
  });
});

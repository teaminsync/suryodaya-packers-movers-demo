/**
 * Tests for team follow-up alert decision logic
 */

import { describe, it, expect } from "@jest/globals";
import { shouldAlertTeamFollowUp } from "../team-followup.js";

describe("shouldAlertTeamFollowUp", () => {
  const now = new Date("2026-10-28T12:00:00.000Z");

  it("returns no alert when humanRequested is true", () => {
    const result = shouldAlertTeamFollowUp({
      humanRequested: true,
      needsTeamFollowUp: true,
      replyPromisesTeam: true,
      escalated: false,
      escalatedAt: null,
      now,
    });

    expect(result).toEqual({ alert: false, markEscalated: false });
  });

  it("returns no alert when neither needsTeamFollowUp nor replyPromisesTeam", () => {
    const result = shouldAlertTeamFollowUp({
      humanRequested: false,
      needsTeamFollowUp: false,
      replyPromisesTeam: false,
      escalated: false,
      escalatedAt: null,
      now,
    });

    expect(result).toEqual({ alert: false, markEscalated: false });
  });

  it("alerts and marks escalated when not yet escalated", () => {
    const result = shouldAlertTeamFollowUp({
      humanRequested: false,
      needsTeamFollowUp: true,
      replyPromisesTeam: false,
      escalated: false,
      escalatedAt: null,
      now,
    });

    expect(result).toEqual({ alert: true, markEscalated: true });
  });

  it("alerts when escalatedAt is exactly 6 hours old (Date object)", () => {
    const escalatedAt = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const result = shouldAlertTeamFollowUp({
      humanRequested: false,
      needsTeamFollowUp: false,
      replyPromisesTeam: true,
      escalated: true,
      escalatedAt,
      now,
    });

    expect(result).toEqual({ alert: true, markEscalated: true });
  });

  it("does not alert when escalatedAt is 5h59m old", () => {
    const escalatedAt = new Date(now.getTime() - (5 * 60 + 59) * 60 * 1000);
    const result = shouldAlertTeamFollowUp({
      humanRequested: false,
      needsTeamFollowUp: true,
      replyPromisesTeam: false,
      escalated: true,
      escalatedAt,
      now,
    });

    expect(result).toEqual({ alert: false, markEscalated: false });
  });

  it("alerts when escalatedAt is exactly 6 hours old (ISO string)", () => {
    const escalatedAt = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
    const result = shouldAlertTeamFollowUp({
      humanRequested: false,
      needsTeamFollowUp: true,
      replyPromisesTeam: false,
      escalated: true,
      escalatedAt,
      now,
    });

    expect(result).toEqual({ alert: true, markEscalated: true });
  });

  it("alerts when escalatedAt is 10 hours old", () => {
    const escalatedAt = new Date(now.getTime() - 10 * 60 * 60 * 1000);
    const result = shouldAlertTeamFollowUp({
      humanRequested: false,
      needsTeamFollowUp: false,
      replyPromisesTeam: true,
      escalated: true,
      escalatedAt,
      now,
    });

    expect(result).toEqual({ alert: true, markEscalated: true });
  });

  it("does not alert when escalatedAt is null", () => {
    const result = shouldAlertTeamFollowUp({
      humanRequested: false,
      needsTeamFollowUp: true,
      replyPromisesTeam: false,
      escalated: true,
      escalatedAt: null,
      now,
    });

    expect(result).toEqual({ alert: false, markEscalated: false });
  });

  it("does not alert when escalatedAt is invalid date string", () => {
    const result = shouldAlertTeamFollowUp({
      humanRequested: false,
      needsTeamFollowUp: true,
      replyPromisesTeam: false,
      escalated: true,
      escalatedAt: "invalid-date",
      now,
    });

    expect(result).toEqual({ alert: false, markEscalated: false });
  });

  it("does not alert when just re-alerted (escalatedAt = now)", () => {
    const result = shouldAlertTeamFollowUp({
      humanRequested: false,
      needsTeamFollowUp: true,
      replyPromisesTeam: false,
      escalated: true,
      escalatedAt: now,
      now,
    });

    expect(result).toEqual({ alert: false, markEscalated: false });
  });
});

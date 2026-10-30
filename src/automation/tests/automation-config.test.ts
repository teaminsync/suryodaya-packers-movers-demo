/**
 * Tests for automation config parsing
 */

import { describe, it, expect } from "@jest/globals";
import { parseAutomationConfig, DEFAULT_AUTOMATION_CONFIG } from "../config.js";

describe("parseAutomationConfig", () => {
  it("returns defaults for empty env", () => {
    const { config, warnings } = parseAutomationConfig({});
    expect(config).toEqual(DEFAULT_AUTOMATION_CONFIG);
    expect(warnings).toEqual([]);
  });

  it("parses FOLLOWUPS_ENABLED=true", () => {
    const { config } = parseAutomationConfig({ FOLLOWUPS_ENABLED: "true" });
    expect(config.enabled).toBe(true);
  });

  it("FOLLOWUPS_ENABLED=TRUE enables", () => {
    const { config } = parseAutomationConfig({ FOLLOWUPS_ENABLED: "TRUE" });
    expect(config.enabled).toBe(true);
  });

  it("FOLLOWUPS_ENABLED=yes does not enable", () => {
    const { config } = parseAutomationConfig({ FOLLOWUPS_ENABLED: "yes" });
    expect(config.enabled).toBe(false);
  });

  it("parses FOLLOWUPS_DRY_RUN=true", () => {
    const { config } = parseAutomationConfig({ FOLLOWUPS_DRY_RUN: "true" });
    expect(config.dryRun).toBe(true);
  });

  it("parses integer tick minutes", () => {
    const { config } = parseAutomationConfig({ FOLLOWUPS_TICK_MINUTES: "10" });
    expect(config.tickMinutes).toBe(10);
  });

  it("rejects invalid tick minutes", () => {
    const { config, warnings } = parseAutomationConfig({ FOLLOWUPS_TICK_MINUTES: "abc" });
    expect(config.tickMinutes).toBe(DEFAULT_AUTOMATION_CONFIG.tickMinutes);
    expect(warnings).toContain("FOLLOWUPS_TICK_MINUTES");
  });

  it("rejects out-of-range tick minutes", () => {
    const { config, warnings } = parseAutomationConfig({ FOLLOWUPS_TICK_MINUTES: "100" });
    expect(config.tickMinutes).toBe(DEFAULT_AUTOMATION_CONFIG.tickMinutes);
    expect(warnings).toContain("FOLLOWUPS_TICK_MINUTES");
  });

  it("accepts fractional nudge hours", () => {
    const { config } = parseAutomationConfig({ FOLLOWUPS_NUDGE_INWINDOW_HOURS: "1.5" });
    expect(config.nudgeInWindowHours).toBe(1.5);
  });

  it("accepts fractional reminder late hours", () => {
    const { config } = parseAutomationConfig({ FOLLOWUPS_REMINDER_LATE_HOURS: "2.5" });
    expect(config.reminderLateHours).toBe(2.5);
  });

  it("rejects sendUntilHour <= sendFromHour", () => {
    const { config, warnings } = parseAutomationConfig({
      FOLLOWUPS_SEND_FROM_HOUR: "10",
      FOLLOWUPS_SEND_UNTIL_HOUR: "10",
    });
    expect(config.sendFromHour).toBe(DEFAULT_AUTOMATION_CONFIG.sendFromHour);
    expect(config.sendUntilHour).toBe(DEFAULT_AUTOMATION_CONFIG.sendUntilHour);
    expect(warnings.some(w => w.includes("FOLLOWUPS_SEND_UNTIL_HOUR"))).toBe(true);
  });

  it("rejects reminderLate >= reminderBefore", () => {
    const { config, warnings } = parseAutomationConfig({
      FOLLOWUPS_REMINDER_HOURS_BEFORE: "12",
      FOLLOWUPS_REMINDER_LATE_HOURS: "15",
    });
    expect(config.reminderHoursBefore).toBe(DEFAULT_AUTOMATION_CONFIG.reminderHoursBefore);
    expect(config.reminderLateHours).toBe(DEFAULT_AUTOMATION_CONFIG.reminderLateHours);
    expect(warnings.some(w => w.includes("FOLLOWUPS_REMINDER_LATE_HOURS"))).toBe(true);
  });

  it("parses all keys correctly", () => {
    const { config, warnings } = parseAutomationConfig({
      FOLLOWUPS_ENABLED: "true",
      FOLLOWUPS_DRY_RUN: "true",
      FOLLOWUPS_TICK_MINUTES: "10",
      FOLLOWUPS_DAILY_CAP: "50",
      FOLLOWUPS_SEND_FROM_HOUR: "8",
      FOLLOWUPS_SEND_UNTIL_HOUR: "22",
      FOLLOWUPS_NUDGE_INWINDOW_HOURS: "20",
      FOLLOWUPS_NUDGE_TEMPLATE_HOURS: "36",
      FOLLOWUPS_MISSING_DETAILS_HOURS: "2",
      FOLLOWUPS_REMINDER_HOURS_BEFORE: "48",
      FOLLOWUPS_REMINDER_LATE_HOURS: "6",
      FOLLOWUPS_MAX_NUDGES: "3",
    });
    expect(warnings).toEqual([]);
    expect(config.enabled).toBe(true);
    expect(config.dryRun).toBe(true);
    expect(config.tickMinutes).toBe(10);
    expect(config.dailyCap).toBe(50);
    expect(config.sendFromHour).toBe(8);
    expect(config.sendUntilHour).toBe(22);
    expect(config.nudgeInWindowHours).toBe(20);
    expect(config.nudgeTemplateHours).toBe(36);
    expect(config.missingDetailsHours).toBe(2);
    expect(config.reminderHoursBefore).toBe(48);
    expect(config.reminderLateHours).toBe(6);
    expect(config.maxNudges).toBe(3);
  });
});

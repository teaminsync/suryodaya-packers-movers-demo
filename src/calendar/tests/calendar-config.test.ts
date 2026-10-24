import { describe, it, expect } from "@jest/globals";
import { parseSurveyConfig, DEFAULT_SURVEY_CONFIG } from "../config.js";

describe("Calendar config", () => {
  it("empty env returns default config with no warnings", () => {
    const { config, warnings } = parseSurveyConfig({});
    expect(config).toEqual(DEFAULT_SURVEY_CONFIG);
    expect(warnings).toEqual([]);
  });

  it("parses a full custom env correctly", () => {
    const env = {
      SURVEY_DURATION_MINUTES: "90",
      SURVEY_BUFFER_MINUTES: "15",
      SURVEY_WORKDAYS: "mon,wed,fri",
      SURVEY_WORK_START: "09:00",
      SURVEY_WORK_END: "17:00",
      SURVEY_BREAK_START: "12:00",
      SURVEY_BREAK_END: "13:00",
      SURVEY_SLOT_STEP_MINUTES: "30",
      SURVEY_MIN_NOTICE_HOURS: "12",
      SURVEY_MAX_DAYS_AHEAD: "7",
      SURVEY_CONCURRENCY: "2",
      SURVEY_HOLIDAYS: "2026-11-08,2026-12-25",
    };
    const { config, warnings } = parseSurveyConfig(env);
    expect(warnings).toEqual([]);
    expect(config.durationMinutes).toBe(90);
    expect(config.bufferMinutes).toBe(15);
    expect(config.workdays).toEqual([1, 3, 5]);
    expect(config.workStartMin).toBe(540);
    expect(config.workEndMin).toBe(1020);
    expect(config.breakStartMin).toBe(720);
    expect(config.breakEndMin).toBe(780);
    expect(config.stepMinutes).toBe(30);
    expect(config.minNoticeHours).toBe(12);
    expect(config.maxDaysAhead).toBe(7);
    expect(config.concurrency).toBe(2);
    expect(config.holidays).toEqual(["2026-11-08", "2026-12-25"]);
  });

  it("invalid numbers use defaults with warnings", () => {
    const env = {
      SURVEY_DURATION_MINUTES: "abc",
      SURVEY_BUFFER_MINUTES: "xyz",
      SURVEY_SLOT_STEP_MINUTES: "9999",
    };
    const { config, warnings } = parseSurveyConfig(env);
    expect(config.durationMinutes).toBe(DEFAULT_SURVEY_CONFIG.durationMinutes);
    expect(config.bufferMinutes).toBe(DEFAULT_SURVEY_CONFIG.bufferMinutes);
    expect(config.stepMinutes).toBe(DEFAULT_SURVEY_CONFIG.stepMinutes);
    expect(warnings.length).toBe(3);
    expect(warnings[0]).toContain('SURVEY_DURATION_MINUTES invalid ("abc")');
    expect(warnings[1]).toContain('SURVEY_BUFFER_MINUTES invalid ("xyz")');
    expect(warnings[2]).toContain('SURVEY_SLOT_STEP_MINUTES invalid ("9999")');
  });

  it("parses workdays with mixed case and spaces", () => {
    const env = { SURVEY_WORKDAYS: " Mon, WED ,sun" };
    const { config, warnings } = parseSurveyConfig(env);
    expect(config.workdays).toEqual([1, 3, 7]);
    expect(warnings).toEqual([]);
  });

  it("unknown workday names use defaults with warning", () => {
    const env = { SURVEY_WORKDAYS: "xyz" };
    const { config, warnings } = parseSurveyConfig(env);
    expect(config.workdays).toEqual(DEFAULT_SURVEY_CONFIG.workdays);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes('Unknown workday name "xyz"'))).toBe(true);
  });

  it("parses holidays and warns on invalid dates", () => {
    const env = { SURVEY_HOLIDAYS: "2026-11-08, 2026-13-40, nope" };
    const { config, warnings } = parseSurveyConfig(env);
    expect(config.holidays).toEqual(["2026-11-08"]);
    expect(warnings.length).toBe(2);
    expect(warnings.some((w) => w.includes('"2026-13-40"'))).toBe(true);
    expect(warnings.some((w) => w.includes('"nope"'))).toBe(true);
  });

  it("break 'none' disables the break", () => {
    const env = { SURVEY_BREAK_START: "none" };
    const { config, warnings } = parseSurveyConfig(env);
    expect(config.breakStartMin).toBeNull();
    expect(config.breakEndMin).toBeNull();
    expect(warnings).toEqual([]);
  });

  it("work end before start uses defaults with warning", () => {
    const env = { SURVEY_WORK_START: "18:00", SURVEY_WORK_END: "09:00" };
    const { config, warnings } = parseSurveyConfig(env);
    expect(config.workStartMin).toBe(DEFAULT_SURVEY_CONFIG.workStartMin);
    expect(config.workEndMin).toBe(DEFAULT_SURVEY_CONFIG.workEndMin);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("Work hours invalid");
  });

  it("break outside work hours uses defaults with warning", () => {
    const env = {
      SURVEY_WORK_START: "10:00",
      SURVEY_WORK_END: "18:00",
      SURVEY_BREAK_START: "08:00",
      SURVEY_BREAK_END: "09:00",
    };
    const { config, warnings } = parseSurveyConfig(env);
    expect(config.breakStartMin).toBe(DEFAULT_SURVEY_CONFIG.breakStartMin);
    expect(config.breakEndMin).toBe(DEFAULT_SURVEY_CONFIG.breakEndMin);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("Break outside work hours");
  });

  it("SURVEY_BREAK_START invalid with valid SURVEY_BREAK_END uses default start", () => {
    const env = {
      SURVEY_BREAK_START: "abc",
      SURVEY_BREAK_END: "14:00",
    };
    const { config, warnings } = parseSurveyConfig(env);
    expect(config.breakStartMin).toBe(780);
    expect(config.breakEndMin).toBe(840);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("SURVEY_BREAK_START invalid");
    expect(warnings[0]).toContain('"abc"');
  });

  it("only SURVEY_BREAK_END provided uses default start", () => {
    const env = {
      SURVEY_BREAK_END: "15:00",
    };
    const { config, warnings } = parseSurveyConfig(env);
    expect(config.breakStartMin).toBe(780);
    expect(config.breakEndMin).toBe(900);
    expect(warnings).toEqual([]);
  });

  it("SURVEY_BREAK_END none alone disables break", () => {
    const env = {
      SURVEY_BREAK_END: "none",
    };
    const { config, warnings } = parseSurveyConfig(env);
    expect(config.breakStartMin).toBeNull();
    expect(config.breakEndMin).toBeNull();
    expect(warnings).toEqual([]);
  });

  it("empty strings for both break times use defaults", () => {
    const env = {
      SURVEY_BREAK_START: "",
      SURVEY_BREAK_END: "",
    };
    const { config, warnings } = parseSurveyConfig(env);
    expect(config.breakStartMin).toBe(DEFAULT_SURVEY_CONFIG.breakStartMin);
    expect(config.breakEndMin).toBe(DEFAULT_SURVEY_CONFIG.breakEndMin);
    expect(warnings).toEqual([]);
  });
});

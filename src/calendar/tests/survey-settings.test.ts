import { describe, it, expect } from "@jest/globals";
import {
  configToEnvStrings,
  mergeSurveyEnv,
  validateSurveySettingsInput,
  createSurveyConfigProvider,
  SURVEY_SETTING_KEYS,
  type StoredSurveySettings,
} from "../settings.js";
import { DEFAULT_SURVEY_CONFIG, parseSurveyConfig } from "../config.js";

describe("Survey settings", () => {
  describe("configToEnvStrings", () => {
    it("converts DEFAULT_SURVEY_CONFIG to exact documented defaults", () => {
      const values = configToEnvStrings(DEFAULT_SURVEY_CONFIG);

      expect(values).toEqual({
        SURVEY_WORKDAYS: "mon,tue,wed,thu,fri,sat",
        SURVEY_WORK_START: "10:00",
        SURVEY_WORK_END: "18:00",
        SURVEY_BREAK_START: "13:00",
        SURVEY_BREAK_END: "14:00",
        SURVEY_DURATION_MINUTES: "60",
        SURVEY_BUFFER_MINUTES: "30",
        SURVEY_SLOT_STEP_MINUTES: "60",
        SURVEY_CONCURRENCY: "1",
        SURVEY_MIN_NOTICE_HOURS: "6",
        SURVEY_MAX_DAYS_AHEAD: "14",
        SURVEY_HOLIDAYS: "",
      });
    });

    it("round-trips parseSurveyConfig for default config", () => {
      const values = configToEnvStrings(DEFAULT_SURVEY_CONFIG);
      const { config, warnings } = parseSurveyConfig(values);

      expect(warnings).toEqual([]);
      expect(config).toEqual(DEFAULT_SURVEY_CONFIG);
    });

    it("round-trips parseSurveyConfig for config with null break", () => {
      const cfg = { ...DEFAULT_SURVEY_CONFIG, breakStartMin: null, breakEndMin: null };
      const values = configToEnvStrings(cfg);
      const { config, warnings } = parseSurveyConfig(values);

      expect(warnings).toEqual([]);
      expect(config).toEqual(cfg);
    });

    it("round-trips parseSurveyConfig for config with holidays", () => {
      const cfg = { ...DEFAULT_SURVEY_CONFIG, holidays: ["2026-11-08", "2026-12-25"] };
      const values = configToEnvStrings(cfg);
      const { config, warnings } = parseSurveyConfig(values);

      expect(warnings).toEqual([]);
      expect(config).toEqual(cfg);
    });
  });

  describe("mergeSurveyEnv", () => {
    it("override wins over env when non-empty", () => {
      const env = { SURVEY_DURATION_MINUTES: "60" };
      const stored = { SURVEY_DURATION_MINUTES: "90" };

      const merged = mergeSurveyEnv(env, stored);

      expect(merged.SURVEY_DURATION_MINUTES).toBe("90");
    });

    it("empty-string override is ignored, env used", () => {
      const env = { SURVEY_DURATION_MINUTES: "60" };
      const stored = { SURVEY_DURATION_MINUTES: "  " };

      const merged = mergeSurveyEnv(env, stored);

      expect(merged.SURVEY_DURATION_MINUTES).toBe("60");
    });

    it("unknown stored key is ignored", () => {
      const env = { SURVEY_DURATION_MINUTES: "60" };
      const stored = { UNKNOWN_KEY: "value" };

      const merged = mergeSurveyEnv(env, stored);

      expect(merged).not.toHaveProperty("UNKNOWN_KEY");
      expect(merged.SURVEY_DURATION_MINUTES).toBe("60");
    });

    it("non-SURVEY env keys are not copied", () => {
      const env = { OTHER_VAR: "foo", SURVEY_DURATION_MINUTES: "60" };
      const stored = {};

      const merged = mergeSurveyEnv(env, stored);

      expect(merged).not.toHaveProperty("OTHER_VAR");
      expect(merged.SURVEY_DURATION_MINUTES).toBe("60");
    });
  });

  describe("validateSurveySettingsInput", () => {
    const defaultValues = configToEnvStrings(DEFAULT_SURVEY_CONFIG);

    it("accepts the default values", () => {
      const result = validateSurveySettingsInput(defaultValues);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.config).toEqual(DEFAULT_SURVEY_CONFIG);
      }
    });

    it("rejects missing key", () => {
      const input = { ...defaultValues };
      delete (input as any).SURVEY_DURATION_MINUTES;

      const result = validateSurveySettingsInput(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("Missing key"))).toBe(true);
      }
    });

    it("rejects unknown key", () => {
      const input = { ...defaultValues, UNKNOWN_KEY: "value" };

      const result = validateSurveySettingsInput(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("Unknown key"))).toBe(true);
      }
    });

    it("rejects non-string value", () => {
      const input = { ...defaultValues, SURVEY_DURATION_MINUTES: 60 };

      const result = validateSurveySettingsInput(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("must be a string"))).toBe(true);
      }
    });

    it("rejects empty duration", () => {
      const input = { ...defaultValues, SURVEY_DURATION_MINUTES: "" };

      const result = validateSurveySettingsInput(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("cannot be empty"))).toBe(true);
      }
    });

    it('rejects "abc" duration', () => {
      const input = { ...defaultValues, SURVEY_DURATION_MINUTES: "abc" };

      const result = validateSurveySettingsInput(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("positive integer"))).toBe(true);
      }
    });

    it('rejects "5" duration (below min 15)', () => {
      const input = { ...defaultValues, SURVEY_DURATION_MINUTES: "5" };

      const result = validateSurveySettingsInput(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("SURVEY_DURATION_MINUTES invalid"))).toBe(
          true
        );
      }
    });

    it('rejects "9:00" time format', () => {
      const input = { ...defaultValues, SURVEY_WORK_START: "9:00" };

      const result = validateSurveySettingsInput(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("HH:MM format"))).toBe(true);
      }
    });

    it("rejects work end before start", () => {
      const input = { ...defaultValues, SURVEY_WORK_START: "18:00", SURVEY_WORK_END: "09:00" };

      const result = validateSurveySettingsInput(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("Work hours invalid"))).toBe(true);
      }
    });

    it("rejects break outside work hours", () => {
      const input = {
        ...defaultValues,
        SURVEY_WORK_START: "10:00",
        SURVEY_WORK_END: "18:00",
        SURVEY_BREAK_START: "08:00",
        SURVEY_BREAK_END: "09:00",
      };

      const result = validateSurveySettingsInput(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("Break outside work hours"))).toBe(true);
      }
    });

    it("rejects unknown workday", () => {
      const input = { ...defaultValues, SURVEY_WORKDAYS: "xyz" };

      const result = validateSurveySettingsInput(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("Unknown workday"))).toBe(true);
      }
    });

    it("rejects bad holiday date", () => {
      const input = { ...defaultValues, SURVEY_HOLIDAYS: "2026-13-40" };

      const result = validateSurveySettingsInput(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.includes("Invalid holiday date"))).toBe(true);
      }
    });

    it('accepts break "none"/"none"', () => {
      const input = { ...defaultValues, SURVEY_BREAK_START: "none", SURVEY_BREAK_END: "none" };

      const result = validateSurveySettingsInput(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.config.breakStartMin).toBeNull();
        expect(result.config.breakEndMin).toBeNull();
      }
    });

    it("sorts and de-duplicates holidays in output", () => {
      const input = {
        ...defaultValues,
        SURVEY_HOLIDAYS: "2026-12-25,2026-11-08,2026-12-25",
      };

      const result = validateSurveySettingsInput(input);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.config.holidays).toEqual(["2026-11-08", "2026-12-25"]);
        expect(result.values.SURVEY_HOLIDAYS).toBe("2026-11-08,2026-12-25");
      }
    });
  });

  describe("createSurveyConfigProvider", () => {
    it("first get loads", async () => {
      let loadCount = 0;
      const provider = createSurveyConfigProvider({
        env: {},
        loadStored: async () => {
          loadCount++;
          return null;
        },
        now: () => new Date("2026-10-20T00:00:00Z"),
        warn: () => {},
      });

      await provider.get();

      expect(loadCount).toBe(1);
    });

    it("second get within ttl does not reload", async () => {
      let loadCount = 0;
      const provider = createSurveyConfigProvider({
        env: {},
        loadStored: async () => {
          loadCount++;
          return null;
        },
        now: () => new Date("2026-10-20T00:00:00Z"),
        ttlMs: 30000,
        warn: () => {},
      });

      await provider.get();
      await provider.get();

      expect(loadCount).toBe(1);
    });

    it("after ttl reloads", async () => {
      let loadCount = 0;
      let time = new Date("2026-10-20T00:00:00Z").getTime();

      const provider = createSurveyConfigProvider({
        env: {},
        loadStored: async () => {
          loadCount++;
          return null;
        },
        now: () => new Date(time),
        ttlMs: 30000,
        warn: () => {},
      });

      await provider.get();

      time += 31000;

      await provider.get();

      expect(loadCount).toBe(2);
    });

    it("invalidate forces reload", async () => {
      let loadCount = 0;
      const provider = createSurveyConfigProvider({
        env: {},
        loadStored: async () => {
          loadCount++;
          return null;
        },
        now: () => new Date("2026-10-20T00:00:00Z"),
        warn: () => {},
      });

      await provider.get();

      provider.invalidate();

      await provider.get();

      expect(loadCount).toBe(2);
    });

    it("concurrent gets load once", async () => {
      let loadCount = 0;
      const provider = createSurveyConfigProvider({
        env: {},
        loadStored: async () => {
          loadCount++;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return null;
        },
        now: () => new Date("2026-10-20T00:00:00Z"),
        warn: () => {},
      });

      await Promise.all([provider.get(), provider.get(), provider.get()]);

      expect(loadCount).toBe(1);
    });

    it("loader throwing with no prior result gives source env and calls warn", async () => {
      let warnCalled = false;

      const provider = createSurveyConfigProvider({
        env: { SURVEY_DURATION_MINUTES: "90" },
        loadStored: async () => {
          throw new Error("DB error");
        },
        now: () => new Date("2026-10-20T00:00:00Z"),
        warn: () => {
          warnCalled = true;
        },
      });

      const result = await provider.get();

      expect(result.source).toBe("env");
      expect(result.config.durationMinutes).toBe(90);
      expect(warnCalled).toBe(true);
    });

    it("loader throwing after a good result returns the last good", async () => {
      let shouldThrow = false;
      const stored: StoredSurveySettings = {
        values: { SURVEY_DURATION_MINUTES: "90" },
        updatedAt: new Date("2026-10-19T00:00:00Z"),
        updatedBy: "admin",
      };

      const provider = createSurveyConfigProvider({
        env: {},
        loadStored: async () => {
          if (shouldThrow) {
            throw new Error("DB error");
          }
          return stored;
        },
        now: () => new Date("2026-10-20T00:00:00Z"),
        warn: () => {},
      });

      const first = await provider.get();

      expect(first.source).toBe("database");
      expect(first.config.durationMinutes).toBe(90);

      shouldThrow = true;
      provider.invalidate();

      const second = await provider.get();

      expect(second.source).toBe("database");
      expect(second.config.durationMinutes).toBe(90);
    });

    it("stored null gives source env", async () => {
      const provider = createSurveyConfigProvider({
        env: { SURVEY_DURATION_MINUTES: "90" },
        loadStored: async () => null,
        now: () => new Date("2026-10-20T00:00:00Z"),
        warn: () => {},
      });

      const result = await provider.get();

      expect(result.source).toBe("env");
      expect(result.config.durationMinutes).toBe(90);
    });

    it("stored values override env per key", async () => {
      const stored: StoredSurveySettings = {
        values: { SURVEY_DURATION_MINUTES: "90" },
        updatedAt: new Date("2026-10-19T00:00:00Z"),
        updatedBy: "admin",
      };

      const provider = createSurveyConfigProvider({
        env: { SURVEY_DURATION_MINUTES: "60", SURVEY_BUFFER_MINUTES: "30" },
        loadStored: async () => stored,
        now: () => new Date("2026-10-20T00:00:00Z"),
        warn: () => {},
      });

      const result = await provider.get();

      expect(result.source).toBe("database");
      expect(result.config.durationMinutes).toBe(90);
      expect(result.config.bufferMinutes).toBe(30);
    });
  });
});

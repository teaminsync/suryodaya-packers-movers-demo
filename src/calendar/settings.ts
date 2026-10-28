/**
 * Survey settings: pure config manipulation, validation, and provider with caching
 */

import type { SurveyConfig } from "./config.js";
import { parseSurveyConfig } from "./config.js";

export const SURVEY_SETTING_KEYS = [
  "SURVEY_WORKDAYS",
  "SURVEY_WORK_START",
  "SURVEY_WORK_END",
  "SURVEY_BREAK_START",
  "SURVEY_BREAK_END",
  "SURVEY_DURATION_MINUTES",
  "SURVEY_BUFFER_MINUTES",
  "SURVEY_SLOT_STEP_MINUTES",
  "SURVEY_CONCURRENCY",
  "SURVEY_MIN_NOTICE_HOURS",
  "SURVEY_MAX_DAYS_AHEAD",
  "SURVEY_HOLIDAYS",
] as const;

export type StoredSurveySettings = {
  values: Record<string, string>;
  updatedAt: Date | string;
  updatedBy: string | null;
};

export type EffectiveSurveySettings = {
  config: SurveyConfig;
  source: "database" | "env";
  warnings: string[];
  updatedAt: string | null;
  updatedBy: string | null;
};

const WORKDAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * Convert a SurveyConfig to canonical env-style strings
 */
export function configToEnvStrings(cfg: SurveyConfig): Record<string, string> {
  const workdaysStr = cfg.workdays
    .map((day) => WORKDAY_NAMES[day - 1])
    .sort((a, b) => {
      const aIdx = WORKDAY_NAMES.indexOf(a);
      const bIdx = WORKDAY_NAMES.indexOf(b);
      return aIdx - bIdx;
    })
    .join(",");

  function timeToStr(min: number): string {
    const hh = String(Math.floor(min / 60)).padStart(2, "0");
    const mm = String(min % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  const breakStart = cfg.breakStartMin === null ? "none" : timeToStr(cfg.breakStartMin);
  const breakEnd = cfg.breakEndMin === null ? "none" : timeToStr(cfg.breakEndMin);

  const sortedHolidays = [...cfg.holidays].sort();

  return {
    SURVEY_WORKDAYS: workdaysStr,
    SURVEY_WORK_START: timeToStr(cfg.workStartMin),
    SURVEY_WORK_END: timeToStr(cfg.workEndMin),
    SURVEY_BREAK_START: breakStart,
    SURVEY_BREAK_END: breakEnd,
    SURVEY_DURATION_MINUTES: String(cfg.durationMinutes),
    SURVEY_BUFFER_MINUTES: String(cfg.bufferMinutes),
    SURVEY_SLOT_STEP_MINUTES: String(cfg.stepMinutes),
    SURVEY_CONCURRENCY: String(cfg.concurrency),
    SURVEY_MIN_NOTICE_HOURS: String(cfg.minNoticeHours),
    SURVEY_MAX_DAYS_AHEAD: String(cfg.maxDaysAhead),
    SURVEY_HOLIDAYS: sortedHolidays.join(","),
  };
}

/**
 * Merge env and stored values: stored strings override when non-empty
 */
export function mergeSurveyEnv(
  env: Record<string, string | undefined>,
  stored: Record<string, string>
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};

  for (const key of SURVEY_SETTING_KEYS) {
    const envVal = env[key];
    const storedVal = stored[key];

    if (typeof storedVal === "string" && storedVal.trim() !== "") {
      result[key] = storedVal;
    } else if (envVal !== undefined) {
      result[key] = envVal;
    }
  }

  return result;
}

/**
 * Validate user input for survey settings
 */
export function validateSurveySettingsInput(
  input: unknown
):
  | { ok: true; config: SurveyConfig; values: Record<string, string> }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    errors.push("Input must be a plain object");
    return { ok: false, errors };
  }

  const obj = input as Record<string, unknown>;
  const keys = Object.keys(obj);

  const expectedSet = new Set(SURVEY_SETTING_KEYS);
  const actualSet = new Set(keys);

  for (const key of keys) {
    if (!expectedSet.has(key as any)) {
      errors.push(`Unknown key: ${key}`);
    }
  }

  for (const key of SURVEY_SETTING_KEYS) {
    if (!actualSet.has(key)) {
      errors.push(`Missing key: ${key}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const values: Record<string, string> = {};

  for (const key of SURVEY_SETTING_KEYS) {
    const value = obj[key];

    if (typeof value !== "string") {
      errors.push(`${key} must be a string`);
      continue;
    }

    const trimmed = value.trim();

    if (trimmed.length > 2000) {
      errors.push(`${key} exceeds 2000 characters`);
      continue;
    }

    if (key !== "SURVEY_HOLIDAYS" && trimmed === "") {
      errors.push(`${key} cannot be empty`);
      continue;
    }

    values[key] = trimmed;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Validate numeric fields
  const numericKeys: Array<keyof typeof values> = [
    "SURVEY_DURATION_MINUTES",
    "SURVEY_BUFFER_MINUTES",
    "SURVEY_SLOT_STEP_MINUTES",
    "SURVEY_CONCURRENCY",
    "SURVEY_MIN_NOTICE_HOURS",
    "SURVEY_MAX_DAYS_AHEAD",
  ];

  for (const key of numericKeys) {
    const val = values[key];
    if (!/^\d+$/.test(val)) {
      errors.push(`${key} must be a positive integer`);
    }
  }

  // Validate time fields
  const timeKeys: Array<keyof typeof values> = ["SURVEY_WORK_START", "SURVEY_WORK_END"];
  for (const key of timeKeys) {
    const val = values[key];
    if (!/^\d{2}:\d{2}$/.test(val)) {
      errors.push(`${key} must match HH:MM format`);
    }
  }

  // Validate break fields
  for (const key of ["SURVEY_BREAK_START", "SURVEY_BREAK_END"] as const) {
    const val = values[key];
    if (val !== "none" && !/^\d{2}:\d{2}$/.test(val)) {
      errors.push(`${key} must be "none" or match HH:MM format`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Use parseSurveyConfig to enforce all range checks
  const { config, warnings } = parseSurveyConfig(values);

  if (warnings.length > 0) {
    return { ok: false, errors: warnings };
  }

  // Sort and deduplicate holidays
  const sortedHolidays = [...new Set(config.holidays)].sort();
  const finalConfig: SurveyConfig = { ...config, holidays: sortedHolidays };

  // Return canonical values
  const canonicalValues = configToEnvStrings(finalConfig);

  return { ok: true, config: finalConfig, values: canonicalValues };
}

interface SurveyConfigProviderDeps {
  env: Record<string, string | undefined>;
  loadStored(): Promise<StoredSurveySettings | null>;
  now(): Date;
  ttlMs?: number;
  warn(msg: string, detail?: unknown): void;
}

/**
 * Create a cached survey config provider
 */
export function createSurveyConfigProvider(deps: SurveyConfigProviderDeps) {
  const ttl = deps.ttlMs ?? 30000;
  let cache: { result: EffectiveSurveySettings; expiresAt: number } | null = null;
  let lastGood: EffectiveSurveySettings | null = null;
  let inFlight: Promise<EffectiveSurveySettings> | null = null;

  function buildEnvResult(): EffectiveSurveySettings {
    const merged = mergeSurveyEnv(deps.env, {});
    const { config, warnings } = parseSurveyConfig(merged);
    return {
      config,
      source: "env",
      warnings,
      updatedAt: null,
      updatedBy: null,
    };
  }

  async function load(): Promise<EffectiveSurveySettings> {
    let stored: StoredSurveySettings | null;

    try {
      stored = await deps.loadStored();
    } catch (error) {
      if (lastGood !== null) {
        deps.warn("Failed to load stored settings, using last known", error);
        cache = {
          result: lastGood,
          expiresAt: deps.now().getTime() + 5000,
        };
        return lastGood;
      } else {
        deps.warn("Failed to load stored settings, using env", error);
        const envResult = buildEnvResult();
        cache = { result: envResult, expiresAt: deps.now().getTime() + 5000 };
        return envResult;
      }
    }

    let result: EffectiveSurveySettings;

    if (stored === null) {
      result = buildEnvResult();
    } else {
      const merged = mergeSurveyEnv(deps.env, stored.values);
      const { config, warnings } = parseSurveyConfig(merged);

      const updatedAtStr =
        stored.updatedAt instanceof Date
          ? stored.updatedAt.toISOString()
          : new Date(stored.updatedAt).toISOString();

      result = {
        config,
        source: "database",
        warnings,
        updatedAt: updatedAtStr,
        updatedBy: stored.updatedBy,
      };
    }

    lastGood = result;
    cache = { result, expiresAt: deps.now().getTime() + ttl };
    return result;
  }

  return {
    async get(): Promise<EffectiveSurveySettings> {
      const nowMs = deps.now().getTime();

      if (cache !== null && nowMs < cache.expiresAt) {
        return cache.result;
      }

      if (inFlight !== null) {
        return inFlight;
      }

      inFlight = load();

      try {
        return await inFlight;
      } finally {
        inFlight = null;
      }
    },

    invalidate(): void {
      cache = null;
    },
  };
}

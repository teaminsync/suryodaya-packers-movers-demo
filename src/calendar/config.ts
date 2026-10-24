/**
 * Survey scheduling configuration with validation
 */

export interface SurveyConfig {
  durationMinutes: number;
  bufferMinutes: number;
  workdays: number[]; // 1=Mon..7=Sun
  workStartMin: number; // minutes from midnight
  workEndMin: number;
  breakStartMin: number | null;
  breakEndMin: number | null;
  stepMinutes: number;
  minNoticeHours: number;
  maxDaysAhead: number;
  concurrency: number;
  holidays: string[]; // YYYY-MM-DD
}

export const DEFAULT_SURVEY_CONFIG: SurveyConfig = {
  durationMinutes: 60,
  bufferMinutes: 30,
  workdays: [1, 2, 3, 4, 5, 6],
  workStartMin: 600, // 10:00
  workEndMin: 1080, // 18:00
  breakStartMin: 780, // 13:00
  breakEndMin: 840, // 14:00
  stepMinutes: 60,
  minNoticeHours: 6,
  maxDaysAhead: 14,
  concurrency: 1,
  holidays: [],
};

function parseNumber(
  value: string | undefined,
  min: number,
  max: number,
  defaultValue: number,
  warnings: string[],
  name: string
): number {
  if (!value || value.trim() === "") return defaultValue;
  const num = Number(value);
  if (isNaN(num) || num < min || num > max) {
    warnings.push(`${name} invalid ("${value}"), using default ${defaultValue}`);
    return defaultValue;
  }
  return num;
}

function parseTimeToMinutes(value: string | undefined): number | null {
  if (!value || value.trim() === "" || value.trim().toLowerCase() === "none") {
    return null;
  }
  const parts = value.split(":");
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

function parseWorkdays(
  value: string | undefined,
  warnings: string[]
): number[] {
  if (!value || value.trim() === "") {
    return DEFAULT_SURVEY_CONFIG.workdays;
  }

  const nameMap: Record<string, number> = {
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
    sun: 7,
  };

  const names = value.split(",").map((s) => s.trim().toLowerCase());
  const days: number[] = [];

  for (const name of names) {
    if (nameMap[name] !== undefined) {
      days.push(nameMap[name]);
    } else if (name !== "") {
      warnings.push(`Unknown workday name "${name}", ignoring`);
    }
  }

  if (days.length === 0) {
    warnings.push(`No valid workdays found, using defaults`);
    return DEFAULT_SURVEY_CONFIG.workdays;
  }

  return days.sort((a, b) => a - b);
}

function parseHolidays(value: string | undefined, warnings: string[]): string[] {
  if (!value || value.trim() === "") return [];

  const dates = value.split(",").map((s) => s.trim());
  const valid: string[] = [];

  for (const date of dates) {
    if (date === "") continue;
    // Check format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      warnings.push(`Invalid holiday date "${date}", ignoring`);
      continue;
    }
    // Check it's a real calendar date
    const [y, m, d] = date.split("-").map(Number);
    const testDate = new Date(Date.UTC(y, m - 1, d));
    if (
      testDate.getUTCFullYear() !== y ||
      testDate.getUTCMonth() + 1 !== m ||
      testDate.getUTCDate() !== d
    ) {
      warnings.push(`Invalid holiday date "${date}", ignoring`);
      continue;
    }
    valid.push(date);
  }

  return valid;
}

export function parseSurveyConfig(
  env: Record<string, string | undefined>
): { config: SurveyConfig; warnings: string[] } {
  const warnings: string[] = [];

  const durationMinutes = parseNumber(
    env.SURVEY_DURATION_MINUTES,
    15,
    240,
    DEFAULT_SURVEY_CONFIG.durationMinutes,
    warnings,
    "SURVEY_DURATION_MINUTES"
  );

  const bufferMinutes = parseNumber(
    env.SURVEY_BUFFER_MINUTES,
    0,
    120,
    DEFAULT_SURVEY_CONFIG.bufferMinutes,
    warnings,
    "SURVEY_BUFFER_MINUTES"
  );

  const workdays = parseWorkdays(env.SURVEY_WORKDAYS, warnings);

  const workStartMin = parseTimeToMinutes(env.SURVEY_WORK_START);
  const workEndMin = parseTimeToMinutes(env.SURVEY_WORK_END);

  let finalWorkStart = DEFAULT_SURVEY_CONFIG.workStartMin;
  let finalWorkEnd = DEFAULT_SURVEY_CONFIG.workEndMin;

  if (
    workStartMin !== null &&
    workEndMin !== null &&
    workEndMin > workStartMin
  ) {
    finalWorkStart = workStartMin;
    finalWorkEnd = workEndMin;
  } else if (workStartMin !== null || workEndMin !== null) {
    warnings.push(
      `Work hours invalid, using defaults ${DEFAULT_SURVEY_CONFIG.workStartMin} and ${DEFAULT_SURVEY_CONFIG.workEndMin}`
    );
  }

  const breakStartMinRaw = parseTimeToMinutes(env.SURVEY_BREAK_START);
  const breakEndMinRaw = parseTimeToMinutes(env.SURVEY_BREAK_END);

  let breakStartMin: number | null = DEFAULT_SURVEY_CONFIG.breakStartMin;
  let breakEndMin: number | null = DEFAULT_SURVEY_CONFIG.breakEndMin;

  // Only disable break if explicitly set to "none" or if one is provided but the other isn't
  const hasBreakStart = env.SURVEY_BREAK_START !== undefined && env.SURVEY_BREAK_START.trim() !== "";
  const hasBreakEnd = env.SURVEY_BREAK_END !== undefined && env.SURVEY_BREAK_END.trim() !== "";

  if (hasBreakStart && breakStartMinRaw === null) {
    // Explicit "none" or invalid for start
    breakStartMin = null;
    breakEndMin = null;
  } else if (hasBreakEnd && breakEndMinRaw === null) {
    // Explicit "none" or invalid for end
    breakStartMin = null;
    breakEndMin = null;
  } else if (hasBreakStart && hasBreakEnd && breakStartMinRaw !== null && breakEndMinRaw !== null) {
    // Both provided and valid, check if within work hours
    if (
      breakStartMinRaw >= finalWorkStart &&
      breakEndMinRaw <= finalWorkEnd &&
      breakEndMinRaw > breakStartMinRaw
    ) {
      breakStartMin = breakStartMinRaw;
      breakEndMin = breakEndMinRaw;
    } else {
      warnings.push(
        `Break outside work hours or invalid, using defaults ${DEFAULT_SURVEY_CONFIG.breakStartMin} and ${DEFAULT_SURVEY_CONFIG.breakEndMin}`
      );
    }
  }
  // else: neither provided, use defaults (already set above)

  const stepMinutes = parseNumber(
    env.SURVEY_SLOT_STEP_MINUTES,
    15,
    240,
    DEFAULT_SURVEY_CONFIG.stepMinutes,
    warnings,
    "SURVEY_SLOT_STEP_MINUTES"
  );

  const minNoticeHours = parseNumber(
    env.SURVEY_MIN_NOTICE_HOURS,
    0,
    168,
    DEFAULT_SURVEY_CONFIG.minNoticeHours,
    warnings,
    "SURVEY_MIN_NOTICE_HOURS"
  );

  const maxDaysAhead = parseNumber(
    env.SURVEY_MAX_DAYS_AHEAD,
    1,
    60,
    DEFAULT_SURVEY_CONFIG.maxDaysAhead,
    warnings,
    "SURVEY_MAX_DAYS_AHEAD"
  );

  const concurrency = parseNumber(
    env.SURVEY_CONCURRENCY,
    1,
    10,
    DEFAULT_SURVEY_CONFIG.concurrency,
    warnings,
    "SURVEY_CONCURRENCY"
  );

  const holidays = parseHolidays(env.SURVEY_HOLIDAYS, warnings);

  const config: SurveyConfig = {
    durationMinutes,
    bufferMinutes,
    workdays,
    workStartMin: finalWorkStart,
    workEndMin: finalWorkEnd,
    breakStartMin,
    breakEndMin,
    stepMinutes,
    minNoticeHours,
    maxDaysAhead,
    concurrency,
    holidays,
  };

  return { config, warnings };
}

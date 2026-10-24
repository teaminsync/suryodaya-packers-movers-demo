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
  if (!value || value.trim() === "") {
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

  const rawStart = (env.SURVEY_BREAK_START ?? "").trim();
  const rawEnd = (env.SURVEY_BREAK_END ?? "").trim();

  let breakStartMin: number | null;
  let breakEndMin: number | null;

  if (rawStart.toLowerCase() === "none" || rawEnd.toLowerCase() === "none") {
    breakStartMin = null;
    breakEndMin = null;
  } else if (rawStart === "" && rawEnd === "") {
    // Both empty, use defaults with no validation and no warning
    breakStartMin = DEFAULT_SURVEY_CONFIG.breakStartMin;
    breakEndMin = DEFAULT_SURVEY_CONFIG.breakEndMin;
  } else {
    // At least one is non-empty
    let start = 780; // default 13:00
    let end = 840; // default 14:00

    if (rawStart !== "") {
      const parsed = parseTimeToMinutes(rawStart);
      if (parsed === null) {
        warnings.push(`SURVEY_BREAK_START invalid ("${rawStart}"), using default 13:00`);
      } else {
        start = parsed;
      }
    }

    if (rawEnd !== "") {
      const parsed = parseTimeToMinutes(rawEnd);
      if (parsed === null) {
        warnings.push(`SURVEY_BREAK_END invalid ("${rawEnd}"), using default 14:00`);
      } else {
        end = parsed;
      }
    }

    // Validate only when at least one was provided
    if (start >= finalWorkStart && end <= finalWorkEnd && end > start) {
      breakStartMin = start;
      breakEndMin = end;
    } else {
      warnings.push("Break outside work hours or invalid, using defaults 13:00 and 14:00");
      breakStartMin = 780;
      breakEndMin = 840;
    }
  }

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

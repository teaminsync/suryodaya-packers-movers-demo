/**
 * Automation config parser - pure, no side effects
 */

export interface AutomationConfig {
  enabled: boolean;
  dryRun: boolean;
  tickMinutes: number;
  dailyCap: number;
  sendFromHour: number;
  sendUntilHour: number;
  nudgeInWindowHours: number;
  nudgeTemplateHours: number;
  missingDetailsHours: number;
  reminderHoursBefore: number;
  reminderLateHours: number;
  maxNudges: number;
}

export const DEFAULT_AUTOMATION_CONFIG: AutomationConfig = {
  enabled: false,
  dryRun: false,
  tickMinutes: 5,
  dailyCap: 20,
  sendFromHour: 9,
  sendUntilHour: 20,
  nudgeInWindowHours: 22,
  nudgeTemplateHours: 48,
  missingDetailsHours: 3,
  reminderHoursBefore: 24,
  reminderLateHours: 3,
  maxNudges: 2,
};

function parseBoolean(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function parseInteger(value: string | undefined, min: number, max: number, defaultValue: number, key: string, warnings: string[]): number {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }
  const parsed = parseInt(value.trim(), 10);
  if (isNaN(parsed) || parsed < min || parsed > max) {
    warnings.push(key);
    return defaultValue;
  }
  return parsed;
}

function parseNumber(value: string | undefined, min: number, max: number, defaultValue: number, key: string, warnings: string[]): number {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }
  const parsed = parseFloat(value.trim());
  if (isNaN(parsed) || parsed < min || parsed > max) {
    warnings.push(key);
    return defaultValue;
  }
  return parsed;
}

export function parseAutomationConfig(env: Record<string, string | undefined>): { config: AutomationConfig; warnings: string[] } {
  const warnings: string[] = [];

  const enabled = parseBoolean(env.FOLLOWUPS_ENABLED);
  const dryRun = parseBoolean(env.FOLLOWUPS_DRY_RUN);
  const tickMinutes = parseInteger(env.FOLLOWUPS_TICK_MINUTES, 1, 60, DEFAULT_AUTOMATION_CONFIG.tickMinutes, "FOLLOWUPS_TICK_MINUTES", warnings);
  const dailyCap = parseInteger(env.FOLLOWUPS_DAILY_CAP, 1, 500, DEFAULT_AUTOMATION_CONFIG.dailyCap, "FOLLOWUPS_DAILY_CAP", warnings);
  let sendFromHour = parseInteger(env.FOLLOWUPS_SEND_FROM_HOUR, 0, 23, DEFAULT_AUTOMATION_CONFIG.sendFromHour, "FOLLOWUPS_SEND_FROM_HOUR", warnings);
  let sendUntilHour = parseInteger(env.FOLLOWUPS_SEND_UNTIL_HOUR, 1, 24, DEFAULT_AUTOMATION_CONFIG.sendUntilHour, "FOLLOWUPS_SEND_UNTIL_HOUR", warnings);
  const nudgeInWindowHours = parseNumber(env.FOLLOWUPS_NUDGE_INWINDOW_HOURS, 0.01, 23, DEFAULT_AUTOMATION_CONFIG.nudgeInWindowHours, "FOLLOWUPS_NUDGE_INWINDOW_HOURS", warnings);
  const nudgeTemplateHours = parseNumber(env.FOLLOWUPS_NUDGE_TEMPLATE_HOURS, 24.01, 168, DEFAULT_AUTOMATION_CONFIG.nudgeTemplateHours, "FOLLOWUPS_NUDGE_TEMPLATE_HOURS", warnings);
  const missingDetailsHours = parseNumber(env.FOLLOWUPS_MISSING_DETAILS_HOURS, 0.01, 23, DEFAULT_AUTOMATION_CONFIG.missingDetailsHours, "FOLLOWUPS_MISSING_DETAILS_HOURS", warnings);
  let reminderHoursBefore = parseNumber(env.FOLLOWUPS_REMINDER_HOURS_BEFORE, 1, 168, DEFAULT_AUTOMATION_CONFIG.reminderHoursBefore, "FOLLOWUPS_REMINDER_HOURS_BEFORE", warnings);
  let reminderLateHours = parseNumber(env.FOLLOWUPS_REMINDER_LATE_HOURS, 0.01, 24, DEFAULT_AUTOMATION_CONFIG.reminderLateHours, "FOLLOWUPS_REMINDER_LATE_HOURS", warnings);
  const maxNudges = parseInteger(env.FOLLOWUPS_MAX_NUDGES, 1, 5, DEFAULT_AUTOMATION_CONFIG.maxNudges, "FOLLOWUPS_MAX_NUDGES", warnings);

  // Cross-checks
  if (sendUntilHour <= sendFromHour) {
    warnings.push("FOLLOWUPS_SEND_UNTIL_HOUR must be greater than FOLLOWUPS_SEND_FROM_HOUR");
    sendFromHour = DEFAULT_AUTOMATION_CONFIG.sendFromHour;
    sendUntilHour = DEFAULT_AUTOMATION_CONFIG.sendUntilHour;
  }

  if (reminderLateHours >= reminderHoursBefore) {
    warnings.push("FOLLOWUPS_REMINDER_LATE_HOURS must be less than FOLLOWUPS_REMINDER_HOURS_BEFORE");
    reminderHoursBefore = DEFAULT_AUTOMATION_CONFIG.reminderHoursBefore;
    reminderLateHours = DEFAULT_AUTOMATION_CONFIG.reminderLateHours;
  }

  return {
    config: {
      enabled,
      dryRun,
      tickMinutes,
      dailyCap,
      sendFromHour,
      sendUntilHour,
      nudgeInWindowHours,
      nudgeTemplateHours,
      missingDetailsHours,
      reminderHoursBefore,
      reminderLateHours,
      maxNudges,
    },
    warnings,
  };
}

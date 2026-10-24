/**
 * Database-wired survey calendar instance
 */

import * as fs from "fs";
import { parseSurveyConfig } from "./config.js";
import { parseServiceAccount } from "./credentials.js";
import { createGoogleAuth } from "./google-auth.js";
import { createCalendarClient } from "./google-client.js";
import { createSurveyCalendar } from "./survey-calendar.js";
import { buildSurveyEventContent } from "./event-content.js";
import { loadAdminEventBase } from "../notify/notify-db.js";
import { generateSlotOptions } from "../flows/booking.js";

// Parse survey config
const { config, warnings } = parseSurveyConfig(process.env);
warnings.forEach((w) => console.log(w));

// Load service account credentials
let credentials: { client_email: string; private_key: string } | null = null;

const keyFilePath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

if (keyFilePath) {
  try {
    const keyContent = fs.readFileSync(keyFilePath, "utf-8");
    credentials = parseServiceAccount(keyContent);
  } catch (error) {
    console.log("[Calendar] Could not read the service account key file");
  }
} else if (keyJson) {
  try {
    credentials = parseServiceAccount(keyJson);
  } catch (error) {
    const message = (error as Error).message;
    console.log("[Calendar] Failed to parse service account JSON:", message);
  }
}

// Create calendar client if configured
const calendarId = process.env.GOOGLE_CALENDAR_ID;
const calendar =
  calendarId && credentials
    ? (() => {
        const auth = createGoogleAuth({
          account: credentials,
          fetchFn: fetch,
          now: () => new Date(),
        });

        return createCalendarClient({
          calendarId,
          getAccessToken: auth.getAccessToken.bind(auth),
          fetchFn: fetch,
        });
      })()
    : null;

// Static slots (example times)
function staticSlots(_now: Date): Array<{ label: string; datetime: string }> {
  const options = generateSlotOptions();
  return options.map((opt) => ({
    label: opt.label,
    datetime: opt.datetime,
  }));
}

// Build event content from lead
async function buildEventContent(leadId: string): Promise<{
  summary: string;
  description: string;
  location: string | null;
}> {
  const dashboardBaseUrl = process.env.DASHBOARD_BASE_URL || null;
  const base = await loadAdminEventBase(leadId);

  if (!base) {
    return {
      summary: "Survey",
      description: "Booked by the AI assistant",
      location: null,
    };
  }

  return buildSurveyEventContent(base, dashboardBaseUrl);
}

// Create the survey calendar
export const surveyCalendar = createSurveyCalendar({
  config,
  calendar,
  staticSlots,
  buildEventContent,
});

// Describe the calendar setup
export function describeCalendar(): string {
  const parts: string[] = [];

  parts.push(`google=${calendar ? "on" : "off"}`);

  if (calendar) {
    const workdaysStr = config.workdays.join(",");
    parts.push(`workdays=${workdaysStr}`);

    const startHH = String(Math.floor(config.workStartMin / 60)).padStart(2, "0");
    const startMM = String(config.workStartMin % 60).padStart(2, "0");
    const endHH = String(Math.floor(config.workEndMin / 60)).padStart(2, "0");
    const endMM = String(config.workEndMin % 60).padStart(2, "0");
    parts.push(`hours=${startHH}:${startMM}-${endHH}:${endMM}`);
  } else {
    parts.push("(fixed example times)");
  }

  return parts.join(" ");
}

/**
 * Database-wired survey booking dependencies
 */

import { surveyCalendar } from "../calendar/calendar-db.js";
import type { SurveyBookingDeps } from "./survey-booking.js";

export const surveyBookingDeps: SurveyBookingDeps = {
  getSlotOptions: (now) => surveyCalendar.getSlotOptions(now),
  claimSlot: (input) => surveyCalendar.claimSlot(input),
};

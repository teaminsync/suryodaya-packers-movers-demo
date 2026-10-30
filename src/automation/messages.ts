/**
 * Message builders for automated follow-ups - pure, no I/O
 */

import { firstName, sanitizeTemplateValue, TEMPLATE_LANGUAGE } from "../outreach/messages.js";
import { formatSlotLabel, toIstParts } from "../calendar/ist.js";

export const TEMPLATE_SURVEY_REMINDER = "survey_reminder";
export const TEMPLATE_ENQUIRY_NUDGE = "enquiry_nudge";
export const TEMPLATE_MISSING_DETAILS = "missing_details_prompt";

export const PAYLOAD_NUDGE_SHOW_TIMES = "nudge_show_times";
export const PAYLOAD_NUDGE_NOT_NOW = "nudge_not_now";
export const PAYLOAD_NUDGE_STOP = "nudge_stop";
export const PAYLOAD_REMINDER_CONFIRM = "reminder_confirm";
export const PAYLOAD_REMINDER_CHANGE = "reminder_change";
export const PAYLOAD_MISSING_TALK_HUMAN = "missing_talk_human";

export type ActionKind = "nudge_inwindow" | "nudge_template" | "missing_details" | "survey_reminder" | "survey_morning";

export const KIND_LABELS: Record<ActionKind, string> = {
  nudge_inwindow: "Check-in message",
  nudge_template: "Follow-up template message (billed)",
  missing_details: "Ask for missing details",
  survey_reminder: "Survey reminder",
  survey_morning: "Survey morning reminder",
};

export function buildNudgeText(input: { contactName: string | null; origin: string | null; destination: string | null }): string {
  const first = firstName(input.contactName) ?? "there";

  let route: string;
  if (input.origin && input.origin.trim() !== "" && input.destination && input.destination.trim() !== "") {
    route = `${input.origin} to ${input.destination} move enquiry`;
  } else {
    route = "moving enquiry";
  }

  return `Hi ${first}, just checking in on your ${route} with Suryodaya Packers & Movers. Would you like me to send the available times for a free on-site survey? Reply YES and I'll send them, or tell me if now isn't a good time.`;
}

export function buildMissingDetailsText(input: { contactName: string | null; labels: string[] }): string {
  const first = firstName(input.contactName) ?? "there";
  const list = joinList(input.labels);

  return `Hi ${first}, to prepare your estimate I still need a few details: ${list}. Please reply here when you can.`;
}

export function joinList(items: string[]): string {
  if (items.length === 0) {
    return "";
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  const last = items[items.length - 1];
  const rest = items.slice(0, -1).join(", ");
  return `${rest} and ${last}`;
}

export function buildReminderText(input: { contactName: string | null; startsAt: Date }): string {
  const first = firstName(input.contactName) ?? "there";
  const label = formatSlotLabel(input.startsAt);

  return `Hi ${first}, a reminder that your free on-site survey with Suryodaya Packers & Movers is booked for ${label}. Our surveyor will spend about 15-30 minutes confirming your itemised quote. Need a different time? Just reply here.`;
}

export function buildMorningText(input: { contactName: string | null; startsAt: Date }): string {
  const first = firstName(input.contactName) ?? "there";
  const parts = toIstParts(input.startsAt);

  let hour12 = parts.hour % 12;
  if (hour12 === 0) hour12 = 12;
  const ampm = parts.hour < 12 ? "AM" : "PM";
  const timeText = `${hour12}:${String(parts.minute).padStart(2, "0")} ${ampm}`;

  return `Good morning ${first}, your free on-site survey is today at ${timeText}. Reply here if anything has changed.`;
}

interface TemplateResult {
  templateName: string;
  languageCode: string;
  bodyParams: string[];
  buttonPayloads: string[];
  renderedText: string;
}

export function buildReminderTemplate(input: { contactName: string | null; startsAt: Date }): TemplateResult {
  const first = sanitizeTemplateValue(firstName(input.contactName) ?? "there");
  const label = sanitizeTemplateValue(formatSlotLabel(input.startsAt));

  return {
    templateName: TEMPLATE_SURVEY_REMINDER,
    languageCode: TEMPLATE_LANGUAGE,
    bodyParams: [first, label],
    buttonPayloads: [PAYLOAD_REMINDER_CONFIRM, PAYLOAD_REMINDER_CHANGE],
    renderedText: `Hi {1}, this is a reminder from Suryodaya Packers & Movers that your free on-site survey is booked for {2}. Our surveyor will spend about 15-30 minutes confirming your itemised quote. Need a different time? Tap below or just reply here.`
      .replace("{1}", first)
      .replace("{2}", label),
  };
}

export function buildNudgeTemplate(input: { contactName: string | null; origin: string | null; destination: string | null }): TemplateResult {
  const first = sanitizeTemplateValue(firstName(input.contactName) ?? "there");

  let route: string;
  if (input.origin && input.origin.trim() !== "" && input.destination && input.destination.trim() !== "") {
    route = sanitizeTemplateValue(`${input.origin} to ${input.destination}`);
  } else {
    route = "recent";
  }

  return {
    templateName: TEMPLATE_ENQUIRY_NUDGE,
    languageCode: TEMPLATE_LANGUAGE,
    bodyParams: [first, route],
    buttonPayloads: [PAYLOAD_NUDGE_SHOW_TIMES, PAYLOAD_NUDGE_NOT_NOW, PAYLOAD_NUDGE_STOP],
    renderedText: `Hi {1}, a quick follow-up on your {2} move enquiry with Suryodaya Packers & Movers. We can arrange a free on-site survey and send an itemised quote. Would you like to see available times?`
      .replace("{1}", first)
      .replace("{2}", route),
  };
}

export function buildMissingDetailsTemplate(input: { contactName: string | null; labels: string[] }): TemplateResult {
  const first = sanitizeTemplateValue(firstName(input.contactName) ?? "there");
  const list = sanitizeTemplateValue(joinList(input.labels));

  return {
    templateName: TEMPLATE_MISSING_DETAILS,
    languageCode: TEMPLATE_LANGUAGE,
    bodyParams: [first, list],
    buttonPayloads: [PAYLOAD_MISSING_TALK_HUMAN],
    renderedText: `Hi {1}, thanks for your moving enquiry with Suryodaya Packers & Movers. To prepare your estimate we still need a few details: {2}. Please reply here when you can.`
      .replace("{1}", first)
      .replace("{2}", list),
  };
}

export function isAffirmativeReply(text: string): boolean {
  let normalized = text.toLowerCase();
  
  // Curly quotes to straight
  normalized = normalized.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  
  normalized = normalized.trim();
  
  // Strip leading/trailing punctuation
  while (normalized.length > 0) {
    const first = normalized[0];
    if ([" ", "'", '"', ".", "!", ",", "?"].includes(first)) {
      normalized = normalized.slice(1);
    } else {
      break;
    }
  }
  
  while (normalized.length > 0) {
    const last = normalized[normalized.length - 1];
    if ([" ", "'", '"', ".", "!", ",", "?"].includes(last)) {
      normalized = normalized.slice(0, -1);
    } else {
      break;
    }
  }
  
  normalized = normalized.trim();
  
  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, " ");
  
  if (normalized === "" || normalized.length > 30) {
    return false;
  }
  
  const matches = [
    "yes",
    "yeah",
    "yep",
    "yup",
    "sure",
    "ok",
    "okay",
    "please",
    "yes please",
    "yes pls",
    "sure please",
    "ok please",
    "send times",
    "show times",
    "show me times",
    "times",
    "send them",
  ];
  
  return matches.includes(normalized);
}

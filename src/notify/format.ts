/**
 * Format admin alert messages for email and WhatsApp
 */

import type { AdminEvent, AdminEventType } from "./types.js";
import { sanitizeTemplateValue } from "../outreach/messages.js";

export function eventLabel(type: AdminEventType): string {
  switch (type) {
    case "booking_confirmed":
      return "Survey booked";
    case "human_requested":
      return "Customer wants a human";
    case "needs_followup":
      return "Needs team follow-up";
  }
}

export function sourceLabel(source: string | null): string {
  if (!source || source.trim() === "") {
    return "Unknown";
  }

  switch (source.toLowerCase()) {
    case "whatsapp":
      return "WhatsApp";
    case "instagram":
      return "Instagram";
    case "indiamart":
      return "IndiaMART";
    default:
      return source.charAt(0).toUpperCase() + source.slice(1);
  }
}

export function buildEmail(
  event: AdminEvent,
  dashboardBaseUrl: string | null
): { subject: string; text: string } {
  const label = eventLabel(event.type);
  const name = event.customerName ?? "Unknown";
  const src = sourceLabel(event.source);

  const subject = `[Suryodaya] ${label} - ${name} (${src})`;

  const lines: string[] = [];
  lines.push(label);
  lines.push("");
  lines.push(`Customer: ${name} (${src})`);

  if (event.phone) {
    lines.push(`Phone: ${event.phone}`);
  }

  lines.push(`Move: ${event.moveType ?? "-"}, ${event.origin ?? "?"} to ${event.destination ?? "?"}`);
  lines.push(`Size: ${event.estimatedVolume ?? "-"} | Urgency: ${event.urgency ?? "-"}`);
  lines.push(`Special items: ${event.specialItems.length > 0 ? event.specialItems.join(", ") : "none noted"}`);

  if (event.slotLabel) {
    lines.push(`Survey slot: ${event.slotLabel}`);
  }

  if (event.lastMessage) {
    const trimmed = event.lastMessage.substring(0, 300);
    lines.push(`Last message: "${trimmed}"`);
  }

  lines.push("");

  if (dashboardBaseUrl) {
    const base = dashboardBaseUrl.endsWith("/") ? dashboardBaseUrl.slice(0, -1) : dashboardBaseUrl;
    lines.push(`Open in dashboard: ${base}/leads/${event.leadId}`);
  }

  return { subject, text: lines.join("\n") };
}

export function buildTemplateParams(event: AdminEvent): [string, string, string] {
  const label = eventLabel(event.type);
  const name = event.customerName ?? "Unknown";
  const src = sourceLabel(event.source);

  const detailParts: string[] = [];

  if (event.slotLabel) {
    detailParts.push(event.slotLabel);
  }

  if (event.origin && event.destination) {
    detailParts.push(`${event.origin} to ${event.destination}`);
  }

  if (event.estimatedVolume) {
    detailParts.push(event.estimatedVolume);
  }

  if (event.lastMessage) {
    const trimmed = event.lastMessage.substring(0, 60);
    detailParts.push(`"${trimmed}"`);
  }

  const details = detailParts.length > 0 ? detailParts.join(" | ") : "see dashboard";

  return [
    sanitizeTemplateValue(label, 150),
    sanitizeTemplateValue(`${name} (${src})`, 150),
    sanitizeTemplateValue(details, 150),
  ];
}

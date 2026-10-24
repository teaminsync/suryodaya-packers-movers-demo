/**
 * Build survey event content for Google Calendar
 */

import { sourceLabel } from "../notify/format.js";

export function buildSurveyEventContent(
  base: {
    customerName: string | null;
    source: string | null;
    phone: string | null;
    moveType: string | null;
    origin: string | null;
    destination: string | null;
    estimatedVolume: string | null;
    urgency: string | null;
    specialItems: string[];
    leadId: string;
  },
  dashboardBaseUrl: string | null
): { summary: string; description: string; location: string | null } {
  const summary = `Survey: ${base.customerName ?? "Customer"} (${sourceLabel(base.source)})`;

  const lines: string[] = [];
  lines.push("Booked by the AI assistant");

  if (base.phone) {
    lines.push(`Phone: ${base.phone}`);
  }

  lines.push(
    `Move: ${base.moveType ?? "-"}, ${base.origin ?? "?"} to ${base.destination ?? "?"}`
  );
  lines.push(
    `Size: ${base.estimatedVolume ?? "-"} | Urgency: ${base.urgency ?? "-"}`
  );

  const itemsText = base.specialItems.join(", ") || "none noted";
  lines.push(`Special items: ${itemsText}`);

  if (dashboardBaseUrl) {
    const cleanBaseUrl = dashboardBaseUrl.replace(/\/+$/, "");
    lines.push(`Dashboard: ${cleanBaseUrl}/leads/${base.leadId}`);
  }

  const description = lines.join("\n");

  const location = base.origin || null;

  return { summary, description, location };
}

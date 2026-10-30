/**
 * Follow-up planning rules - pure logic, no I/O
 */

import { toIstParts, istToUtc, addDaysToDateKey } from "../calendar/ist.js";
import type { AutomationConfig } from "./config.js";

export type ActionKind = "nudge_inwindow" | "nudge_template" | "missing_details" | "survey_reminder" | "survey_morning";
export const ACTION_KINDS: readonly ActionKind[] = ["nudge_inwindow", "nudge_template", "missing_details", "survey_reminder", "survey_morning"];

export interface FollowupSnapshot {
  lead: {
    id: string;
    status: string;
    humanTakeover: boolean;
    closedAt: Date | string | null;
    origin: string | null;
    destination: string | null;
    moveType: string | null;
    urgency: string | null;
    estimatedVolume: string | null;
  };
  contact: {
    id: string;
    phoneE164: string | null;
    displayName: string | null;
  };
  lastInboundAt: Date | string | null;
  consent: "granted" | "withdrawn" | "unknown";
  booking: {
    offerId: string;
    startsAt: Date | string;
    confirmedAt: Date | string | null;
  } | null;
  existing: Array<{
    kind: string;
    ref: string;
    status: string;
  }>;
  isLatestLead: boolean;
}

export interface PlannedAction {
  kind: ActionKind;
  ref: string;
  dueAt: Date;
  expiresAt: Date;
  forceSkip: "quiet_hours" | null;
}

const HALF_HOUR_MS = 30 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function shiftIntoSendHours(due: Date, fromHour: number, untilHour: number): Date {
  const parts = toIstParts(due);

  if (parts.hour >= fromHour && parts.hour < untilHour) {
    return due;
  }

  if (parts.hour < fromHour) {
    return istToUtc(parts.dateKey, fromHour, 0);
  }

  const nextDay = addDaysToDateKey(parts.dateKey, 1);
  return istToUtc(nextDay, fromHour, 0);
}

export function missingDetailLabels(lead: { origin: string | null; destination: string | null; estimatedVolume: string | null; urgency: string | null }): string[] {
  const labels: string[] = [];

  if (!lead.origin || lead.origin.trim() === "") {
    labels.push("pickup city");
  }

  if (!lead.destination || lead.destination.trim() === "") {
    labels.push("destination city");
  }

  const vol = lead.estimatedVolume;
  if (!vol || vol.trim() === "" || vol.trim().toLowerCase() === "unknown") {
    labels.push("home size");
  }

  if (!lead.urgency || lead.urgency.trim() === "") {
    labels.push("move timing");
  }

  return labels;
}

function parseDate(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return null;
  }
  return d;
}

function alreadyExists(kind: string, ref: string, existing: Array<{ kind: string; ref: string; status: string }>): boolean {
  return existing.some(e => e.kind === kind && e.ref === ref);
}

function countSentNudges(existing: Array<{ kind: string; status: string }>): number {
  return existing.filter(e => (e.kind === "nudge_inwindow" || e.kind === "nudge_template") && e.status === "sent").length;
}

export function planFollowups(snap: FollowupSnapshot, cfg: AutomationConfig, now: Date): PlannedAction[] {
  const actions: PlannedAction[] = [];

  const lastInbound = parseDate(snap.lastInboundAt);
  const leadClosed = snap.lead.closedAt !== null && snap.lead.closedAt !== undefined;
  const leadBooked = snap.lead.status === "booked";
  const humanTakeover = snap.lead.humanTakeover;
  const noPhone = snap.contact.phoneE164 === null;
  const consentWithdrawn = snap.consent === "withdrawn";

  // Lead-level guards for nudges and missing_details
  const blockedForNudges = leadClosed || leadBooked || humanTakeover || noPhone || consentWithdrawn || lastInbound === null || !snap.isLatestLead;

  if (!blockedForNudges) {
    const L = lastInbound.getTime();
    const Lms = L;
    const windowEnd = new Date(L + DAY_MS - HALF_HOUR_MS);
    const sentNudgeCount = countSentNudges(snap.existing);

    // nudge_inwindow
    if (sentNudgeCount < cfg.maxNudges) {
      const ref = lastInbound.toISOString();
      if (!alreadyExists("nudge_inwindow", ref, snap.existing)) {
        const due = new Date(Lms + cfg.nudgeInWindowHours * HOUR_MS);
        actions.push({ kind: "nudge_inwindow", ref, dueAt: due, expiresAt: windowEnd, forceSkip: null });
      }
    }

    // nudge_template
    if (sentNudgeCount < cfg.maxNudges) {
      const ref = lastInbound.toISOString();
      if (!alreadyExists("nudge_template", ref, snap.existing)) {
        const due = new Date(Lms + cfg.nudgeTemplateHours * HOUR_MS);
        const expires = new Date(L + 7 * DAY_MS);
        actions.push({ kind: "nudge_template", ref, dueAt: due, expiresAt: expires, forceSkip: null });
      }
    }

    // missing_details
    const labels = missingDetailLabels(snap.lead);
    if (labels.length > 0) {
      const ref = "lead";
      if (!alreadyExists("missing_details", ref, snap.existing)) {
        const due = new Date(Lms + cfg.missingDetailsHours * HOUR_MS);
        actions.push({ kind: "missing_details", ref, dueAt: due, expiresAt: windowEnd, forceSkip: null });
      }
    }
  }

  // Booking-related actions (not blocked by leadBooked, still blocked by closed/human/phone/consent)
  const blockedForBooking = leadClosed || humanTakeover || noPhone || consentWithdrawn;

  if (!blockedForBooking && snap.booking !== null) {
    const S = parseDate(snap.booking.startsAt);
    if (S !== null && S.getTime() > now.getTime()) {
      const ref = snap.booking.offerId;
      const confirmedAt = parseDate(snap.booking.confirmedAt);

      // survey_reminder
      if (!alreadyExists("survey_reminder", ref, snap.existing)) {
        let due = new Date(S.getTime() - cfg.reminderHoursBefore * HOUR_MS);

        if (confirmedAt !== null && due.getTime() <= confirmedAt.getTime()) {
          due = new Date(S.getTime() - cfg.reminderLateHours * HOUR_MS);
        }

        const shouldPlan = confirmedAt === null || due.getTime() > confirmedAt.getTime();

        if (shouldPlan) {
          const expires = new Date(S.getTime() - 60 * 60 * 1000);
          actions.push({ kind: "survey_reminder", ref, dueAt: due, expiresAt: expires, forceSkip: null });
        }
      }

      // survey_morning
      const sParts = toIstParts(S);
      if (sParts.hour < 12) {
        const reminderExists = snap.existing.some(e => e.kind === "survey_reminder" && e.ref === ref);
        const morningPlanned = actions.some(a => a.kind === "survey_reminder" && a.ref === ref);

        if (reminderExists || morningPlanned) {
          if (!alreadyExists("survey_morning", ref, snap.existing)) {
            const due = istToUtc(sParts.dateKey, 8, 0);
            const shifted = shiftIntoSendHours(due, cfg.sendFromHour, cfg.sendUntilHour);

            const windowCheck = lastInbound !== null && (lastInbound.getTime() + DAY_MS - HALF_HOUR_MS) > shifted.getTime();
            const expiresCheck = shifted.getTime() <= (S.getTime() - HALF_HOUR_MS);

            if (windowCheck && expiresCheck) {
              const expires = new Date(S.getTime() - HALF_HOUR_MS);
              actions.push({ kind: "survey_morning", ref, dueAt: due, expiresAt: expires, forceSkip: null });
            }
          }
        }
      }
    }
  }

  // Apply quiet hours
  for (const action of actions) {
    const shifted = shiftIntoSendHours(action.dueAt, cfg.sendFromHour, cfg.sendUntilHour);
    if (shifted.getTime() > action.expiresAt.getTime()) {
      action.forceSkip = "quiet_hours";
    } else {
      action.dueAt = shifted;
    }
  }

  // Sort by dueAt ascending
  actions.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  return actions;
}

export function isExpired(a: PlannedAction, now: Date): boolean {
  return now.getTime() > a.expiresAt.getTime();
}

export function isNudgeReplyEligible(input: {
  nudge: { wamid: string | null; processedAt: Date | string | null } | null;
  lastOutboundWamid: string | null;
  now: Date;
}): boolean {
  if (input.nudge === null) {
    return false;
  }

  if (!input.nudge.wamid || input.nudge.wamid.trim() === "") {
    return false;
  }

  if (input.lastOutboundWamid !== input.nudge.wamid) {
    return false;
  }

  const processed = parseDate(input.nudge.processedAt);
  if (processed === null) {
    return false;
  }

  const nowMs = input.now.getTime();
  const processedMs = processed.getTime();

  // Must be between 24 hours ago and 60 seconds in the future
  const minTime = nowMs - 24 * 60 * 60 * 1000;
  const maxTime = nowMs + 60 * 1000;

  if (processedMs < minTime || processedMs > maxTime) {
    return false;
  }

  return true;
}

/**
 * Survey calendar service
 */

import type { SurveyConfig } from "./config.js";
import type { BusyInterval } from "./slots.js";
import {
  generateCandidateSlots,
  filterAvailable,
  pickSlotOptions,
  toOffer,
} from "./slots.js";

export type ClaimResult =
  | {
      ok: true;
      status: "created" | "failed" | "not_configured";
      eventId: string | null;
      eventLink: string | null;
      startsAt: Date;
      endsAt: Date;
    }
  | { ok: false; reason: "conflict" };

export interface SurveyCalendarDeps {
  config: SurveyConfig;
  getConfig?(): Promise<SurveyConfig>;
  calendar: {
    freeBusy(timeMin: Date, timeMax: Date): Promise<BusyInterval[]>;
    insertEvent(input: {
      summary: string;
      description: string;
      location: string | null;
      start: Date;
      end: Date;
      leadId: string;
    }): Promise<{ id: string; htmlLink: string | null }>;
    deleteEvent?(eventId: string): Promise<void>;
  } | null;
  staticSlots(now: Date): Array<{ label: string; datetime: string }>;
  buildEventContent(leadId: string): Promise<{
    summary: string;
    description: string;
    location: string | null;
  }>;
}

export function createSurveyCalendar(deps: SurveyCalendarDeps) {
  async function currentConfig(): Promise<SurveyConfig> {
    if (!deps.getConfig) {
      return deps.config;
    }

    try {
      return await deps.getConfig();
    } catch {
      return deps.config;
    }
  }

  async function getSlotOptions(
    now: Date
  ): Promise<Array<{ label: string; datetime: string }>> {
    if (!deps.calendar) {
      return deps.staticSlots(now);
    }

    const config = await currentConfig();
    const candidates = generateCandidateSlots(now, config);
    if (candidates.length === 0) {
      return [];
    }

    const earliest = candidates[0].start;
    const latest = candidates[candidates.length - 1].end;
    const bufferMs = config.bufferMinutes * 60 * 1000;
    const timeMin = new Date(earliest.getTime() - bufferMs);
    const timeMax = new Date(latest.getTime() + bufferMs);

    let busy: BusyInterval[];
    try {
      busy = await deps.calendar.freeBusy(timeMin, timeMax);
    } catch (error) {
      const message = (error as Error).message;
      console.log("[Calendar] Free/busy failed, using fixed times:", message);
      return deps.staticSlots(now);
    }

    const available = filterAvailable(candidates, busy, config);
    const options = pickSlotOptions(available);
    return options.map(toOffer);
  }

  async function claimSlot(input: {
    leadId: string;
    slot: { label: string; datetime: string };
  }): Promise<ClaimResult> {
    const config = await currentConfig();

    let slotStart: Date;
    try {
      slotStart = new Date(input.slot.datetime);
      if (isNaN(slotStart.getTime())) {
        throw new Error("Invalid datetime");
      }
    } catch {
      return { ok: false, reason: "conflict" };
    }

    const startsAt = slotStart;
    const endsAt = new Date(
      startsAt.getTime() + config.durationMinutes * 60 * 1000
    );

    if (!deps.calendar) {
      return {
        ok: true,
        status: "not_configured",
        eventId: null,
        eventLink: null,
        startsAt,
        endsAt,
      };
    }

    // Re-check availability
    const bufferMs = config.bufferMinutes * 60 * 1000;
    const timeMin = new Date(startsAt.getTime() - bufferMs);
    const timeMax = new Date(endsAt.getTime() + bufferMs);

    let busy: BusyInterval[];
    try {
      busy = await deps.calendar.freeBusy(timeMin, timeMax);
    } catch (error) {
      const message = (error as Error).message;
      console.log(
        "[Calendar] Free/busy check failed during claim, proceeding:",
        message
      );
      busy = [];
    }

    const candidateSlot = { start: startsAt, end: endsAt };
    const available = filterAvailable([candidateSlot], busy, config);

    if (available.length === 0) {
      return { ok: false, reason: "conflict" };
    }

    // Insert the event
    let content: { summary: string; description: string; location: string | null };
    try {
      content = await deps.buildEventContent(input.leadId);
    } catch (error) {
      const message = (error as Error).message;
      console.log(
        "[Calendar] Failed to load event content, using fallback:",
        message
      );
      content = {
        summary: "Survey",
        description: "Booked by the AI assistant",
        location: null,
      };
    }

    try {
      const result = await deps.calendar.insertEvent({
        ...content,
        start: startsAt,
        end: endsAt,
        leadId: input.leadId,
      });

      return {
        ok: true,
        status: "created",
        eventId: result.id,
        eventLink: result.htmlLink,
        startsAt,
        endsAt,
      };
    } catch (error) {
      const message = (error as Error).message;
      console.log("[Calendar] Failed to insert event:", message);
      return {
        ok: true,
        status: "failed",
        eventId: null,
        eventLink: null,
        startsAt,
        endsAt,
      };
    }
  }

  async function cancelEvent(
    eventId: string
  ): Promise<
    { ok: true; status: "cancelled" | "not_configured" } | { ok: false; error: string }
  > {
    if (deps.calendar === null || deps.calendar.deleteEvent === undefined) {
      return { ok: true, status: "not_configured" };
    }

    try {
      await deps.calendar.deleteEvent(eventId);
      return { ok: true, status: "cancelled" };
    } catch (error) {
      const message = (error as Error).message;
      console.log("[Calendar] Could not cancel event:", message);
      return { ok: false, error: message };
    }
  }

  return { getSlotOptions, claimSlot, cancelEvent };
}

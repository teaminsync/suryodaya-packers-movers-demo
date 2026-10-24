/**
 * Survey slot generation and filtering
 */

import { toIstParts, istToUtc, addDaysToDateKey, formatSlotLabel } from "./ist.js";
import type { SurveyConfig } from "./config.js";

export interface Slot {
  start: Date;
  end: Date;
}

interface BusyInterval {
  start: Date;
  end: Date;
}

/**
 * Generate all candidate slots within the booking window
 */
export function generateCandidateSlots(now: Date, cfg: SurveyConfig): Slot[] {
  const candidates: Slot[] = [];
  const nowParts = toIstParts(now);
  const todayKey = nowParts.dateKey;
  const minNoticeMs = cfg.minNoticeHours * 60 * 60 * 1000;

  for (let dayOffset = 0; dayOffset <= cfg.maxDaysAhead; dayOffset++) {
    const dateKey = addDaysToDateKey(todayKey, dayOffset);
    const [year, month, day] = dateKey.split("-").map(Number);
    const testDate = new Date(Date.UTC(year, month - 1, day));
    let weekday = testDate.getUTCDay();
    if (weekday === 0) weekday = 7;

    // Skip if not a workday
    if (!cfg.workdays.includes(weekday)) continue;

    // Skip if holiday
    if (cfg.holidays.includes(dateKey)) continue;

    // Generate slots for this day
    for (
      let startMin = cfg.workStartMin;
      startMin < cfg.workEndMin;
      startMin += cfg.stepMinutes
    ) {
      const endMin = startMin + cfg.durationMinutes;

      // Must fit within work hours
      if (endMin > cfg.workEndMin) continue;

      // Must not overlap break
      if (cfg.breakStartMin !== null && cfg.breakEndMin !== null) {
        const overlapBreak =
          startMin < cfg.breakEndMin && endMin > cfg.breakStartMin;
        if (overlapBreak) continue;
      }

      const slotStart = istToUtc(dateKey, Math.floor(startMin / 60), startMin % 60);

      // Must respect minimum notice
      if (slotStart.getTime() < now.getTime() + minNoticeMs) continue;

      const slotEnd = new Date(slotStart.getTime() + cfg.durationMinutes * 60 * 1000);

      candidates.push({ start: slotStart, end: slotEnd });
    }
  }

  return candidates;
}

/**
 * Filter candidates by availability (considering busy intervals and concurrency)
 */
export function filterAvailable(
  candidates: Slot[],
  busy: BusyInterval[],
  cfg: SurveyConfig
): Slot[] {
  // Pad busy intervals
  const padded = busy
    .map((b) => {
      const padStart = new Date(b.start.getTime() - cfg.bufferMinutes * 60 * 1000);
      const padEnd = new Date(b.end.getTime() + cfg.bufferMinutes * 60 * 1000);
      // Skip invalid dates
      if (isNaN(padStart.getTime()) || isNaN(padEnd.getTime())) {
        return null;
      }
      return { start: padStart, end: padEnd };
    })
    .filter((x): x is BusyInterval => x !== null);

  return candidates.filter((cand) => {
    const overlaps = padded.filter(
      (b) => cand.start.getTime() < b.end.getTime() && cand.end.getTime() > b.start.getTime()
    );
    return overlaps.length < cfg.concurrency;
  });
}

/**
 * Pick up to max slots from available, prioritizing variety across dates
 */
export function pickSlotOptions(available: Slot[], max = 3): Slot[] {
  if (available.length === 0) return [];

  // Group by IST date key
  const byDate = new Map<string, Slot[]>();
  for (const slot of available) {
    const key = toIstParts(slot.start).dateKey;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(slot);
  }

  const dateKeys = Array.from(byDate.keys()).sort();
  const chosen: Slot[] = [];
  const usedSlots = new Set<Slot>();

  // Take first 3 dates, with specific slot selection rules
  for (let i = 0; i < Math.min(max, dateKeys.length); i++) {
    const dateKey = dateKeys[i];
    const slots = byDate.get(dateKey)!.sort((a, b) => a.start.getTime() - b.start.getTime());

    let pick: Slot;
    if (i === 1) {
      // Second date: earliest at/after 14:00 IST if exists, else earliest
      const afternoonSlot = slots.find((s) => {
        const parts = toIstParts(s.start);
        const minOfDay = parts.hour * 60 + parts.minute;
        return minOfDay >= 840; // 14:00
      });
      pick = afternoonSlot || slots[0];
    } else {
      // First and third date: earliest
      pick = slots[0];
    }

    chosen.push(pick);
    usedSlots.add(pick);
  }

  // If we have fewer than max, add more slots in time order
  if (chosen.length < max) {
    const remaining = available
      .filter((s) => !usedSlots.has(s))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    for (const slot of remaining) {
      if (chosen.length >= max) break;
      chosen.push(slot);
    }
  }

  return chosen.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Convert a slot to an offer object
 */
export function toOffer(slot: Slot): { label: string; datetime: string } {
  return {
    label: formatSlotLabel(slot.start),
    datetime: slot.start.toISOString(),
  };
}

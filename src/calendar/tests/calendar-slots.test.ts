import { describe, it, expect } from "@jest/globals";
import {
  generateCandidateSlots,
  filterAvailable,
  pickSlotOptions,
  toOffer,
} from "../slots.js";
import { DEFAULT_SURVEY_CONFIG } from "../config.js";
import { toIstParts, istToUtc } from "../ist.js";

describe("Calendar slots", () => {
  const now = new Date("2026-10-20T03:30:00.000Z"); // 09:00 IST Tuesday

  it("first candidate day has exactly starts at 15:00, 16:00, 17:00 IST", () => {
    const candidates = generateCandidateSlots(now, DEFAULT_SURVEY_CONFIG);
    const today = candidates.filter((s) => toIstParts(s.start).dateKey === "2026-10-20");
    expect(today.length).toBe(3);
    const starts = today.map((s) => toIstParts(s.start).hour);
    expect(starts).toEqual([15, 16, 17]);
  });

  it("full future weekday has 7 starts", () => {
    const candidates = generateCandidateSlots(now, DEFAULT_SURVEY_CONFIG);
    const wed = candidates.filter((s) => toIstParts(s.start).dateKey === "2026-10-21");
    expect(wed.length).toBe(7);
    const starts = wed.map((s) => toIstParts(s.start).hour);
    expect(starts).toEqual([10, 11, 12, 14, 15, 16, 17]);
  });

  it("Sunday has no candidates", () => {
    const candidates = generateCandidateSlots(now, DEFAULT_SURVEY_CONFIG);
    const sunday = candidates.filter((s) => toIstParts(s.start).weekday === 7);
    expect(sunday.length).toBe(0);
  });

  it("holiday has no candidates", () => {
    const cfg = { ...DEFAULT_SURVEY_CONFIG, holidays: ["2026-10-21"] };
    const candidates = generateCandidateSlots(now, cfg);
    const wed = candidates.filter((s) => toIstParts(s.start).dateKey === "2026-10-21");
    expect(wed.length).toBe(0);
  });

  it("17:00 slot ends exactly at 18:00 and is kept", () => {
    const candidates = generateCandidateSlots(now, DEFAULT_SURVEY_CONFIG);
    const slot17 = candidates.find((s) => {
      const parts = toIstParts(s.start);
      return parts.dateKey === "2026-10-21" && parts.hour === 17;
    });
    expect(slot17).toBeDefined();
    const endParts = toIstParts(slot17!.end);
    expect(endParts.hour).toBe(18);
    expect(endParts.minute).toBe(0);
  });

  it("no candidate overlaps the break", () => {
    const candidates = generateCandidateSlots(now, DEFAULT_SURVEY_CONFIG);
    for (const cand of candidates) {
      const startMin = toIstParts(cand.start).hour * 60 + toIstParts(cand.start).minute;
      const endMin = toIstParts(cand.end).hour * 60 + toIstParts(cand.end).minute;
      const breakStart = DEFAULT_SURVEY_CONFIG.breakStartMin!;
      const breakEnd = DEFAULT_SURVEY_CONFIG.breakEndMin!;
      const overlaps = startMin < breakEnd && endMin > breakStart;
      expect(overlaps).toBe(false);
    }
  });

  it("last candidate date is today + 14 days", () => {
    const candidates = generateCandidateSlots(now, DEFAULT_SURVEY_CONFIG);
    const dates = Array.from(new Set(candidates.map((s) => toIstParts(s.start).dateKey))).sort();
    const lastDate = dates[dates.length - 1];
    expect(lastDate).toBe("2026-11-03"); // 20 Oct + 14 days
  });

  it("maxDaysAhead=0 and late time produces no candidates", () => {
    const cfg = { ...DEFAULT_SURVEY_CONFIG, maxDaysAhead: 0 };
    const lateNow = new Date("2026-10-20T13:00:00.000Z"); // 18:30 IST
    const candidates = generateCandidateSlots(lateNow, cfg);
    expect(candidates.length).toBe(0);
  });

  it("filterAvailable: one busy 11:00-12:00 blocks slots 10, 11, 12", () => {
    const candidates = generateCandidateSlots(now, DEFAULT_SURVEY_CONFIG);
    const wed = candidates.filter((s) => toIstParts(s.start).dateKey === "2026-10-21");
    const busy = [
      {
        start: istToUtc("2026-10-21", 11, 0),
        end: istToUtc("2026-10-21", 12, 0),
      },
    ];
    const available = filterAvailable(wed, busy, DEFAULT_SURVEY_CONFIG);
    const hours = available.map((s) => toIstParts(s.start).hour);
    expect(hours).not.toContain(10);
    expect(hours).not.toContain(11);
    expect(hours).not.toContain(12);
    expect(hours).toContain(14);
  });

  it("filterAvailable: concurrency 2 keeps slots with one busy, blocks with two", () => {
    const candidates = generateCandidateSlots(now, DEFAULT_SURVEY_CONFIG);
    const wed = candidates.filter((s) => toIstParts(s.start).dateKey === "2026-10-21");
    const busy = [
      {
        start: istToUtc("2026-10-21", 11, 0),
        end: istToUtc("2026-10-21", 12, 0),
      },
    ];
    const cfg2 = { ...DEFAULT_SURVEY_CONFIG, concurrency: 2 };
    const available = filterAvailable(wed, busy, cfg2);
    const hours = available.map((s) => toIstParts(s.start).hour);
    expect(hours).toContain(10);
    expect(hours).toContain(11);
    expect(hours).toContain(12);

    const busy2 = [
      {
        start: istToUtc("2026-10-21", 11, 0),
        end: istToUtc("2026-10-21", 12, 0),
      },
      {
        start: istToUtc("2026-10-21", 11, 0),
        end: istToUtc("2026-10-21", 12, 0),
      },
    ];
    const available2 = filterAvailable(wed, busy2, cfg2);
    const hours2 = available2.map((s) => toIstParts(s.start).hour);
    expect(hours2).not.toContain(10);
    expect(hours2).not.toContain(11);
    expect(hours2).not.toContain(12);
  });

  it("filterAvailable: invalid busy dates are ignored", () => {
    const candidates = generateCandidateSlots(now, DEFAULT_SURVEY_CONFIG);
    const wed = candidates.filter((s) => toIstParts(s.start).dateKey === "2026-10-21");
    const busy = [
      {
        start: new Date("invalid"),
        end: istToUtc("2026-10-21", 12, 0),
      },
    ];
    const available = filterAvailable(wed, busy, DEFAULT_SURVEY_CONFIG);
    expect(available.length).toBe(wed.length);
  });

  it("filterAvailable: far-away busy blocks nothing", () => {
    const candidates = generateCandidateSlots(now, DEFAULT_SURVEY_CONFIG);
    const wed = candidates.filter((s) => toIstParts(s.start).dateKey === "2026-10-21");
    const busy = [
      {
        start: istToUtc("2027-01-01", 11, 0),
        end: istToUtc("2027-01-01", 12, 0),
      },
    ];
    const available = filterAvailable(wed, busy, DEFAULT_SURVEY_CONFIG);
    expect(available.length).toBe(wed.length);
  });

  it("pickSlotOptions: three days available returns day1 earliest, day2 first at/after 14:00, day3 earliest", () => {
    const candidates = generateCandidateSlots(now, DEFAULT_SURVEY_CONFIG);
    const available = filterAvailable(candidates, [], DEFAULT_SURVEY_CONFIG);
    const picked = pickSlotOptions(available, 3);
    expect(picked.length).toBe(3);

    const [slot1, slot2, slot3] = picked;
    const parts1 = toIstParts(slot1.start);
    const parts2 = toIstParts(slot2.start);
    const parts3 = toIstParts(slot3.start);

    expect(parts1.dateKey).toBe("2026-10-20");
    expect(parts1.hour).toBe(15); // earliest

    expect(parts2.dateKey).toBe("2026-10-21");
    expect(parts2.hour).toBeGreaterThanOrEqual(14); // at/after 14:00

    expect(parts3.dateKey).toBe("2026-10-22");
    expect(parts3.hour).toBe(10); // earliest
  });

  it("pickSlotOptions: only one day available returns its first three slots", () => {
    const candidates = generateCandidateSlots(now, DEFAULT_SURVEY_CONFIG);
    const wed = candidates.filter((s) => toIstParts(s.start).dateKey === "2026-10-21");
    const picked = pickSlotOptions(wed, 3);
    expect(picked.length).toBe(3);
    const hours = picked.map((s) => toIstParts(s.start).hour);
    expect(hours).toEqual([10, 11, 12]);
  });

  it("pickSlotOptions: fewer than three slots total returns them all", () => {
    const slot1 = {
      start: istToUtc("2026-10-21", 10, 0),
      end: istToUtc("2026-10-21", 11, 0),
    };
    const slot2 = {
      start: istToUtc("2026-10-21", 11, 0),
      end: istToUtc("2026-10-21", 12, 0),
    };
    const picked = pickSlotOptions([slot1, slot2], 3);
    expect(picked.length).toBe(2);
  });

  it("pickSlotOptions: empty returns empty", () => {
    const picked = pickSlotOptions([], 3);
    expect(picked).toEqual([]);
  });

  it("toOffer returns label and datetime ISO string", () => {
    const slot = {
      start: istToUtc("2026-10-20", 10, 0),
      end: istToUtc("2026-10-20", 11, 0),
    };
    const offer = toOffer(slot);
    expect(offer.label).toBe("Tue, 20 Oct at 10:00 AM");
    expect(offer.datetime).toBe("2026-10-20T04:30:00.000Z");
  });
});

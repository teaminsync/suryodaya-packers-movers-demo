import { describe, it, expect } from "@jest/globals";
import { toIstParts, istToUtc, addDaysToDateKey, formatSlotLabel } from "../ist.js";

describe("Calendar IST", () => {
  it("toIstParts converts 2026-10-20T04:30:00.000Z correctly", () => {
    const parts = toIstParts(new Date("2026-10-20T04:30:00.000Z"));
    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(10);
    expect(parts.day).toBe(20);
    expect(parts.hour).toBe(10);
    expect(parts.minute).toBe(0);
    expect(parts.weekday).toBe(2); // Tuesday
    expect(parts.dateKey).toBe("2026-10-20");
  });

  it("toIstParts converts 2026-10-19T19:00:00.000Z to next day", () => {
    const parts = toIstParts(new Date("2026-10-19T19:00:00.000Z"));
    expect(parts.dateKey).toBe("2026-10-20");
    expect(parts.hour).toBe(0);
    expect(parts.minute).toBe(30);
  });

  it("toIstParts handles Sunday as weekday 7", () => {
    const parts = toIstParts(new Date("2026-10-25T05:00:00.000Z"));
    expect(parts.weekday).toBe(7); // Sunday
  });

  it("istToUtc converts IST date and time to UTC", () => {
    const utc = istToUtc("2026-10-20", 10, 0);
    expect(utc.toISOString()).toBe("2026-10-20T04:30:00.000Z");
  });

  it("addDaysToDateKey handles month boundary", () => {
    expect(addDaysToDateKey("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("addDaysToDateKey handles year boundary", () => {
    expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("addDaysToDateKey handles negative days", () => {
    expect(addDaysToDateKey("2026-11-01", -1)).toBe("2026-10-31");
  });

  it("formatSlotLabel formats 10:00 AM correctly", () => {
    const label = formatSlotLabel(new Date("2026-10-20T04:30:00.000Z"));
    expect(label).toBe("Tue, 20 Oct at 10:00 AM");
  });

  it("formatSlotLabel formats 5:30 PM correctly", () => {
    const label = formatSlotLabel(new Date("2026-10-20T12:00:00.000Z"));
    expect(label).toBe("Tue, 20 Oct at 5:30 PM");
  });

  it("formatSlotLabel formats midnight correctly", () => {
    const label = formatSlotLabel(new Date("2026-10-19T18:30:00.000Z"));
    expect(label).toBe("Tue, 20 Oct at 12:00 AM");
  });

  it("formatSlotLabel formats noon correctly", () => {
    const label = formatSlotLabel(new Date("2026-10-20T06:30:00.000Z"));
    expect(label).toBe("Tue, 20 Oct at 12:00 PM");
  });
});

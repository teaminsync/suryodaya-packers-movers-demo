import { describe, it, expect } from "@jest/globals";
import { createSurveyCalendar } from "../survey-calendar.js";
import { DEFAULT_SURVEY_CONFIG } from "../config.js";
import type { BusyInterval } from "../slots.js";

describe("Survey calendar", () => {
  const config = DEFAULT_SURVEY_CONFIG;
  const now = new Date("2026-10-20T03:30:00.000Z"); // 09:00 IST Tuesday

  it("no calendar returns staticSlots result", async () => {
    const staticSlots = [
      { label: "Option 1", datetime: "2026-10-20T10:00:00.000Z" },
      { label: "Option 2", datetime: "2026-10-21T10:00:00.000Z" },
    ];

    const calendar = createSurveyCalendar({
      config,
      calendar: null,
      staticSlots: () => staticSlots,
      buildEventContent: async () => ({
        summary: "Test",
        description: "Test",
        location: null,
      }),
    });

    const slots = await calendar.getSlotOptions(now);
    expect(slots).toEqual(staticSlots);
  });

  it("claimSlot with no calendar returns not_configured", async () => {
    const calendar = createSurveyCalendar({
      config,
      calendar: null,
      staticSlots: () => [],
      buildEventContent: async () => ({
        summary: "Test",
        description: "Test",
        location: null,
      }),
    });

    const result = await calendar.claimSlot({
      leadId: "L1",
      slot: { label: "Test", datetime: "2026-10-20T10:00:00.000Z" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("not_configured");
      expect(result.eventId).toBeNull();
      expect(result.eventLink).toBeNull();
      expect(result.startsAt.toISOString()).toBe("2026-10-20T10:00:00.000Z");
      expect(result.endsAt.toISOString()).toBe("2026-10-20T11:00:00.000Z");
    }
  });

  it("empty busy returns exactly three expected options", async () => {
    const mockCalendar = {
      async freeBusy(): Promise<BusyInterval[]> {
        return [];
      },
      async insertEvent() {
        return { id: "event-1", htmlLink: null };
      },
    };

    const calendar = createSurveyCalendar({
      config,
      calendar: mockCalendar,
      staticSlots: () => [],
      buildEventContent: async () => ({
        summary: "Test",
        description: "Test",
        location: null,
      }),
    });

    const slots = await calendar.getSlotOptions(now);

    expect(slots).toEqual([
      { label: "Tue, 20 Oct at 3:00 PM", datetime: "2026-10-20T09:30:00.000Z" },
      { label: "Wed, 21 Oct at 2:00 PM", datetime: "2026-10-21T08:30:00.000Z" },
      { label: "Thu, 22 Oct at 10:00 AM", datetime: "2026-10-22T04:30:00.000Z" },
    ]);
  });

  it("busy Tue 15:00-16:00 IST shifts first option to 17:00", async () => {
    const mockCalendar = {
      async freeBusy(): Promise<BusyInterval[]> {
        return [
          {
            start: new Date("2026-10-20T09:30:00.000Z"),
            end: new Date("2026-10-20T10:30:00.000Z"),
          },
        ];
      },
      async insertEvent() {
        return { id: "event-1", htmlLink: null };
      },
    };

    const calendar = createSurveyCalendar({
      config,
      calendar: mockCalendar,
      staticSlots: () => [],
      buildEventContent: async () => ({
        summary: "Test",
        description: "Test",
        location: null,
      }),
    });

    const slots = await calendar.getSlotOptions(now);

    expect(slots[0]).toEqual({
      label: "Tue, 20 Oct at 5:00 PM",
      datetime: "2026-10-20T11:30:00.000Z",
    });
  });

  it("holidays excludes specified dates", async () => {
    const configWithHoliday = {
      ...config,
      holidays: ["2026-10-21"],
    };

    const mockCalendar = {
      async freeBusy(): Promise<BusyInterval[]> {
        return [];
      },
      async insertEvent() {
        return { id: "event-1", htmlLink: null };
      },
    };

    const calendar = createSurveyCalendar({
      config: configWithHoliday,
      calendar: mockCalendar,
      staticSlots: () => [],
      buildEventContent: async () => ({
        summary: "Test",
        description: "Test",
        location: null,
      }),
    });

    const slots = await calendar.getSlotOptions(now);

    expect(slots).toEqual([
      { label: "Tue, 20 Oct at 3:00 PM", datetime: "2026-10-20T09:30:00.000Z" },
      { label: "Thu, 22 Oct at 2:00 PM", datetime: "2026-10-22T08:30:00.000Z" },
      { label: "Fri, 23 Oct at 10:00 AM", datetime: "2026-10-23T04:30:00.000Z" },
    ]);
  });

  it("Friday 09:00 IST offers Friday, Saturday, Monday", async () => {
    const fridayNow = new Date("2026-10-23T03:30:00.000Z");

    const mockCalendar = {
      async freeBusy(): Promise<BusyInterval[]> {
        return [];
      },
      async insertEvent() {
        return { id: "event-1", htmlLink: null };
      },
    };

    const calendar = createSurveyCalendar({
      config,
      calendar: mockCalendar,
      staticSlots: () => [],
      buildEventContent: async () => ({
        summary: "Test",
        description: "Test",
        location: null,
      }),
    });

    const slots = await calendar.getSlotOptions(fridayNow);

    expect(slots).toEqual([
      { label: "Fri, 23 Oct at 3:00 PM", datetime: "2026-10-23T09:30:00.000Z" },
      { label: "Sat, 24 Oct at 2:00 PM", datetime: "2026-10-24T08:30:00.000Z" },
      { label: "Mon, 26 Oct at 10:00 AM", datetime: "2026-10-26T04:30:00.000Z" },
    ]);
  });

  it("freeBusy throws returns staticSlots", async () => {
    const staticSlots = [{ label: "Fixed", datetime: "2026-10-20T10:00:00.000Z" }];

    const mockCalendar = {
      async freeBusy(): Promise<BusyInterval[]> {
        throw new Error("Calendar unavailable");
      },
      async insertEvent() {
        return { id: "event-1", htmlLink: null };
      },
    };

    const calendar = createSurveyCalendar({
      config,
      calendar: mockCalendar,
      staticSlots: () => staticSlots,
      buildEventContent: async () => ({
        summary: "Test",
        description: "Test",
        location: null,
      }),
    });

    const slots = await calendar.getSlotOptions(now);
    expect(slots).toEqual(staticSlots);
  });

  it("maxDaysAhead 0 returns empty array", async () => {
    const configZeroDays = {
      ...config,
      maxDaysAhead: 0,
    };

    const nowLate = new Date("2026-10-20T13:00:00.000Z"); // 18:30 IST, past work hours

    const mockCalendar = {
      async freeBusy(): Promise<BusyInterval[]> {
        return [];
      },
      async insertEvent() {
        return { id: "event-1", htmlLink: null };
      },
    };

    const calendar = createSurveyCalendar({
      config: configZeroDays,
      calendar: mockCalendar,
      staticSlots: () => [],
      buildEventContent: async () => ({
        summary: "Test",
        description: "Test",
        location: null,
      }),
    });

    const slots = await calendar.getSlotOptions(nowLate);
    expect(slots).toEqual([]);
  });

  it("claimSlot with busy slot returns conflict", async () => {
    const mockCalendar = {
      async freeBusy(): Promise<BusyInterval[]> {
        return [
          {
            start: new Date("2026-10-20T09:00:00.000Z"),
            end: new Date("2026-10-20T11:00:00.000Z"),
          },
        ];
      },
      async insertEvent() {
        return { id: "event-1", htmlLink: null };
      },
    };

    const calendar = createSurveyCalendar({
      config,
      calendar: mockCalendar,
      staticSlots: () => [],
      buildEventContent: async () => ({
        summary: "Test",
        description: "Test",
        location: null,
      }),
    });

    const result = await calendar.claimSlot({
      leadId: "L1",
      slot: { label: "Test", datetime: "2026-10-20T09:30:00.000Z" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("conflict");
    }
  });

  it("claimSlot with free slot inserts event", async () => {
    let insertedInput: any = null;

    const mockCalendar = {
      async freeBusy(): Promise<BusyInterval[]> {
        return [];
      },
      async insertEvent(input: any) {
        insertedInput = input;
        return { id: "event-123", htmlLink: "https://calendar.google.com/event?eid=xyz" };
      },
    };

    const calendar = createSurveyCalendar({
      config,
      calendar: mockCalendar,
      staticSlots: () => [],
      buildEventContent: async (leadId) => ({
        summary: `Survey for ${leadId}`,
        description: "Test description",
        location: "Test location",
      }),
    });

    const result = await calendar.claimSlot({
      leadId: "L1",
      slot: { label: "Test", datetime: "2026-10-20T09:30:00.000Z" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("created");
      expect(result.eventId).toBe("event-123");
      expect(result.eventLink).toBe("https://calendar.google.com/event?eid=xyz");
      expect(result.startsAt.toISOString()).toBe("2026-10-20T09:30:00.000Z");
      expect(result.endsAt.toISOString()).toBe("2026-10-20T10:30:00.000Z");
    }

    expect(insertedInput).toBeTruthy();
    expect(insertedInput.summary).toBe("Survey for L1");
    expect(insertedInput.description).toBe("Test description");
    expect(insertedInput.location).toBe("Test location");
    expect(insertedInput.start.toISOString()).toBe("2026-10-20T09:30:00.000Z");
    expect(insertedInput.end.toISOString()).toBe("2026-10-20T10:30:00.000Z");
    expect(insertedInput.leadId).toBe("L1");
  });

  it("insertEvent throws returns status failed", async () => {
    const mockCalendar = {
      async freeBusy(): Promise<BusyInterval[]> {
        return [];
      },
      async insertEvent() {
        throw new Error("Insert failed");
      },
    };

    const calendar = createSurveyCalendar({
      config,
      calendar: mockCalendar,
      staticSlots: () => [],
      buildEventContent: async () => ({
        summary: "Test",
        description: "Test",
        location: null,
      }),
    });

    const result = await calendar.claimSlot({
      leadId: "L1",
      slot: { label: "Test", datetime: "2026-10-20T09:30:00.000Z" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("failed");
      expect(result.eventId).toBeNull();
      expect(result.eventLink).toBeNull();
    }
  });

  it("freeBusy throws during claim still inserts", async () => {
    let insertCalled = false;

    const mockCalendar = {
      async freeBusy(): Promise<BusyInterval[]> {
        throw new Error("Check failed");
      },
      async insertEvent() {
        insertCalled = true;
        return { id: "event-1", htmlLink: null };
      },
    };

    const calendar = createSurveyCalendar({
      config,
      calendar: mockCalendar,
      staticSlots: () => [],
      buildEventContent: async () => ({
        summary: "Test",
        description: "Test",
        location: null,
      }),
    });

    const result = await calendar.claimSlot({
      leadId: "L1",
      slot: { label: "Test", datetime: "2026-10-20T09:30:00.000Z" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("created");
      expect(insertCalled).toBe(true);
    }
  });

  it("invalid datetime returns conflict", async () => {
    const calendar = createSurveyCalendar({
      config,
      calendar: null,
      staticSlots: () => [],
      buildEventContent: async () => ({
        summary: "Test",
        description: "Test",
        location: null,
      }),
    });

    const result = await calendar.claimSlot({
      leadId: "L1",
      slot: { label: "Test", datetime: "invalid" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("conflict");
    }
  });

  it("cancelEvent with no calendar returns not_configured", async () => {
    const calendar = createSurveyCalendar({
      config,
      calendar: null,
      staticSlots: () => [],
      buildEventContent: async () => ({
        summary: "Test",
        description: "Test",
        location: null,
      }),
    });

    const result = await calendar.cancelEvent("event-123");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("not_configured");
    }
  });

  it("cancelEvent with calendar without deleteEvent returns not_configured", async () => {
    const mockCalendar = {
      async freeBusy(): Promise<BusyInterval[]> {
        return [];
      },
      async insertEvent() {
        return { id: "event-1", htmlLink: null };
      },
    };

    const calendar = createSurveyCalendar({
      config,
      calendar: mockCalendar,
      staticSlots: () => [],
      buildEventContent: async () => ({
        summary: "Test",
        description: "Test",
        location: null,
      }),
    });

    const result = await calendar.cancelEvent("event-123");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("not_configured");
    }
  });

  it("cancelEvent with deleteEvent calls it and returns cancelled", async () => {
    let deleteCalled = false;
    let deletedEventId = "";

    const mockCalendar = {
      async freeBusy(): Promise<BusyInterval[]> {
        return [];
      },
      async insertEvent() {
        return { id: "event-1", htmlLink: null };
      },
      async deleteEvent(eventId: string) {
        deleteCalled = true;
        deletedEventId = eventId;
      },
    };

    const calendar = createSurveyCalendar({
      config,
      calendar: mockCalendar,
      staticSlots: () => [],
      buildEventContent: async () => ({
        summary: "Test",
        description: "Test",
        location: null,
      }),
    });

    const result = await calendar.cancelEvent("event-123");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("cancelled");
    }
    expect(deleteCalled).toBe(true);
    expect(deletedEventId).toBe("event-123");
  });

  it("cancelEvent with deleteEvent throwing returns error", async () => {
    const mockCalendar = {
      async freeBusy(): Promise<BusyInterval[]> {
        return [];
      },
      async insertEvent() {
        return { id: "event-1", htmlLink: null };
      },
      async deleteEvent() {
        throw new Error("Delete failed");
      },
    };

    const calendar = createSurveyCalendar({
      config,
      calendar: mockCalendar,
      staticSlots: () => [],
      buildEventContent: async () => ({
        summary: "Test",
        description: "Test",
        location: null,
      }),
    });

    const result = await calendar.cancelEvent("event-123");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Delete failed");
    }
  });

  it("getConfig returning holidays that remove a day removes that day's slots", async () => {
    const mockCalendar = {
      async freeBusy(): Promise<BusyInterval[]> {
        return [];
      },
      async insertEvent() {
        return { id: "event-1", htmlLink: null };
      },
    };

    const configWithoutHoliday = { ...config, holidays: [] };
    const configWithHoliday = { ...config, holidays: ["2026-10-21"] };

    const calendar = createSurveyCalendar({
      config: configWithoutHoliday,
      getConfig: async () => configWithHoliday,
      calendar: mockCalendar,
      staticSlots: () => [],
      buildEventContent: async () => ({
        summary: "Test",
        description: "Test",
        location: null,
      }),
    });

    const slots = await calendar.getSlotOptions(now);

    expect(slots).toEqual([
      { label: "Tue, 20 Oct at 3:00 PM", datetime: "2026-10-20T09:30:00.000Z" },
      { label: "Thu, 22 Oct at 2:00 PM", datetime: "2026-10-22T08:30:00.000Z" },
      { label: "Fri, 23 Oct at 10:00 AM", datetime: "2026-10-23T04:30:00.000Z" },
    ]);
  });

  it("getConfig that throws falls back to deps.config", async () => {
    const mockCalendar = {
      async freeBusy(): Promise<BusyInterval[]> {
        return [];
      },
      async insertEvent() {
        return { id: "event-1", htmlLink: null };
      },
    };

    const configWithHoliday = { ...config, holidays: ["2026-10-21"] };

    const calendar = createSurveyCalendar({
      config: configWithHoliday,
      getConfig: async () => {
        throw new Error("Config load failed");
      },
      calendar: mockCalendar,
      staticSlots: () => [],
      buildEventContent: async () => ({
        summary: "Test",
        description: "Test",
        location: null,
      }),
    });

    const slots = await calendar.getSlotOptions(now);

    expect(slots).toEqual([
      { label: "Tue, 20 Oct at 3:00 PM", datetime: "2026-10-20T09:30:00.000Z" },
      { label: "Thu, 22 Oct at 2:00 PM", datetime: "2026-10-22T08:30:00.000Z" },
      { label: "Fri, 23 Oct at 10:00 AM", datetime: "2026-10-23T04:30:00.000Z" },
    ]);
  });

  it("claimSlot uses the getConfig duration", async () => {
    const mockCalendar = {
      async freeBusy(): Promise<BusyInterval[]> {
        return [];
      },
      async insertEvent() {
        return { id: "event-1", htmlLink: null };
      },
    };

    const configWith30Min = { ...config, durationMinutes: 30 };

    const calendar = createSurveyCalendar({
      config,
      getConfig: async () => configWith30Min,
      calendar: mockCalendar,
      staticSlots: () => [],
      buildEventContent: async () => ({
        summary: "Test",
        description: "Test",
        location: null,
      }),
    });

    const result = await calendar.claimSlot({
      leadId: "L1",
      slot: { label: "Test", datetime: "2026-10-20T09:30:00.000Z" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.startsAt.toISOString()).toBe("2026-10-20T09:30:00.000Z");
      expect(result.endsAt.toISOString()).toBe("2026-10-20T10:00:00.000Z");
    }
  });
});

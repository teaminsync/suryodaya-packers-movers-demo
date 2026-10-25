import { describe, it, expect } from "@jest/globals";
import { createCalendarClient } from "../google-client.js";

describe("Calendar client", () => {
  const getToken = async () => "fake-token";

  it("freeBusy sends correct request", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = "";

    const mockFetch: typeof fetch = async (url, options) => {
      capturedUrl = url as string;
      capturedMethod = options?.method || "GET";
      capturedHeaders = options?.headers as Record<string, string>;
      capturedBody = options?.body as string;

      return {
        ok: true,
        json: async () => ({
          calendars: {
            "test@calendar.com": {
              busy: [
                { start: "2026-10-20T10:00:00.000Z", end: "2026-10-20T11:00:00.000Z" },
              ],
            },
          },
        }),
      } as Response;
    };

    const client = createCalendarClient({
      calendarId: "test@calendar.com",
      getAccessToken: getToken,
      fetchFn: mockFetch,
    });

    await client.freeBusy(
      new Date("2026-10-20T00:00:00.000Z"),
      new Date("2026-10-21T00:00:00.000Z")
    );

    expect(capturedUrl).toBe("https://www.googleapis.com/calendar/v3/freeBusy");
    expect(capturedMethod).toBe("POST");
    expect(capturedHeaders["Authorization"]).toBe("Bearer fake-token");
    expect(capturedHeaders["Content-Type"]).toBe("application/json");

    const body = JSON.parse(capturedBody);
    expect(body.timeMin).toBe("2026-10-20T00:00:00.000Z");
    expect(body.timeMax).toBe("2026-10-21T00:00:00.000Z");
    expect(body.timeZone).toBe("Asia/Kolkata");
    expect(body.items).toEqual([{ id: "test@calendar.com" }]);
  });

  it("freeBusy parses busy intervals to Dates", async () => {
    const mockFetch: typeof fetch = async () => {
      return {
        ok: true,
        json: async () => ({
          calendars: {
            "test@calendar.com": {
              busy: [
                { start: "2026-10-20T10:00:00.000Z", end: "2026-10-20T11:00:00.000Z" },
                { start: "2026-10-20T14:00:00.000Z", end: "2026-10-20T15:00:00.000Z" },
              ],
            },
          },
        }),
      } as Response;
    };

    const client = createCalendarClient({
      calendarId: "test@calendar.com",
      getAccessToken: getToken,
      fetchFn: mockFetch,
    });

    const busy = await client.freeBusy(
      new Date("2026-10-20T00:00:00.000Z"),
      new Date("2026-10-21T00:00:00.000Z")
    );

    expect(busy.length).toBe(2);
    expect(busy[0].start.toISOString()).toBe("2026-10-20T10:00:00.000Z");
    expect(busy[0].end.toISOString()).toBe("2026-10-20T11:00:00.000Z");
    expect(busy[1].start.toISOString()).toBe("2026-10-20T14:00:00.000Z");
    expect(busy[1].end.toISOString()).toBe("2026-10-20T15:00:00.000Z");
  });

  it("freeBusy throws on errors array", async () => {
    const mockFetch: typeof fetch = async () => {
      return {
        ok: true,
        json: async () => ({
          calendars: {
            "test@calendar.com": {
              errors: [{ reason: "notFound" }],
            },
          },
        }),
      } as Response;
    };

    const client = createCalendarClient({
      calendarId: "test@calendar.com",
      getAccessToken: getToken,
      fetchFn: mockFetch,
    });

    try {
      await client.freeBusy(
        new Date("2026-10-20T00:00:00.000Z"),
        new Date("2026-10-21T00:00:00.000Z")
      );
      expect(true).toBe(false); // should have thrown
    } catch (error) {
      const msg = (error as Error).message;
      expect(msg).toBe("Google freeBusy error: notFound");
    }
  });

  it("freeBusy throws when calendar entry is missing", async () => {
    const mockFetch: typeof fetch = async () => {
      return {
        ok: true,
        json: async () => ({
          calendars: {
            "different@calendar.com": {
              busy: [],
            },
          },
        }),
      } as Response;
    };

    const client = createCalendarClient({
      calendarId: "test@calendar.com",
      getAccessToken: getToken,
      fetchFn: mockFetch,
    });

    try {
      await client.freeBusy(
        new Date("2026-10-20T00:00:00.000Z"),
        new Date("2026-10-21T00:00:00.000Z")
      );
      expect(true).toBe(false); // should have thrown
    } catch (error) {
      const msg = (error as Error).message;
      expect(msg).toBe("Google freeBusy error: no data for calendar");
    }
  });

  it("insertEvent sends correct request with location", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = "";

    const mockFetch: typeof fetch = async (url, options) => {
      capturedUrl = url as string;
      capturedMethod = options?.method || "GET";
      capturedHeaders = options?.headers as Record<string, string>;
      capturedBody = options?.body as string;

      return {
        ok: true,
        json: async () => ({
          id: "event-123",
          htmlLink: "https://calendar.google.com/event?eid=xyz",
        }),
      } as Response;
    };

    const client = createCalendarClient({
      calendarId: "abc@group.calendar.google.com",
      getAccessToken: getToken,
      fetchFn: mockFetch,
    });

    await client.insertEvent({
      summary: "Test Event",
      description: "Test Description",
      location: "Test Location",
      start: new Date("2026-10-20T10:00:00.000Z"),
      end: new Date("2026-10-20T11:00:00.000Z"),
      leadId: "lead-456",
    });

    expect(capturedUrl).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/abc%40group.calendar.google.com/events"
    );
    expect(capturedMethod).toBe("POST");
    expect(capturedHeaders["Authorization"]).toBe("Bearer fake-token");
    expect(capturedHeaders["Content-Type"]).toBe("application/json");

    const body = JSON.parse(capturedBody);
    expect(body.summary).toBe("Test Event");
    expect(body.description).toBe("Test Description");
    expect(body.location).toBe("Test Location");
    expect(body.start.dateTime).toBe("2026-10-20T10:00:00.000Z");
    expect(body.start.timeZone).toBe("Asia/Kolkata");
    expect(body.end.dateTime).toBe("2026-10-20T11:00:00.000Z");
    expect(body.end.timeZone).toBe("Asia/Kolkata");
    expect(body.extendedProperties.private.leadId).toBe("lead-456");
    expect(body.attendees).toBeUndefined();
  });

  it("insertEvent omits location when null", async () => {
    let capturedBody = "";

    const mockFetch: typeof fetch = async (_url, options) => {
      capturedBody = options?.body as string;

      return {
        ok: true,
        json: async () => ({
          id: "event-123",
          htmlLink: "https://calendar.google.com/event?eid=xyz",
        }),
      } as Response;
    };

    const client = createCalendarClient({
      calendarId: "test@calendar.com",
      getAccessToken: getToken,
      fetchFn: mockFetch,
    });

    await client.insertEvent({
      summary: "Test Event",
      description: "Test Description",
      location: null,
      start: new Date("2026-10-20T10:00:00.000Z"),
      end: new Date("2026-10-20T11:00:00.000Z"),
      leadId: "lead-456",
    });

    const body = JSON.parse(capturedBody);
    expect(body.location).toBeUndefined();
  });

  it("insertEvent returns id and htmlLink", async () => {
    const mockFetch: typeof fetch = async () => {
      return {
        ok: true,
        json: async () => ({
          id: "event-123",
          htmlLink: "https://calendar.google.com/event?eid=xyz",
        }),
      } as Response;
    };

    const client = createCalendarClient({
      calendarId: "test@calendar.com",
      getAccessToken: getToken,
      fetchFn: mockFetch,
    });

    const result = await client.insertEvent({
      summary: "Test Event",
      description: "Test Description",
      location: "Test Location",
      start: new Date("2026-10-20T10:00:00.000Z"),
      end: new Date("2026-10-20T11:00:00.000Z"),
      leadId: "lead-456",
    });

    expect(result.id).toBe("event-123");
    expect(result.htmlLink).toBe("https://calendar.google.com/event?eid=xyz");
  });

  it("insertEvent returns null htmlLink when missing", async () => {
    const mockFetch: typeof fetch = async () => {
      return {
        ok: true,
        json: async () => ({
          id: "event-123",
        }),
      } as Response;
    };

    const client = createCalendarClient({
      calendarId: "test@calendar.com",
      getAccessToken: getToken,
      fetchFn: mockFetch,
    });

    const result = await client.insertEvent({
      summary: "Test Event",
      description: "Test Description",
      location: null,
      start: new Date("2026-10-20T10:00:00.000Z"),
      end: new Date("2026-10-20T11:00:00.000Z"),
      leadId: "lead-456",
    });

    expect(result.id).toBe("event-123");
    expect(result.htmlLink).toBeNull();
  });

  it("insertEvent throws on non-OK response with trimmed body", async () => {
    const longBody = "x".repeat(300);

    const mockFetch: typeof fetch = async () => {
      return {
        ok: false,
        status: 400,
        text: async () => longBody,
      } as Response;
    };

    const client = createCalendarClient({
      calendarId: "test@calendar.com",
      getAccessToken: getToken,
      fetchFn: mockFetch,
    });

    try {
      await client.insertEvent({
        summary: "Test Event",
        description: "Test Description",
        location: null,
        start: new Date("2026-10-20T10:00:00.000Z"),
        end: new Date("2026-10-20T11:00:00.000Z"),
        leadId: "lead-456",
      });
      expect(true).toBe(false); // should have thrown
    } catch (error) {
      const msg = (error as Error).message;
      expect(msg).toContain("Google Calendar HTTP 400");
      expect(msg.length).toBeLessThanOrEqual(250); // "Google Calendar HTTP 400: " + 200 chars
    }
  });

  it("deleteEvent sends DELETE request and resolves on 204", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: string | undefined = undefined;

    const mockFetch: typeof fetch = async (url, options) => {
      capturedUrl = url as string;
      capturedMethod = options?.method || "GET";
      capturedHeaders = options?.headers as Record<string, string>;
      capturedBody = options?.body as string | undefined;

      return {
        ok: true,
        status: 204,
      } as Response;
    };

    const client = createCalendarClient({
      calendarId: "test@calendar.com",
      getAccessToken: getToken,
      fetchFn: mockFetch,
    });

    await client.deleteEvent("event-123");

    expect(capturedUrl).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/test%40calendar.com/events/event-123"
    );
    expect(capturedMethod).toBe("DELETE");
    expect(capturedHeaders["Authorization"]).toBe("Bearer fake-token");
    expect(capturedBody).toBeUndefined();
  });

  it("deleteEvent resolves on 404", async () => {
    const mockFetch: typeof fetch = async () => {
      return {
        ok: false,
        status: 404,
        text: async () => "Not found",
      } as Response;
    };

    const client = createCalendarClient({
      calendarId: "test@calendar.com",
      getAccessToken: getToken,
      fetchFn: mockFetch,
    });

    await client.deleteEvent("event-123");
    // Should not throw
  });

  it("deleteEvent resolves on 410", async () => {
    const mockFetch: typeof fetch = async () => {
      return {
        ok: false,
        status: 410,
        text: async () => "Gone",
      } as Response;
    };

    const client = createCalendarClient({
      calendarId: "test@calendar.com",
      getAccessToken: getToken,
      fetchFn: mockFetch,
    });

    await client.deleteEvent("event-123");
    // Should not throw
  });

  it("deleteEvent rejects on 500 with message starting Google Calendar HTTP 500", async () => {
    const mockFetch: typeof fetch = async () => {
      return {
        ok: false,
        status: 500,
        text: async () => "Internal server error",
      } as Response;
    };

    const client = createCalendarClient({
      calendarId: "test@calendar.com",
      getAccessToken: getToken,
      fetchFn: mockFetch,
    });

    try {
      await client.deleteEvent("event-123");
      expect(true).toBe(false); // should have thrown
    } catch (error) {
      const msg = (error as Error).message;
      expect(msg).toContain("Google Calendar HTTP 500");
      expect(msg).not.toContain("fake-token");
    }
  });

  it("deleteEvent URL-encodes event id with special characters", async () => {
    let capturedUrl = "";

    const mockFetch: typeof fetch = async (url) => {
      capturedUrl = url as string;
      return {
        ok: true,
        status: 204,
      } as Response;
    };

    const client = createCalendarClient({
      calendarId: "test@calendar.com",
      getAccessToken: getToken,
      fetchFn: mockFetch,
    });

    await client.deleteEvent("event/with spaces");

    expect(capturedUrl).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/test%40calendar.com/events/event%2Fwith%20spaces"
    );
  });
});

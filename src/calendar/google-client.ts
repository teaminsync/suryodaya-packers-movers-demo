/**
 * Google Calendar API client
 */

export interface BusyInterval {
  start: Date;
  end: Date;
}

interface CalendarDeps {
  calendarId: string;
  getAccessToken(): Promise<string>;
  fetchFn: typeof fetch;
}

interface FreeBusyResponse {
  calendars: Record<
    string,
    {
      busy?: Array<{ start: string; end: string }>;
      errors?: Array<{ reason: string }>;
    }
  >;
}

interface InsertEventInput {
  summary: string;
  description: string;
  location: string | null;
  start: Date;
  end: Date;
  leadId: string;
}

interface EventResponse {
  id: string;
  htmlLink?: string;
}

export function createCalendarClient(deps: CalendarDeps) {
  async function freeBusy(timeMin: Date, timeMax: Date): Promise<BusyInterval[]> {
    const token = await deps.getAccessToken();

    const body = {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: "Asia/Kolkata",
      items: [{ id: deps.calendarId }],
    };

    const response = await deps.fetchFn("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      const preview = text.slice(0, 200);
      throw new Error(`Google Calendar HTTP ${response.status}: ${preview}`);
    }

    const json = (await response.json()) as FreeBusyResponse;
    const cal = json.calendars[deps.calendarId];

    if (cal.errors && cal.errors.length > 0) {
      throw new Error(`Google freeBusy error: ${cal.errors[0].reason}`);
    }

    const busy = cal.busy || [];
    return busy.map((b) => ({
      start: new Date(b.start),
      end: new Date(b.end),
    }));
  }

  async function insertEvent(input: InsertEventInput): Promise<{ id: string; htmlLink: string | null }> {
    const token = await deps.getAccessToken();

    const body: Record<string, unknown> = {
      summary: input.summary,
      description: input.description,
      start: {
        dateTime: input.start.toISOString(),
        timeZone: "Asia/Kolkata",
      },
      end: {
        dateTime: input.end.toISOString(),
        timeZone: "Asia/Kolkata",
      },
      extendedProperties: {
        private: {
          leadId: input.leadId,
        },
      },
    };

    if (input.location !== null) {
      body.location = input.location;
    }

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(deps.calendarId)}/events`;

    const response = await deps.fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      const preview = text.slice(0, 200);
      throw new Error(`Google Calendar HTTP ${response.status}: ${preview}`);
    }

    const json = (await response.json()) as EventResponse;
    return {
      id: json.id,
      htmlLink: json.htmlLink ?? null,
    };
  }

  return { freeBusy, insertEvent };
}

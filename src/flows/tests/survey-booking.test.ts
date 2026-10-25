import { describe, it, expect } from "@jest/globals";
import {
  buildSlotOfferMessage,
  offerSurveySlots,
  resolveSlotChoice,
  type SurveyBookingDeps,
} from "../survey-booking.js";
import { NO_SLOTS_MESSAGE } from "../booking.js";
import type { ClaimResult } from "../../calendar/survey-calendar.js";
import type { SlotReplyResult } from "../slot-reply.js";

describe("buildSlotOfferMessage", () => {
  it("formats two slots with exact expected text", () => {
    const slots = [
      { label: "Tue, 20 Oct at 3:00 PM" },
      { label: "Wed, 21 Oct at 2:00 PM" },
    ];

    const message = buildSlotOfferMessage(slots);

    expect(message).toBe(
      "Great! Here are available survey times:\n\n" +
      "1. Tue, 20 Oct at 3:00 PM\n" +
      "2. Wed, 21 Oct at 2:00 PM\n\n" +
      "Reply with the number of your preferred time."
    );
  });
});

describe("offerSurveySlots", () => {
  it("returns offered with exact message when slots available", async () => {
    const slots = [
      { label: "Tue, 20 Oct at 3:00 PM", datetime: "2026-10-20T15:00:00.000Z" },
      { label: "Wed, 21 Oct at 2:00 PM", datetime: "2026-10-21T14:00:00.000Z" },
    ];

    const calls: Date[] = [];
    const deps: SurveyBookingDeps = {
      getSlotOptions: async (now: Date) => {
        calls.push(now);
        return slots;
      },
      claimSlot: async () => {
        throw new Error("Should not be called");
      },
    };

    const now = new Date("2026-10-19T10:00:00.000Z");
    const result = await offerSurveySlots(deps, now);

    expect(result.kind).toBe("offered");
    if (result.kind === "offered") {
      expect(result.slots).toEqual(slots);
      expect(result.message).toBe(
        "Great! Here are available survey times:\n\n" +
        "1. Tue, 20 Oct at 3:00 PM\n" +
        "2. Wed, 21 Oct at 2:00 PM\n\n" +
        "Reply with the number of your preferred time."
      );
    }
    expect(calls).toEqual([now]);
  });

  it("returns none with NO_SLOTS_MESSAGE when empty", async () => {
    const deps: SurveyBookingDeps = {
      getSlotOptions: async () => [],
      claimSlot: async () => {
        throw new Error("Should not be called");
      },
    };

    const now = new Date("2026-10-19T10:00:00.000Z");
    const result = await offerSurveySlots(deps, now);

    expect(result.kind).toBe("none");
    if (result.kind === "none") {
      expect(result.message).toBe(NO_SLOTS_MESSAGE);
    }
  });

  it("passes the same Date to getSlotOptions", async () => {
    let capturedNow: Date | null = null;
    const deps: SurveyBookingDeps = {
      getSlotOptions: async (now: Date) => {
        capturedNow = now;
        return [];
      },
      claimSlot: async () => {
        throw new Error("Should not be called");
      },
    };

    const now = new Date("2026-10-19T12:34:56.789Z");
    await offerSurveySlots(deps, now);

    expect(capturedNow).toBe(now);
  });
});

describe("resolveSlotChoice", () => {
  const slots = [
    { label: "Tue, 20 Oct at 3:00 PM", datetime: "2026-10-20T15:00:00.000Z" },
    { label: "Wed, 21 Oct at 2:00 PM", datetime: "2026-10-21T14:00:00.000Z" },
  ];

  it("evaluation none returns not_a_choice with zero calls", async () => {
    const deps: SurveyBookingDeps = {
      getSlotOptions: async () => {
        throw new Error("getSlotOptions should not be called");
      },
      claimSlot: async () => {
        throw new Error("claimSlot should not be called");
      },
    };

    const evaluation: SlotReplyResult = { kind: "none" };
    const result = await resolveSlotChoice(deps, {
      leadId: "lead-123",
      slots,
      evaluation,
      now: new Date("2026-10-19T10:00:00.000Z"),
    });

    expect(result.kind).toBe("not_a_choice");
  });

  it("select + claim ok (status created) returns confirmed", async () => {
    const claimCalls: Array<{ leadId: string; slot: { label: string; datetime: string } }> = [];
    const getSlotOptionsCalls: Date[] = [];

    const claim: ClaimResult = {
      ok: true,
      status: "created",
      eventId: "evt-456",
      eventLink: "https://calendar.example.com/evt-456",
      startsAt: new Date("2026-10-20T15:00:00.000Z"),
      endsAt: new Date("2026-10-20T16:00:00.000Z"),
    };

    const deps: SurveyBookingDeps = {
      getSlotOptions: async (now: Date) => {
        getSlotOptionsCalls.push(now);
        return [];
      },
      claimSlot: async (input) => {
        claimCalls.push(input);
        return claim;
      },
    };

    const evaluation: SlotReplyResult = { kind: "select", index: 0 };
    const result = await resolveSlotChoice(deps, {
      leadId: "lead-123",
      slots,
      evaluation,
      now: new Date("2026-10-19T10:00:00.000Z"),
    });

    expect(result.kind).toBe("confirmed");
    if (result.kind === "confirmed") {
      expect(result.slot).toEqual(slots[0]);
      expect(result.message).toBe(
        "✅ You're booked! Your survey is confirmed for Tue, 20 Oct at 3:00 PM.\n\n" +
        "Our surveyor will visit and spend about 15-30 minutes confirming your exact, itemised quote. " +
        "If you need to change the time, just message us here.\n\n" +
        "— Suryodaya Packers & Movers"
      );
      expect(result.claim).toBe(claim);
    }
    expect(claimCalls).toEqual([{ leadId: "lead-123", slot: slots[0] }]);
    expect(getSlotOptionsCalls).toEqual([]);
  });

  it("select + claim ok (status not_configured) returns confirmed", async () => {
    const claim: ClaimResult = {
      ok: true,
      status: "not_configured",
      eventId: null,
      eventLink: null,
      startsAt: new Date("2026-10-20T15:00:00.000Z"),
      endsAt: new Date("2026-10-20T16:00:00.000Z"),
    };

    const deps: SurveyBookingDeps = {
      getSlotOptions: async () => {
        throw new Error("getSlotOptions should not be called");
      },
      claimSlot: async () => claim,
    };

    const evaluation: SlotReplyResult = { kind: "select", index: 1 };
    const result = await resolveSlotChoice(deps, {
      leadId: "lead-456",
      slots,
      evaluation,
      now: new Date("2026-10-19T10:00:00.000Z"),
    });

    expect(result.kind).toBe("confirmed");
    if (result.kind === "confirmed") {
      expect(result.claim).toBe(claim);
    }
  });

  it("select + claim ok (status failed) returns confirmed", async () => {
    const claim: ClaimResult = {
      ok: true,
      status: "failed",
      eventId: null,
      eventLink: null,
      startsAt: new Date("2026-10-20T15:00:00.000Z"),
      endsAt: new Date("2026-10-20T16:00:00.000Z"),
    };

    const deps: SurveyBookingDeps = {
      getSlotOptions: async () => {
        throw new Error("getSlotOptions should not be called");
      },
      claimSlot: async () => claim,
    };

    const evaluation: SlotReplyResult = { kind: "select", index: 0 };
    const result = await resolveSlotChoice(deps, {
      leadId: "lead-789",
      slots,
      evaluation,
      now: new Date("2026-10-19T10:00:00.000Z"),
    });

    expect(result.kind).toBe("confirmed");
    if (result.kind === "confirmed") {
      expect(result.claim).toBe(claim);
    }
  });

  it("select + conflict + fresh slots returns refreshed with reason taken", async () => {
    const fresh = [
      { label: "Thu, 22 Oct at 10:00 AM", datetime: "2026-10-22T10:00:00.000Z" },
      { label: "Thu, 22 Oct at 3:00 PM", datetime: "2026-10-22T15:00:00.000Z" },
    ];

    const deps: SurveyBookingDeps = {
      getSlotOptions: async () => fresh,
      claimSlot: async () => ({ ok: false, reason: "conflict" }),
    };

    const evaluation: SlotReplyResult = { kind: "select", index: 0 };
    const result = await resolveSlotChoice(deps, {
      leadId: "lead-123",
      slots,
      evaluation,
      now: new Date("2026-10-19T10:00:00.000Z"),
    });

    expect(result.kind).toBe("refreshed");
    if (result.kind === "refreshed") {
      expect(result.reason).toBe("taken");
      expect(result.slots).toEqual(fresh);
      expect(result.message).toBe(
        "Sorry, that time has just been taken. Here are other survey times:\n\n" +
        "1. Thu, 22 Oct at 10:00 AM\n" +
        "2. Thu, 22 Oct at 3:00 PM\n\n" +
        "Reply with the number of your preferred time."
      );
    }
  });

  it("select + conflict + empty slots returns none_left", async () => {
    const deps: SurveyBookingDeps = {
      getSlotOptions: async () => [],
      claimSlot: async () => ({ ok: false, reason: "conflict" }),
    };

    const evaluation: SlotReplyResult = { kind: "select", index: 0 };
    const result = await resolveSlotChoice(deps, {
      leadId: "lead-123",
      slots,
      evaluation,
      now: new Date("2026-10-19T10:00:00.000Z"),
    });

    expect(result.kind).toBe("none_left");
    if (result.kind === "none_left") {
      expect(result.message).toBe(NO_SLOTS_MESSAGE);
    }
  });

  it("stale + fresh available returns refreshed with reason stale", async () => {
    const fresh = [
      { label: "Thu, 22 Oct at 10:00 AM", datetime: "2026-10-22T10:00:00.000Z" },
    ];

    const claimCalls: Array<unknown> = [];
    const deps: SurveyBookingDeps = {
      getSlotOptions: async () => fresh,
      claimSlot: async (input) => {
        claimCalls.push(input);
        throw new Error("claimSlot should not be called for stale");
      },
    };

    const evaluation: SlotReplyResult = { kind: "stale" };
    const result = await resolveSlotChoice(deps, {
      leadId: "lead-123",
      slots,
      evaluation,
      now: new Date("2026-10-19T10:00:00.000Z"),
    });

    expect(result.kind).toBe("refreshed");
    if (result.kind === "refreshed") {
      expect(result.reason).toBe("stale");
      expect(result.slots).toEqual(fresh);
      expect(result.message).toBe(
        "Those times have already passed. Here are fresh survey times:\n\n" +
        "1. Thu, 22 Oct at 10:00 AM\n\n" +
        "Reply with the number of your preferred time."
      );
    }
    expect(claimCalls).toEqual([]);
  });

  it("stale + empty returns none_left", async () => {
    const deps: SurveyBookingDeps = {
      getSlotOptions: async () => [],
      claimSlot: async () => {
        throw new Error("claimSlot should not be called");
      },
    };

    const evaluation: SlotReplyResult = { kind: "stale" };
    const result = await resolveSlotChoice(deps, {
      leadId: "lead-123",
      slots,
      evaluation,
      now: new Date("2026-10-19T10:00:00.000Z"),
    });

    expect(result.kind).toBe("none_left");
    if (result.kind === "none_left") {
      expect(result.message).toBe(NO_SLOTS_MESSAGE);
    }
  });

  it("claimSlot throws, resolveSlotChoice rejects", async () => {
    const testError = new Error("Calendar service unavailable");

    const deps: SurveyBookingDeps = {
      getSlotOptions: async () => {
        throw new Error("getSlotOptions should not be called");
      },
      claimSlot: async () => {
        throw testError;
      },
    };

    const evaluation: SlotReplyResult = { kind: "select", index: 0 };

    await expect(
      resolveSlotChoice(deps, {
        leadId: "lead-123",
        slots,
        evaluation,
        now: new Date("2026-10-19T10:00:00.000Z"),
      })
    ).rejects.toThrow("Calendar service unavailable");
  });

  it("select with out-of-range index returns not_a_choice", async () => {
    const deps: SurveyBookingDeps = {
      getSlotOptions: async () => {
        throw new Error("getSlotOptions should not be called");
      },
      claimSlot: async () => {
        throw new Error("claimSlot should not be called");
      },
    };

    const evaluation: SlotReplyResult = { kind: "select", index: 5 };
    const result = await resolveSlotChoice(deps, {
      leadId: "lead-123",
      slots,
      evaluation,
      now: new Date("2026-10-19T10:00:00.000Z"),
    });

    expect(result.kind).toBe("not_a_choice");
  });

  it("stale + fresh available passes same Date object to getSlotOptions", async () => {
    const capturedDates: Date[] = [];
    const fresh = [
      { label: "Thu, 22 Oct at 10:00 AM", datetime: "2026-10-22T10:00:00.000Z" },
    ];

    const deps: SurveyBookingDeps = {
      getSlotOptions: async (now: Date) => {
        capturedDates.push(now);
        return fresh;
      },
      claimSlot: async () => {
        throw new Error("claimSlot should not be called");
      },
    };

    const evaluation: SlotReplyResult = { kind: "stale" };
    const now = new Date("2026-10-19T10:00:00.000Z");
    await resolveSlotChoice(deps, {
      leadId: "lead-123",
      slots,
      evaluation,
      now,
    });

    expect(capturedDates[0]).toBe(now);
  });

  it("select + conflict + fresh available passes same Date object to getSlotOptions", async () => {
    const capturedDates: Date[] = [];
    const fresh = [
      { label: "Thu, 22 Oct at 10:00 AM", datetime: "2026-10-22T10:00:00.000Z" },
    ];

    const deps: SurveyBookingDeps = {
      getSlotOptions: async (now: Date) => {
        capturedDates.push(now);
        return fresh;
      },
      claimSlot: async () => ({ ok: false, reason: "conflict" }),
    };

    const evaluation: SlotReplyResult = { kind: "select", index: 0 };
    const now = new Date("2026-10-19T10:00:00.000Z");
    await resolveSlotChoice(deps, {
      leadId: "lead-123",
      slots,
      evaluation,
      now,
    });

    expect(capturedDates[0]).toBe(now);
  });
});

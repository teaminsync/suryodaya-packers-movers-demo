import { describe, it, expect } from "@jest/globals";
import { buildFreshSlotsMessage, NO_SLOTS_MESSAGE } from "../booking.js";

describe("Fresh slots messages", () => {
  const slots = [
    { label: "Tue, 20 Oct at 3:00 PM" },
    { label: "Wed, 21 Oct at 2:00 PM" },
  ];

  it("stale message matches exact expected text", () => {
    const message = buildFreshSlotsMessage(slots, "stale");

    expect(message).toBe(
      "Those times have already passed. Here are fresh survey times:\n\n" +
      "1. Tue, 20 Oct at 3:00 PM\n" +
      "2. Wed, 21 Oct at 2:00 PM\n\n" +
      "Reply with the number of your preferred time."
    );
  });

  it("taken message matches exact expected text", () => {
    const message = buildFreshSlotsMessage(slots, "taken");

    expect(message).toBe(
      "Sorry, that time has just been taken. Here are other survey times:\n\n" +
      "1. Tue, 20 Oct at 3:00 PM\n" +
      "2. Wed, 21 Oct at 2:00 PM\n\n" +
      "Reply with the number of your preferred time."
    );
  });

  it("NO_SLOTS_MESSAGE is correct", () => {
    expect(NO_SLOTS_MESSAGE).toBe(
      "I'm sorry, I couldn't find any open survey times right now. A team member will contact you shortly to arrange a time."
    );
  });
});

/**
 * Tests for outreach policy
 */

import { decideOutreach, isServiceWindowOpen } from "../policy.js";

describe("decideOutreach", () => {
  it("requires human call when phone is null", () => {
    const result = decideOutreach({
      phoneE164: null,
      consent: "granted",
      windowOpen: true,
    });

    expect(result.action).toBe("needs_human_call");
  });

  it("blocks when customer opted out", () => {
    const result = decideOutreach({
      phoneE164: "+919876543210",
      consent: "withdrawn",
      windowOpen: true,
    });

    expect(result.action).toBe("blocked_opted_out");
  });

  it("allows freeform reply when window is open", () => {
    const result = decideOutreach({
      phoneE164: "+919876543210",
      consent: "unknown",
      windowOpen: true,
    });

    expect(result.action).toBe("reply_freeform");
  });

  it("sends template when consent granted and window closed", () => {
    const result = decideOutreach({
      phoneE164: "+919876543210",
      consent: "granted",
      windowOpen: false,
    });

    expect(result.action).toBe("send_template");
  });

  it("offers click to chat when no consent and window closed", () => {
    const result = decideOutreach({
      phoneE164: "+919876543210",
      consent: "unknown",
      windowOpen: false,
    });

    expect(result.action).toBe("offer_click_to_chat");
  });

  it("checks service window correctly", () => {
    const now = new Date("2026-10-16T12:00:00.000Z");

    expect(isServiceWindowOpen(null, now)).toBe(false);

    const time23h59m = new Date(now.getTime() - 23 * 3600 * 1000 - 59 * 60 * 1000);
    expect(isServiceWindowOpen(time23h59m.toISOString(), now)).toBe(true);

    const time24h = new Date(now.getTime() - 24 * 3600 * 1000);
    expect(isServiceWindowOpen(time24h.toISOString(), now)).toBe(true);

    const time24h1s = new Date(now.getTime() - 24 * 3600 * 1000 - 1000);
    expect(isServiceWindowOpen(time24h1s.toISOString(), now)).toBe(false);

    expect(isServiceWindowOpen("garbage", now)).toBe(false);
  });

  it("accepts Date and ISO string and future timestamps count as open", () => {
    const now = new Date("2026-10-16T12:00:00.000Z");
    const past = new Date(now.getTime() - 1000);

    expect(isServiceWindowOpen(past, now)).toBe(true);
    expect(isServiceWindowOpen(past.toISOString(), now)).toBe(true);

    const future = new Date(now.getTime() + 1000);
    expect(isServiceWindowOpen(future.toISOString(), now)).toBe(true);
  });
});

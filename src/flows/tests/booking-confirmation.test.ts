/**
 * Tests for booking confirmation message
 */

import { buildConfirmationMessage } from "../booking.js";
import { COMPANY_PROFILE } from "../../company/profile.js";

describe("buildConfirmationMessage", () => {
  it("should contain confirmed slot, itemised (not itemized)", () => {
    const message = buildConfirmationMessage({
      label: "Mon, 5 Oct at 10:00 AM",
      datetime: "2026-10-05T10:00:00.000Z",
    });

    expect(message).toContain("confirmed for Mon, 5 Oct at 10:00 AM");
    expect(message).toContain("itemised");
    expect(message).not.toContain("itemized");
  });

  it("should contain em dash before company name", () => {
    const message = buildConfirmationMessage({
      label: "Mon, 5 Oct at 10:00 AM",
      datetime: "2026-10-05T10:00:00.000Z",
    });

    expect(message).toContain("\u2014 " + COMPANY_PROFILE.name);
  });

  it("should NOT contain markdown bullet lines", () => {
    const message = buildConfirmationMessage({
      label: "Mon, 5 Oct at 10:00 AM",
      datetime: "2026-10-05T10:00:00.000Z",
    });

    expect(message).not.toContain("\n- ");
  });
});

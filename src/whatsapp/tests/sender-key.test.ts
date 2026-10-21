/**
 * Tests for sender-key.ts
 */

import { senderKeyFromPayload } from "../sender-key.js";

describe("sender-key", () => {
  describe("senderKeyFromPayload", () => {
    it("should return sender from normal payload", () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: "1234567890",
                      id: "wamid.123",
                      text: { body: "hello" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      expect(senderKeyFromPayload(payload)).toBe("1234567890");
    });

    it("should return unknown for status update with no messages", () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  statuses: [{ id: "wamid.123", status: "sent" }],
                },
              },
            ],
          },
        ],
      };
      expect(senderKeyFromPayload(payload)).toBe("unknown");
    });

    it("should return unknown for null payload", () => {
      expect(senderKeyFromPayload(null)).toBe("unknown");
    });

    it("should return unknown for undefined payload", () => {
      expect(senderKeyFromPayload(undefined)).toBe("unknown");
    });

    it("should return unknown for number payload", () => {
      expect(senderKeyFromPayload(123)).toBe("unknown");
    });

    it("should return unknown for empty object", () => {
      expect(senderKeyFromPayload({})).toBe("unknown");
    });

    it("should return unknown for empty entry array", () => {
      expect(senderKeyFromPayload({ entry: [] })).toBe("unknown");
    });

    it("should return unknown for entry with no changes", () => {
      expect(senderKeyFromPayload({ entry: [{ changes: [] }] })).toBe("unknown");
    });

    it("should return unknown when from is empty string", () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [{ from: "", id: "wamid.123" }],
                },
              },
            ],
          },
        ],
      };
      expect(senderKeyFromPayload(payload)).toBe("unknown");
    });

    it("should return unknown when from is a number", () => {
      const payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [{ from: 1234567890, id: "wamid.123" }],
                },
              },
            ],
          },
        ],
      };
      expect(senderKeyFromPayload(payload)).toBe("unknown");
    });
  });
});

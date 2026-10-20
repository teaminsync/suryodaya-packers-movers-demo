/**
 * Tests for Instagram payload parsing
 */

import { parseInstagramPayload } from "../parse.js";

describe("parseInstagramPayload", () => {
  it("parses one text message with all fields", () => {
    const body = {
      object: "instagram",
      entry: [
        {
          id: "17841400000000099",
          time: 1697740800,
          messaging: [
            {
              sender: { id: "17841400000000001" },
              recipient: { id: "17841400000000099" },
              timestamp: 1697740800000,
              message: {
                mid: "m_12345",
                text: "Hello there",
              },
            },
          ],
        },
      ],
    };

    const result = parseInstagramPayload(body, "17841400000000099");

    expect(result.events.length).toBe(1);
    expect(result.ignored).toBe(0);
    expect(result.events[0]).toEqual({
      igsid: "17841400000000001",
      accountId: "17841400000000099",
      mid: "m_12345",
      timestamp: 1697740800000,
      text: "Hello there",
      attachmentType: null,
    });
  });

  it("returns no events for non-instagram object null and number body", () => {
    expect(parseInstagramPayload({ object: "whatsapp" }, undefined).events).toEqual([]);
    expect(parseInstagramPayload(null, undefined).events).toEqual([]);
    expect(parseInstagramPayload(5, undefined).events).toEqual([]);
  });

  it("ignores echoes based on is_echo sender equals ownAccountId and sender equals entry id", () => {
    const body1 = {
      object: "instagram",
      entry: [
        {
          id: "17841400000000099",
          messaging: [
            {
              sender: { id: "17841400000000001" },
              recipient: { id: "17841400000000099" },
              message: { mid: "m1", text: "hi", is_echo: true },
            },
          ],
        },
      ],
    };

    expect(parseInstagramPayload(body1, undefined).ignored).toBe(1);
    expect(parseInstagramPayload(body1, undefined).events.length).toBe(0);

    const body2 = {
      object: "instagram",
      entry: [
        {
          id: "17841400000000099",
          messaging: [
            {
              sender: { id: "17841400000000099" },
              recipient: { id: "17841400000000099" },
              message: { mid: "m2", text: "hi" },
            },
          ],
        },
      ],
    };

    expect(parseInstagramPayload(body2, "17841400000000099").ignored).toBe(1);
    expect(parseInstagramPayload(body2, "17841400000000099").events.length).toBe(0);

    const body3 = {
      object: "instagram",
      entry: [
        {
          id: "17841400000000099",
          messaging: [
            {
              sender: { id: "17841400000000099" },
              recipient: { id: "17841400000000050" },
              message: { mid: "m3", text: "hi" },
            },
          ],
        },
      ],
    };

    expect(parseInstagramPayload(body3, undefined).ignored).toBe(1);
    expect(parseInstagramPayload(body3, undefined).events.length).toBe(0);
  });

  it("ignores items without a message object", () => {
    const body = {
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: "1" },
              recipient: { id: "2" },
              read: { watermark: 123 },
            },
            {
              sender: { id: "1" },
              recipient: { id: "2" },
              reaction: { mid: "m1", reaction: "\u2764\uFE0F" },
            },
            {
              sender: { id: "1" },
              recipient: { id: "2" },
              postback: { payload: "GET_STARTED" },
            },
          ],
        },
      ],
    };

    const result = parseInstagramPayload(body, undefined);
    expect(result.events.length).toBe(0);
    expect(result.ignored).toBe(3);
  });

  it("handles attachments and text plus attachment", () => {
    const body1 = {
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: "1" },
              recipient: { id: "2" },
              message: {
                mid: "m1",
                attachments: [{ type: "image", payload: { url: "https://example.com/img.jpg" } }],
              },
            },
          ],
        },
      ],
    };

    const result1 = parseInstagramPayload(body1, undefined);
    expect(result1.events.length).toBe(1);
    expect(result1.events[0].text).toBeNull();
    expect(result1.events[0].attachmentType).toBe("image");

    const body2 = {
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: "1" },
              recipient: { id: "2" },
              message: {
                mid: "m2",
                text: "Check this out",
                attachments: [{ type: "video", payload: { url: "https://example.com/vid.mp4" } }],
              },
            },
          ],
        },
      ],
    };

    const result2 = parseInstagramPayload(body2, undefined);
    expect(result2.events.length).toBe(1);
    expect(result2.events[0].text).toBe("Check this out");
    expect(result2.events[0].attachmentType).toBe("video");
  });

  it("ignores message with whitespace-only text and no attachment missing mid", () => {
    const body1 = {
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: "1" },
              recipient: { id: "2" },
              message: { mid: "m1", text: "   " },
            },
          ],
        },
      ],
    };

    expect(parseInstagramPayload(body1, undefined).ignored).toBe(1);
    expect(parseInstagramPayload(body1, undefined).events.length).toBe(0);

    const body2 = {
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: "1" },
              recipient: { id: "2" },
              message: { text: "hi" },
            },
          ],
        },
      ],
    };

    expect(parseInstagramPayload(body2, undefined).ignored).toBe(1);
    expect(parseInstagramPayload(body2, undefined).events.length).toBe(0);
  });

  it("preserves order across entries and messages", () => {
    const body = {
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: "1" },
              recipient: { id: "2" },
              message: { mid: "m1", text: "first" },
            },
            {
              sender: { id: "1" },
              recipient: { id: "2" },
              message: { mid: "m2", text: "second" },
            },
          ],
        },
        {
          messaging: [
            {
              sender: { id: "1" },
              recipient: { id: "2" },
              message: { mid: "m3", text: "third" },
            },
            {
              sender: { id: "1" },
              recipient: { id: "2" },
              message: { mid: "m4", text: "fourth" },
            },
          ],
        },
      ],
    };

    const result = parseInstagramPayload(body, undefined);
    expect(result.events.length).toBe(4);
    expect(result.events.map((e) => e.mid)).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("never throws on garbage input and handles non-number timestamp", () => {
    const inputs = [
      null,
      5,
      "x",
      [],
      { entry: 5 },
      { object: "instagram", entry: [null] },
      { object: "instagram", entry: [{ messaging: [5] }] },
    ];

    for (const input of inputs) {
      const result = parseInstagramPayload(input, undefined);
      expect(result.events).toEqual([]);
    }

    const body = {
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: "1" },
              recipient: { id: "2" },
              timestamp: "not-a-number",
              message: { mid: "m1", text: "hi" },
            },
          ],
        },
      ],
    };

    const result = parseInstagramPayload(body, undefined);
    expect(result.events[0].timestamp).toBeNull();
  });

  it("parses Meta dashboard changes sample", () => {
    const body = {
      object: "instagram",
      entry: [
        {
          id: "0",
          time: 1792470188,
          changes: [
            {
              field: "messages",
              value: {
                sender: { id: "12334" },
                recipient: { id: "23245" },
                timestamp: "1527459824",
                message: { mid: "random_mid", text: "random_text" },
              },
            },
          ],
        },
      ],
    };

    const result = parseInstagramPayload(body, undefined);

    expect(result.events.length).toBe(1);
    expect(result.ignored).toBe(0);
    expect(result.events[0]).toEqual({
      igsid: "12334",
      accountId: "23245",
      mid: "random_mid",
      timestamp: 1527459824,
      text: "random_text",
      attachmentType: null,
    });
  });

  it("ignores changes with non-messages field or missing value", () => {
    const body1 = {
      object: "instagram",
      entry: [
        {
          changes: [
            {
              field: "comments",
              value: { sender: { id: "1" }, recipient: { id: "2" }, message: { mid: "m1", text: "hi" } },
            },
          ],
        },
      ],
    };

    expect(parseInstagramPayload(body1, undefined).ignored).toBe(1);
    expect(parseInstagramPayload(body1, undefined).events.length).toBe(0);

    const body2 = {
      object: "instagram",
      entry: [
        {
          changes: [{ field: "messages" }],
        },
      ],
    };

    expect(parseInstagramPayload(body2, undefined).ignored).toBe(1);
    expect(parseInstagramPayload(body2, undefined).events.length).toBe(0);
  });

  it("preserves messaging then changes order and handles string timestamp", () => {
    const body = {
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: "1" },
              recipient: { id: "2" },
              message: { mid: "m1", text: "msg" },
            },
          ],
          changes: [
            {
              field: "messages",
              value: {
                sender: { id: "3" },
                recipient: { id: "4" },
                message: { mid: "m2", text: "chg" },
              },
            },
          ],
        },
      ],
    };

    const result = parseInstagramPayload(body, undefined);
    expect(result.events.length).toBe(2);
    expect(result.events[0].mid).toBe("m1");
    expect(result.events[1].mid).toBe("m2");

    const body2 = {
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: "1" },
              recipient: { id: "2" },
              timestamp: "1700000000",
              message: { mid: "m1", text: "hi" },
            },
          ],
        },
      ],
    };

    const result2 = parseInstagramPayload(body2, undefined);
    expect(result2.events[0].timestamp).toBe(1700000000);

    const body3 = {
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: "1" },
              recipient: { id: "2" },
              timestamp: "abc",
              message: { mid: "m1", text: "hi" },
            },
          ],
        },
      ],
    };

    const result3 = parseInstagramPayload(body3, undefined);
    expect(result3.events[0].timestamp).toBeNull();
  });
});

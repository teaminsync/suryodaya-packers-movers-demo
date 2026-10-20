/**
 * Tests for Instagram sample payload generator
 */

import { buildInstagramSample } from "../sample.js";
import { parseInstagramPayload } from "../parse.js";

describe("buildInstagramSample", () => {
  it("default sample parses to one event", () => {
    const sample = buildInstagramSample();
    const parsed = parseInstagramPayload(sample, "17841400000000099");

    expect(parsed.events.length).toBe(1);
    expect(parsed.ignored).toBe(0);
    expect(parsed.events[0].text).toBe("Hi");
  });

  it("echo true yields ignored event", () => {
    const sample = buildInstagramSample({ echo: true });
    const parsed = parseInstagramPayload(sample, "17841400000000099");

    expect(parsed.events.length).toBe(0);
    expect(parsed.ignored).toBe(1);
  });

  it("attachment with no text yields event with attachment type", () => {
    const sample = buildInstagramSample({ text: null, attachmentType: "image" });
    const parsed = parseInstagramPayload(sample, "17841400000000099");

    expect(parsed.events.length).toBe(1);
    expect(parsed.events[0].text).toBeNull();
    expect(parsed.events[0].attachmentType).toBe("image");
  });
});

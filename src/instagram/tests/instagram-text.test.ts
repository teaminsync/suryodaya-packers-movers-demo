/**
 * Tests for Instagram message formatting
 */

import { splitForInstagram, buildInstagramSendBody } from "../messages.js";

describe("splitForInstagram", () => {
  it("returns trimmed text for short messages", () => {
    expect(splitForInstagram("  Hello  ")).toEqual(["Hello"]);
  });

  it("returns empty array for empty or whitespace-only text", () => {
    expect(splitForInstagram("")).toEqual([]);
    expect(splitForInstagram("   ")).toEqual([]);
  });

  it("splits long text without cutting words", () => {
    const text = "word ".repeat(600);
    const chunks = splitForInstagram(text);

    for (const chunk of chunks) {
      const bytes = new TextEncoder().encode(chunk).length;
      expect(bytes).toBeLessThanOrEqual(950);
    }

    const words = text.trim().split(/\s+/);
    const reconstructedWords: string[] = [];
    for (const chunk of chunks) {
      reconstructedWords.push(...chunk.split(/\s+/));
    }

    expect(reconstructedWords).toEqual(words);
  });

  it("splits at paragraph break when present", () => {
    const text = "x".repeat(900) + "\n\n" + "y".repeat(100);
    const chunks = splitForInstagram(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toContain("x");
    expect(chunks[0]).not.toContain("y");
  });

  it("preserves multi-byte characters without breaking surrogates", () => {
    const devanagari = "\u0939".repeat(400);
    const emoji = "\u{1F600}".repeat(300);
    const text = devanagari + emoji;

    const chunks = splitForInstagram(text);

    for (const chunk of chunks) {
      const bytes = new TextEncoder().encode(chunk).length;
      expect(bytes).toBeLessThanOrEqual(950);
      expect(new TextDecoder().decode(new TextEncoder().encode(chunk))).toBe(chunk);
    }

    expect(chunks.join("")).toBe(text);
  });

  it("builds Instagram send body", () => {
    expect(buildInstagramSendBody("123", "hi")).toEqual({
      recipient: { id: "123" },
      message: { text: "hi" },
    });
  });
});

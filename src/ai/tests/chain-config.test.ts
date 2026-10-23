/**
 * Tests for chain configuration parsing
 */

import {
  parseChain,
  defaultTextChain,
  defaultImageChain,
  resolveChain,
  type ProviderKeys,
} from "../chain-config.js";

describe("parseChain", () => {
  it("undefined returns not provided", () => {
    const result = parseChain(undefined);
    expect(result.provided).toBe(false);
    expect(result.names).toEqual([]);
    expect(result.unknown).toEqual([]);
  });

  it("empty string returns not provided", () => {
    const result = parseChain("");
    expect(result.provided).toBe(false);
  });

  it("whitespace only returns not provided", () => {
    const result = parseChain("   ");
    expect(result.provided).toBe(false);
  });

  it("comma only returns provided with empty names", () => {
    const result = parseChain(",");
    expect(result.provided).toBe(true);
    expect(result.names).toEqual([]);
  });

  it("groq,gemini parses correctly", () => {
    const result = parseChain("groq,gemini");
    expect(result.provided).toBe(true);
    expect(result.names).toEqual(["groq", "gemini"]);
    expect(result.unknown).toEqual([]);
  });

  it("Gemini, GROQ normalizes case and trims", () => {
    const result = parseChain(" Gemini , GROQ ");
    expect(result.provided).toBe(true);
    expect(result.names).toEqual(["gemini", "groq"]);
  });

  it("gemini,gemini,groq removes duplicates, first occurrence wins", () => {
    const result = parseChain("gemini,gemini,groq");
    expect(result.provided).toBe(true);
    expect(result.names).toEqual(["gemini", "groq"]);
  });

  it("banana,groq returns unknown banana", () => {
    const result = parseChain("banana,groq");
    expect(result.provided).toBe(true);
    expect(result.names).toEqual(["groq"]);
    expect(result.unknown).toEqual(["banana"]);
  });
});

describe("defaultTextChain", () => {
  it("groq and gemini returns groq then gemini", () => {
    const keys: ProviderKeys = { claude: false, gemini: true, groq: true };
    expect(defaultTextChain(keys)).toEqual(["groq", "gemini"]);
  });

  it("only gemini returns gemini", () => {
    const keys: ProviderKeys = { claude: false, gemini: true, groq: false };
    expect(defaultTextChain(keys)).toEqual(["gemini"]);
  });

  it("only groq returns groq", () => {
    const keys: ProviderKeys = { claude: false, gemini: false, groq: true };
    expect(defaultTextChain(keys)).toEqual(["groq"]);
  });

  it("none returns empty", () => {
    const keys: ProviderKeys = { claude: false, gemini: false, groq: false };
    expect(defaultTextChain(keys)).toEqual([]);
  });

  it("claude key does not add claude", () => {
    const keys: ProviderKeys = { claude: true, gemini: true, groq: true };
    expect(defaultTextChain(keys)).toEqual(["groq", "gemini"]);
  });
});

describe("defaultImageChain", () => {
  it("groq and gemini returns gemini then groq", () => {
    const keys: ProviderKeys = { claude: false, gemini: true, groq: true };
    expect(defaultImageChain(keys)).toEqual(["gemini", "groq"]);
  });

  it("only gemini returns gemini", () => {
    const keys: ProviderKeys = { claude: false, gemini: true, groq: false };
    expect(defaultImageChain(keys)).toEqual(["gemini"]);
  });

  it("only groq returns groq", () => {
    const keys: ProviderKeys = { claude: false, gemini: false, groq: true };
    expect(defaultImageChain(keys)).toEqual(["groq"]);
  });

  it("claude key does not add claude", () => {
    const keys: ProviderKeys = { claude: true, gemini: true, groq: true };
    expect(defaultImageChain(keys)).toEqual(["gemini", "groq"]);
  });
});

describe("resolveChain", () => {
  it("not provided returns defaults with usedDefault true", () => {
    const keys: ProviderKeys = { claude: false, gemini: true, groq: true };
    const defaults = ["groq", "gemini"] as const;
    const result = resolveChain(undefined, keys, defaults);

    expect(result.names).toEqual(["groq", "gemini"]);
    expect(result.usedDefault).toBe(true);
    expect(result.provided).toBe(false);
    expect(result.skippedNoKey).toEqual([]);
  });

  it("provided with a missing key marks skippedNoKey", () => {
    const keys: ProviderKeys = { claude: false, gemini: false, groq: true };
    const result = resolveChain("gemini,groq", keys, []);

    expect(result.names).toEqual(["groq"]);
    expect(result.skippedNoKey).toEqual(["gemini"]);
    expect(result.usedDefault).toBe(false);
    expect(result.provided).toBe(true);
  });

  it("provided with all keys present keeps order", () => {
    const keys: ProviderKeys = { claude: false, gemini: true, groq: true };
    const result = resolveChain("gemini,groq", keys, []);

    expect(result.names).toEqual(["gemini", "groq"]);
    expect(result.skippedNoKey).toEqual([]);
    expect(result.usedDefault).toBe(false);
  });
});

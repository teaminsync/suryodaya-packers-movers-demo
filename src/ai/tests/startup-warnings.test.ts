/**
 * Tests for AI chain startup warnings
 */

import { describe, it, expect } from "@jest/globals";
import { aiChainWarnings } from "../startup-warnings.js";

describe("aiChainWarnings", () => {
  it("warns when Anthropic key is set but claude not in any chain", () => {
    const warnings = aiChainWarnings({
      anthropicKeySet: true,
      textChain: ["gemini", "groq"],
      imageChain: ["gemini"],
    });

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("Anthropic");
    expect(warnings[0]).toContain("not used");
  });

  it("warns when claude is in text chain but key not set", () => {
    const warnings = aiChainWarnings({
      anthropicKeySet: false,
      textChain: ["claude", "gemini"],
      imageChain: ["gemini"],
    });

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("claude");
    expect(warnings[0]).toContain("key is not set");
  });

  it("warns when claude is in image chain but key not set", () => {
    const warnings = aiChainWarnings({
      anthropicKeySet: false,
      textChain: ["gemini"],
      imageChain: ["claude", "gemini"],
    });

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("claude");
    expect(warnings[0]).toContain("key is not set");
  });

  it("returns no warnings when key set and claude in text chain", () => {
    const warnings = aiChainWarnings({
      anthropicKeySet: true,
      textChain: ["claude", "gemini"],
      imageChain: ["gemini"],
    });

    expect(warnings).toEqual([]);
  });

  it("returns no warnings when key set and claude in image chain", () => {
    const warnings = aiChainWarnings({
      anthropicKeySet: true,
      textChain: ["gemini"],
      imageChain: ["claude"],
    });

    expect(warnings).toEqual([]);
  });

  it("returns no warnings when key not set and claude not in chains", () => {
    const warnings = aiChainWarnings({
      anthropicKeySet: false,
      textChain: ["gemini", "groq"],
      imageChain: ["gemini"],
    });

    expect(warnings).toEqual([]);
  });

  it("returns no warnings when key set and claude in both chains", () => {
    const warnings = aiChainWarnings({
      anthropicKeySet: true,
      textChain: ["claude", "gemini"],
      imageChain: ["claude", "gemini"],
    });

    expect(warnings).toEqual([]);
  });
});

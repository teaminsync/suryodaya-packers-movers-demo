/**
 * Tests for Claude key validation
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { ClaudeAdapter } from "../providers/claude.js";

describe("ClaudeAdapter validateKey", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.ANTHROPIC_API_KEY;
  let warnings: string[] = [];
  const originalWarn = console.warn;

  beforeEach(() => {
    warnings = [];
    console.warn = (...args: any[]) => {
      warnings.push(args.join(" "));
    };
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    process.env.ANTHROPIC_API_KEY = originalEnv;
  });

  it("returns true for ok response with no warning", async () => {
    globalThis.fetch = async () =>
      ({
        ok: true,
        status: 200,
      } as Response);

    const adapter = new ClaudeAdapter();
    const result = await adapter.validateKey();

    expect(result).toBe(true);
    expect(warnings.length).toBe(0);
  });

  it("returns false for HTTP 400 and logs error with type and message", async () => {
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 400,
        json: async () => ({
          type: "error",
          error: {
            type: "invalid_request_error",
            message: "Your credit balance is too low to access the Anthropic API.",
          },
        }),
        text: async () => JSON.stringify({
          type: "error",
          error: {
            type: "invalid_request_error",
            message: "Your credit balance is too low to access the Anthropic API.",
          },
        }),
      } as Response);

    const adapter = new ClaudeAdapter();
    const result = await adapter.validateKey();

    expect(result).toBe(false);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("400");
    expect(warnings[0]).toContain("invalid_request_error");
    expect(warnings[0]).toContain("credit balance");
  });

  it("redacts API keys from error messages", async () => {
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 401,
        json: async () => ({
          type: "error",
          error: {
            type: "authentication_error",
            message: "Invalid API key sk-ant-api03-abc123 provided",
          },
        }),
        text: async () => JSON.stringify({
          type: "error",
          error: {
            type: "authentication_error",
            message: "Invalid API key sk-ant-api03-abc123 provided",
          },
        }),
      } as Response);

    const adapter = new ClaudeAdapter();
    const result = await adapter.validateKey();

    expect(result).toBe(false);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).not.toContain("sk-ant-api03-abc123");
    expect(warnings[0]).toContain("[redacted]");
  });

  it("returns false on network error and logs only error message", async () => {
    globalThis.fetch = async () => {
      throw new Error("Network connection failed");
    };

    const adapter = new ClaudeAdapter();
    const result = await adapter.validateKey();

    expect(result).toBe(false);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("Network connection failed");
    expect(warnings[0]).not.toContain("Error:");
    expect(warnings[0]).not.toContain("at ");
  });

  it("handles JSON parse errors gracefully", async () => {
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("Invalid JSON");
        },
        text: async () => "Internal server error occurred",
      } as Response);

    const adapter = new ClaudeAdapter();
    const result = await adapter.validateKey();

    expect(result).toBe(false);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("500");
    expect(warnings[0]).toContain("Internal server error");
  });

  it("truncates long error messages to 200 characters", async () => {
    const longMessage = "a".repeat(300);
    globalThis.fetch = async () =>
      ({
        ok: false,
        status: 400,
        json: async () => ({
          type: "error",
          error: {
            type: "error",
            message: longMessage,
          },
        }),
        text: async () => JSON.stringify({
          type: "error",
          error: {
            type: "error",
            message: longMessage,
          },
        }),
      } as Response);

    const adapter = new ClaudeAdapter();
    const result = await adapter.validateKey();

    expect(result).toBe(false);
    expect(warnings.length).toBe(1);
    expect(warnings[0].length).toBeLessThanOrEqual(200);
  });
});

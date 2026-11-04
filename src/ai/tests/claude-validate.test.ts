/**
 * Tests for Claude key validation
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { ClaudeAdapter } from "../providers/claude.js";

describe("ClaudeAdapter validateKey", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.ANTHROPIC_API_KEY;
  let warnings: string[] = [];
  let errors: string[] = [];
  const originalWarn = console.warn;
  const originalError = console.error;

  beforeEach(() => {
    warnings = [];
    errors = [];
    console.warn = (...args: any[]) => {
      warnings.push(args.join(" "));
    };
    console.error = (...args: any[]) => {
      errors.push(args.join(" "));
    };
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    console.error = originalError;
    process.env.ANTHROPIC_API_KEY = originalEnv;
  });

  it("returns true for ok 200 response with no warn or error", async () => {
    globalThis.fetch = async () => new Response("{}", { status: 200 });

    const adapter = new ClaudeAdapter();
    const result = await adapter.validateKey();

    expect(result).toBe(true);
    expect(warnings.length).toBe(0);
    expect(errors.length).toBe(0);
  });

  it("returns false for HTTP 400 with JSON error and logs detail", async () => {
    const body = JSON.stringify({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "Your credit balance is too low to access the Anthropic API.",
      },
    });

    globalThis.fetch = async () => new Response(body, { status: 400 });

    const adapter = new ClaudeAdapter();
    const result = await adapter.validateKey();

    expect(result).toBe(false);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("400");
    expect(warnings[0]).toContain("invalid_request_error");
    expect(warnings[0]).toContain("credit balance");
    expect(errors.length).toBe(0);
  });

  it("handles 502 HTML body without 'Body is unusable' error", async () => {
    const body = "<html>Bad gateway</html>";

    globalThis.fetch = async () => new Response(body, { status: 502 });

    const adapter = new ClaudeAdapter();
    const result = await adapter.validateKey();

    expect(result).toBe(false);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("502");
    expect(warnings[0]).toContain("Bad gateway");
    expect(warnings[0]).not.toContain("Body is unusable");
    expect(errors.length).toBe(0);
  });

  it("handles empty body with status 500", async () => {
    globalThis.fetch = async () => new Response("", { status: 500 });

    const adapter = new ClaudeAdapter();
    const result = await adapter.validateKey();

    expect(result).toBe(false);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("500");
    expect(errors.length).toBe(0);
  });

  it("redacts API keys from error messages", async () => {
    const body = JSON.stringify({
      type: "error",
      error: {
        type: "authentication_error",
        message: "Invalid API key sk-ant-api03-abc123_XYZ provided",
      },
    });

    globalThis.fetch = async () => new Response(body, { status: 401 });

    const adapter = new ClaudeAdapter();
    const result = await adapter.validateKey();

    expect(result).toBe(false);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).not.toContain("sk-ant-api03-abc123_XYZ");
    expect(warnings[0]).toContain("[redacted]");
    expect(errors.length).toBe(0);
  });

  it("truncates very long messages to 200 characters", async () => {
    const longMessage = "a".repeat(300);
    const body = JSON.stringify({
      type: "error",
      error: {
        type: "error",
        message: longMessage,
      },
    });

    globalThis.fetch = async () => new Response(body, { status: 400 });

    const adapter = new ClaudeAdapter();
    const result = await adapter.validateKey();

    expect(result).toBe(false);
    expect(warnings.length).toBe(1);
    expect(warnings[0].length).toBeLessThanOrEqual(200);
    expect(errors.length).toBe(0);
  });

  it("handles network error with one warn and no console.error call", async () => {
    globalThis.fetch = async () => {
      throw new Error("Network connection failed");
    };

    const adapter = new ClaudeAdapter();
    const result = await adapter.validateKey();

    expect(result).toBe(false);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("Network connection failed");
    expect(errors.length).toBe(0);
  });
});
